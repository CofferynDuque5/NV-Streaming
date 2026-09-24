import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  exige2fa,
  type InicioSesionEntrada,
  type RegistroEntrada,
  type SesionActual,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { LIMITES, LimitesService } from '../limites/limites.service.js';
import { hashContrasena, verificarContrasena } from './contrasenas.js';
import { DosPasosService } from './dos-pasos.service.js';
import { sesionActual } from './presentacion.js';
import { pasoPendiente, SesionesService } from './sesiones.service.js';
import { TokensService } from './tokens.service.js';

export interface ResultadoSesion {
  token: string;
  sesion: SesionActual;
}

const credencialesInvalidas = () =>
  new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(DosPasosService) private readonly dosPasos: DosPasosService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  /**
   * Alta de clientes. La respuesta es la misma exista o no el correo, para no
   * revelar qué correos están registrados.
   */
  async registrar(entrada: RegistroEntrada, cliente: InfoCliente): Promise<void> {
    await this.limites.consumir(`registro:ip:${cliente.ip}`, LIMITES.registroIp);
    await this.limites.consumir(`correo:destino:${entrada.correo}`, LIMITES.correoPorDestino);

    const existente = await this.prisma.usuario.findUnique({ where: { correo: entrada.correo } });
    if (existente) {
      await this.correo.enviar(
        existente.correo,
        'cuentaExistente',
        Plantillas.cuentaExistente(existente.nombre, this.correo.urlWeb('/recuperar')),
      );
      return;
    }

    const hash = await hashContrasena(entrada.contrasena);
    const { usuario, token } = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          correo: entrada.correo,
          nombre: entrada.nombre,
          hashContrasena: hash,
          rol: 'cliente',
        },
      });
      // Ficha de cliente: si el equipo ya lo tenía registrado sin acceso, se enlaza.
      // Es seguro porque no podrá entrar hasta confirmar que el correo es suyo.
      const previo = await tx.cliente.findFirst({
        where: { correo: usuario.correo, usuarioId: null },
        orderBy: { creadoEn: 'asc' },
      });
      if (previo) {
        await tx.cliente.update({ where: { id: previo.id }, data: { usuarioId: usuario.id } });
      } else {
        await tx.cliente.create({
          data: {
            usuarioId: usuario.id,
            nombre: usuario.nombre,
            correo: usuario.correo,
            origen: 'registro_web',
          },
        });
      }
      const token = await this.tokens.emitir(usuario.id, 'verificar_correo', tx);
      await this.auditoria.registrar(
        {
          actorId: usuario.id,
          accion: 'usuario.registrado',
          entidad: 'usuario',
          entidadId: usuario.id,
          despues: { correo: usuario.correo, rol: usuario.rol },
          cliente,
        },
        tx,
      );
      return { usuario, token };
    });
    await this.correo.enviar(
      usuario.correo,
      'verificarCorreo',
      Plantillas.verificarCorreo(
        usuario.nombre,
        this.correo.urlWeb('/verificar-correo', { token }),
      ),
    );
  }

  async iniciarSesion(
    entrada: InicioSesionEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoSesion> {
    await this.limites.consumir(`login:ip:${cliente.ip}`, LIMITES.inicioSesionIp);
    await this.limites.consumir(`login:correo:${entrada.correo}`, LIMITES.inicioSesionCorreo);

    const usuario = await this.prisma.usuario.findUnique({ where: { correo: entrada.correo } });
    const valida = await verificarContrasena(usuario?.hashContrasena ?? null, entrada.contrasena);
    if (!usuario || !valida) {
      if (usuario) {
        await this.auditoria.registrar({
          actorId: usuario.id,
          accion: 'sesion.intento_fallido',
          entidad: 'usuario',
          entidadId: usuario.id,
          cliente,
        });
      }
      throw credencialesInvalidas();
    }
    // A partir de aquí la contraseña es correcta: ya se pueden dar motivos concretos.
    if (usuario.estado !== 'activo') {
      throw new ErrorApp(
        403,
        'CUENTA_SUSPENDIDA',
        'Tu cuenta está suspendida. Escribe a soporte para más información.',
      );
    }
    if (!usuario.correoVerificadoEn) {
      throw new ErrorApp(
        403,
        'CORREO_NO_VERIFICADO',
        'Confirma tu correo antes de entrar. Te podemos enviar el enlace otra vez.',
      );
    }
    await this.limites.limpiar(`login:correo:${entrada.correo}`);

    const dosPasosCompleto = !usuario.totpSecreto && !exige2fa(usuario.rol);
    const token = await this.sesiones.crear(usuario, cliente, dosPasosCompleto);
    const actualizado = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAccesoEn: new Date() },
    });
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'sesion.iniciada',
      entidad: 'usuario',
      entidadId: usuario.id,
      despues: { dosPasosPendiente: !dosPasosCompleto },
      cliente,
    });
    return {
      token,
      sesion: sesionActual(actualizado, pasoPendiente(actualizado, { dosPasosCompleto })),
    };
  }

  async cerrarSesion(auth: ContextoAuth, cliente: InfoCliente): Promise<void> {
    await this.sesiones.revocar(auth.sesion.id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'sesion.cerrada',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      cliente,
    });
  }

  /** Completa la verificación en dos pasos de una sesión y la rota. */
  async verificarDosPasos(
    auth: ContextoAuth,
    entrada: { codigo: string } | { codigoRespaldo: string },
    cliente: InfoCliente,
  ): Promise<ResultadoSesion> {
    if (auth.pendiente !== 'verificar_2fa') {
      throw new ErrorApp(
        400,
        'SIN_VERIFICACION_PENDIENTE',
        'Esta sesión no necesita verificación.',
      );
    }
    await this.limites.consumir(`2fa:usuario:${auth.usuario.id}`, LIMITES.dosPasosUsuario);
    const metodo = await this.dosPasos.verificar(auth.usuario, entrada);
    await this.limites.limpiar(`2fa:usuario:${auth.usuario.id}`);
    const token = await this.sesiones.elevar(auth.sesion, auth.usuario, cliente);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: metodo === 'respaldo' ? 'dos_pasos.verificado_con_respaldo' : 'dos_pasos.verificado',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      cliente,
    });
    return { token, sesion: sesionActual(auth.usuario, null) };
  }

  async verificarCorreo(token: string, cliente: InfoCliente): Promise<void> {
    await this.limites.consumir(`tokens:ip:${cliente.ip}`, LIMITES.tokensIp);
    await this.prisma.$transaction(async (tx) => {
      const usuarioId = await this.tokens.consumir(token, 'verificar_correo', tx);
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { correoVerificadoEn: new Date() },
      });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'usuario.correo_verificado',
          entidad: 'usuario',
          entidadId: usuarioId,
          cliente,
        },
        tx,
      );
    });
  }

  /** Reenvía la verificación. Responde igual aunque el correo no exista. */
  async reenviarVerificacion(correo: string, cliente: InfoCliente): Promise<void> {
    await this.limites.consumir(`correo:ip:${cliente.ip}`, LIMITES.correoPorIp);
    await this.limites.consumir(`correo:destino:${correo}`, LIMITES.correoPorDestino);
    const usuario = await this.prisma.usuario.findUnique({ where: { correo } });
    if (!usuario || usuario.correoVerificadoEn || !usuario.hashContrasena) return;
    const token = await this.tokens.emitir(usuario.id, 'verificar_correo');
    await this.correo.enviar(
      usuario.correo,
      'verificarCorreo',
      Plantillas.verificarCorreo(
        usuario.nombre,
        this.correo.urlWeb('/verificar-correo', { token }),
      ),
    );
  }

  /** Envía el enlace de recuperación. Responde igual aunque el correo no exista. */
  async solicitarRecuperacion(correo: string, cliente: InfoCliente): Promise<void> {
    await this.limites.consumir(`correo:ip:${cliente.ip}`, LIMITES.correoPorIp);
    await this.limites.consumir(`correo:destino:${correo}`, LIMITES.correoPorDestino);
    const usuario = await this.prisma.usuario.findUnique({ where: { correo } });
    if (!usuario || usuario.estado !== 'activo' || !usuario.hashContrasena) return;
    const token = await this.tokens.emitir(usuario.id, 'recuperar_contrasena');
    await this.auditoria.registrar({
      actorId: usuario.id,
      accion: 'contrasena.recuperacion_solicitada',
      entidad: 'usuario',
      entidadId: usuario.id,
      cliente,
    });
    await this.correo.enviar(
      usuario.correo,
      'recuperarContrasena',
      Plantillas.recuperarContrasena(usuario.nombre, this.correo.urlWeb('/restablecer', { token })),
    );
  }

  async restablecerContrasena(
    token: string,
    contrasena: string,
    cliente: InfoCliente,
  ): Promise<void> {
    await this.limites.consumir(`tokens:ip:${cliente.ip}`, LIMITES.tokensIp);
    const hash = await hashContrasena(contrasena);
    const usuario = await this.prisma.$transaction(async (tx) => {
      const usuarioId = await this.tokens.consumir(token, 'recuperar_contrasena', tx);
      // Quien recibe el enlace demuestra que controla el correo: queda verificado.
      const usuario = await tx.usuario.update({
        where: { id: usuarioId },
        data: { hashContrasena: hash, correoVerificadoEn: new Date() },
      });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'contrasena.restablecida',
          entidad: 'usuario',
          entidadId: usuarioId,
          cliente,
        },
        tx,
      );
      return usuario;
    });
    await this.sesiones.revocarTodas(usuario.id);
    await this.limites.limpiar(`login:correo:${usuario.correo}`);
    await this.correo.enviar(
      usuario.correo,
      'contrasenaCambiada',
      Plantillas.contrasenaCambiada(usuario.nombre),
    );
  }

  async aceptarInvitacion(
    entrada: { token: string; nombre: string; contrasena: string },
    cliente: InfoCliente,
  ): Promise<void> {
    await this.limites.consumir(`tokens:ip:${cliente.ip}`, LIMITES.tokensIp);
    const hash = await hashContrasena(entrada.contrasena);
    await this.prisma.$transaction(async (tx) => {
      const usuarioId = await this.tokens.consumir(entrada.token, 'invitacion', tx);
      const usuario = await tx.usuario.update({
        where: { id: usuarioId },
        data: { hashContrasena: hash, nombre: entrada.nombre, correoVerificadoEn: new Date() },
      });
      await this.auditoria.registrar(
        {
          actorId: usuarioId,
          accion: 'usuario.invitacion_aceptada',
          entidad: 'usuario',
          entidadId: usuarioId,
          despues: { rol: usuario.rol },
          cliente,
        },
        tx,
      );
    });
  }
}
