import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, TipoToken } from '@nv/db';
import { sha256, tokenAleatorio } from '../comun/cripto.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

const DURACION_MINUTOS: Record<TipoToken, number> = {
  verificar_correo: 24 * 60,
  recuperar_contrasena: 30,
  invitacion: 72 * 60,
};

type ClienteTx = Pick<PrismaClient, 'tokenUnUso'>;

/** Tokens de un solo uso enviados por correo. Solo se guarda su hash. */
@Injectable()
export class TokensService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Emite un token nuevo e invalida los anteriores del mismo tipo. */
  async emitir(usuarioId: string, tipo: TipoToken, tx: ClienteTx = this.prisma): Promise<string> {
    const ahora = new Date();
    await tx.tokenUnUso.updateMany({
      where: { usuarioId, tipo, usadoEn: null },
      data: { usadoEn: ahora },
    });
    const token = tokenAleatorio();
    await tx.tokenUnUso.create({
      data: {
        usuarioId,
        tipo,
        tokenHash: sha256(token),
        expiraEn: new Date(ahora.getTime() + DURACION_MINUTOS[tipo] * 60_000),
      },
    });
    return token;
  }

  /** Marca el token como usado de forma atómica y devuelve su usuario. */
  async consumir(token: string, tipo: TipoToken, tx: ClienteTx = this.prisma): Promise<string> {
    const tokenHash = sha256(token);
    const { count } = await tx.tokenUnUso.updateMany({
      where: { tokenHash, tipo, usadoEn: null, expiraEn: { gt: new Date() } },
      data: { usadoEn: new Date() },
    });
    if (count !== 1) {
      throw new ErrorApp(
        400,
        'ENLACE_INVALIDO',
        'El enlace no es válido o ya venció. Solicita uno nuevo.',
      );
    }
    const fila = await tx.tokenUnUso.findUniqueOrThrow({ where: { tokenHash } });
    return fila.usuarioId;
  }
}
