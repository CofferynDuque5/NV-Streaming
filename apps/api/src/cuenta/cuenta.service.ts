import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import { exige2fa, type SesionActual, type SesionListada, type UsuarioPublico } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { hashContrasena, verificarContrasena } from '../auth/contrasenas.js';
import { DosPasosService } from '../auth/dos-pasos.service.js';
import { sesionActual, sesionListada, usuarioPublico } from '../auth/presentacion.js';
import { SesionesService } from '../auth/sesiones.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { LIMITES, LimitesService } from '../limites/limites.service.js';

const contrasenaIncorrecta = () =>
  new ErrorApp(400, 'CONTRASENA_INCORRECTA', 'La contraseña no es correcta.', {
    contrasena: ['La contraseña no es correcta.'],
  });

/** Acciones de cada persona sobre su propia cuenta. */
@Injectable()
export class CuentaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(DosPasosService) private readonly dosPasos: DosPasosService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listarSesiones(auth: ContextoAuth): Promise<SesionListada[]> {
    const activas = await this.sesiones.listarActivas(auth.usuario.id);
    return activas.map((s) => sesionListada(s, auth.sesion.id));
  }

  async cerrarSesion(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    const sesion = await this.prisma.sesion.findFirst({
      where: { id, usuarioId: auth.usuario.id, revocadaEn: null },
    });
    if (!sesion) throw Errores.noEncontrado('La sesión');
    await this.sesiones.revocar(sesion.id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'sesion.cerrada_remota',
      entidad: 'sesion',
      entidadId: sesion.id,
      cliente,
    });
  }

  async cerrarOtras(auth: ContextoAuth, cliente: InfoCliente): Promise<number> {
    const cerradas = await this.sesiones.revocarTodas(auth.usuario.id, auth.sesion.id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'sesion.cerradas_otras',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      despues: { cerradas },
      cliente,
    });
    return cerradas;
  }

  async actualizarPerfil(
    auth: ContextoAuth,
    nombre: string,
    cliente: InfoCliente,
  ): Promise<UsuarioPublico> {
    const usuario = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.update({ where: { id: auth.usuario.id }, data: { nombre } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'usuario.perfil_actualizado',
          entidad: 'usuario',
          entidadId: auth.usuario.id,
          antes: { nombre: auth.usuario.nombre },
          despues: { nombre },
          cliente,
        },
        tx,
      );
      return usuario;
    });
    return usuarioPublico(usuario);
  }

  /** Cambia la contraseña y cierra las demás sesiones. */
  async cambiarContrasena(
    auth: ContextoAuth,
    entrada: { actual: string; nueva: string },
    cliente: InfoCliente,
  ): Promise<void> {
    await this.limites.consumir(`contrasena:usuario:${auth.usuario.id}`, LIMITES.contrasenaUsuario);
    if (!(await verificarContrasena(auth.usuario.hashContrasena, entrada.actual))) {
      throw new ErrorApp(400, 'CONTRASENA_INCORRECTA', 'La contraseña actual no es correcta.', {
        actual: ['La contraseña actual no es correcta.'],
      });
    }
    const hash = await hashContrasena(entrada.nueva);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: auth.usuario.id }, data: { hashContrasena: hash } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'contrasena.cambiada',
          entidad: 'usuario',
          entidadId: auth.usuario.id,
          cliente,
        },
        tx,
      );
    });
    await this.sesiones.revocarTodas(auth.usuario.id, auth.sesion.id);
    await this.correo.enviar(
      auth.usuario.correo,
      'contrasenaCambiada',
      Plantillas.contrasenaCambiada(auth.usuario.nombre),
    );
  }

  /** Solo se puede configurar si la sesión está completa o le falta justamente configurarlo. */
  async iniciarDosPasos(auth: ContextoAuth) {
    this.exigirPuedeConfigurar(auth);
    if (auth.usuario.totpSecreto) {
      throw new ErrorApp(
        409,
        'DOS_PASOS_YA_ACTIVO',
        'La verificación en dos pasos ya está activada.',
      );
    }
    return this.dosPasos.iniciar(auth.usuario);
  }

  /**
   * Activa la verificación en dos pasos. Si la sesión estaba a la espera de
   * configurarla, se sustituye por una sesión completa (nuevo token).
   */
  async confirmarDosPasos(
    auth: ContextoAuth,
    codigo: string,
    cliente: InfoCliente,
  ): Promise<{ codigosRespaldo: string[]; sesion: SesionActual; token: string | null }> {
    this.exigirPuedeConfigurar(auth);
    if (auth.usuario.totpSecreto) {
      throw new ErrorApp(
        409,
        'DOS_PASOS_YA_ACTIVO',
        'La verificación en dos pasos ya está activada.',
      );
    }
    await this.limites.consumir(`2fa:usuario:${auth.usuario.id}`, LIMITES.dosPasosUsuario);
    const codigosRespaldo = await this.dosPasos.confirmar(auth.usuario, codigo);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'dos_pasos.activado',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      cliente,
    });
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: auth.usuario.id } });
    // Las demás sesiones se abrieron sin segundo factor: se cierran.
    await this.sesiones.revocarTodas(usuario.id, auth.sesion.id);
    const token =
      auth.pendiente === 'configurar_2fa'
        ? await this.sesiones.elevar(auth.sesion, usuario, cliente)
        : null;
    return { codigosRespaldo, sesion: sesionActual(usuario, null), token };
  }

  async desactivarDosPasos(
    auth: ContextoAuth,
    entrada: { contrasena: string; codigo: string },
    cliente: InfoCliente,
  ): Promise<void> {
    if (exige2fa(auth.usuario.rol)) {
      throw new ErrorApp(
        403,
        'DOS_PASOS_OBLIGATORIO',
        'Tu rol exige la verificación en dos pasos. Si perdiste el acceso a tu aplicación, pide a un administrador que la restablezca.',
      );
    }
    await this.limites.consumir(`2fa:usuario:${auth.usuario.id}`, LIMITES.dosPasosUsuario);
    if (!(await verificarContrasena(auth.usuario.hashContrasena, entrada.contrasena)))
      throw contrasenaIncorrecta();
    await this.dosPasos.verificar(auth.usuario, { codigo: entrada.codigo });
    await this.dosPasos.desactivar(auth.usuario.id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'dos_pasos.desactivado',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      cliente,
    });
    await this.correo.enviar(
      auth.usuario.correo,
      'dosPasosDesactivados',
      Plantillas.dosPasosDesactivados(auth.usuario.nombre),
    );
  }

  async regenerarCodigos(
    auth: ContextoAuth,
    codigo: string,
    cliente: InfoCliente,
  ): Promise<string[]> {
    await this.limites.consumir(`2fa:usuario:${auth.usuario.id}`, LIMITES.dosPasosUsuario);
    await this.dosPasos.verificar(auth.usuario, { codigo });
    const codigos = await this.dosPasos.regenerarCodigos(auth.usuario.id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'dos_pasos.codigos_regenerados',
      entidad: 'usuario',
      entidadId: auth.usuario.id,
      cliente,
    });
    return codigos;
  }

  async estadoDosPasos(auth: ContextoAuth) {
    return {
      activo: auth.usuario.totpSecreto !== null,
      obligatorio: exige2fa(auth.usuario.rol),
      activadoEn: auth.usuario.totpActivadoEn?.toISOString() ?? null,
      codigosRestantes: auth.usuario.totpSecreto
        ? await this.dosPasos.codigosRestantes(auth.usuario.id)
        : 0,
    };
  }

  private exigirPuedeConfigurar(auth: ContextoAuth): void {
    if (auth.pendiente === 'verificar_2fa') throw Errores.pasoPendiente(auth.pendiente);
  }
}
