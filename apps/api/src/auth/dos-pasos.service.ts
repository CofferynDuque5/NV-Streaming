import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, Usuario } from '@nv/db';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { Cifrador, codigoRespaldo, sha256 } from '../comun/cripto.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

const EMISOR = 'NV Streaming';
const CONTEXTO_TOTP = 'usuarios.totp_secreto';
export const CANTIDAD_CODIGOS_RESPALDO = 10;

/** Verificación en dos pasos con aplicaciones de autenticación (TOTP) y códigos de respaldo. */
@Injectable()
export class DosPasosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
  ) {}

  /** Genera un secreto nuevo pendiente de confirmar y su código QR. */
  async iniciar(usuario: Usuario): Promise<{ secreto: string; uri: string; qr: string }> {
    const secreto = generateSecret();
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        totpSecretoPendiente: this.cifrador.cifrar(secreto, CONTEXTO_TOTP + ':' + usuario.id),
      },
    });
    const uri = generateURI({ issuer: EMISOR, label: usuario.correo, secret: secreto });
    const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secreto, uri, qr };
  }

  /** Confirma el secreto pendiente con un código y devuelve los códigos de respaldo. */
  async confirmar(usuario: Usuario, codigo: string): Promise<string[]> {
    if (!usuario.totpSecretoPendiente) {
      throw new ErrorApp(400, 'SIN_CONFIGURACION_PENDIENTE', 'Primero genera un código QR nuevo.');
    }
    const secreto = this.cifrador.descifrar(
      usuario.totpSecretoPendiente,
      CONTEXTO_TOTP + ':' + usuario.id,
    );
    const paso = await this.comprobar(secreto, codigo, null);
    if (paso === null) throw codigoIncorrecto();

    const codigos = Array.from({ length: CANTIDAD_CODIGOS_RESPALDO }, codigoRespaldo);
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          totpSecreto: usuario.totpSecretoPendiente,
          totpSecretoPendiente: null,
          totpActivadoEn: new Date(),
          totpUltimoPaso: BigInt(paso),
        },
      }),
      this.prisma.codigoRespaldo.deleteMany({ where: { usuarioId: usuario.id } }),
      this.prisma.codigoRespaldo.createMany({
        data: codigos.map((c) => ({ usuarioId: usuario.id, codigoHash: sha256(c) })),
      }),
    ]);
    return codigos;
  }

  /** Verifica un código TOTP (sin permitir reutilizarlo) o un código de respaldo. */
  async verificar(
    usuario: Usuario,
    entrada: { codigo: string } | { codigoRespaldo: string },
  ): Promise<'totp' | 'respaldo'> {
    if (!usuario.totpSecreto)
      throw new ErrorApp(
        400,
        'DOS_PASOS_INACTIVO',
        'La verificación en dos pasos no está activada.',
      );

    if ('codigoRespaldo' in entrada) {
      const { count } = await this.prisma.codigoRespaldo.updateMany({
        where: { usuarioId: usuario.id, codigoHash: sha256(entrada.codigoRespaldo), usadoEn: null },
        data: { usadoEn: new Date() },
      });
      if (count !== 1)
        throw new ErrorApp(
          400,
          'CODIGO_INCORRECTO',
          'El código de respaldo no es válido o ya se usó.',
        );
      return 'respaldo';
    }

    const secreto = this.cifrador.descifrar(usuario.totpSecreto, CONTEXTO_TOTP + ':' + usuario.id);
    const paso = await this.comprobar(secreto, entrada.codigo, usuario.totpUltimoPaso);
    if (paso === null) throw codigoIncorrecto();
    // Condición sobre el último paso: dos peticiones simultáneas con el mismo código no pasan.
    const { count } = await this.prisma.usuario.updateMany({
      where: {
        id: usuario.id,
        OR: [{ totpUltimoPaso: null }, { totpUltimoPaso: { lt: BigInt(paso) } }],
      },
      data: { totpUltimoPaso: BigInt(paso) },
    });
    if (count !== 1) throw codigoIncorrecto();
    return 'totp';
  }

  async desactivar(usuarioId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          totpSecreto: null,
          totpSecretoPendiente: null,
          totpActivadoEn: null,
          totpUltimoPaso: null,
        },
      }),
      this.prisma.codigoRespaldo.deleteMany({ where: { usuarioId } }),
    ]);
  }

  async regenerarCodigos(usuarioId: string): Promise<string[]> {
    const codigos = Array.from({ length: CANTIDAD_CODIGOS_RESPALDO }, codigoRespaldo);
    await this.prisma.$transaction([
      this.prisma.codigoRespaldo.deleteMany({ where: { usuarioId } }),
      this.prisma.codigoRespaldo.createMany({
        data: codigos.map((c) => ({ usuarioId, codigoHash: sha256(c) })),
      }),
    ]);
    return codigos;
  }

  async codigosRestantes(usuarioId: string): Promise<number> {
    return this.prisma.codigoRespaldo.count({ where: { usuarioId, usadoEn: null } });
  }

  /** Devuelve el paso de tiempo aceptado o null. Tolera ±30 s de desfase de reloj. */
  private async comprobar(
    secreto: string,
    codigo: string,
    ultimoPaso: bigint | null,
  ): Promise<number | null> {
    const r = await verify({
      secret: secreto,
      token: codigo,
      epochTolerance: 30,
      ...(ultimoPaso !== null ? { afterTimeStep: Number(ultimoPaso) } : {}),
    }).catch(() => null);
    return r && r.valid && 'timeStep' in r ? r.timeStep : null;
  }
}

function codigoIncorrecto() {
  return new ErrorApp(
    400,
    'CODIGO_INCORRECTO',
    'El código no es correcto. Revisa la hora de tu teléfono e inténtalo de nuevo.',
  );
}
