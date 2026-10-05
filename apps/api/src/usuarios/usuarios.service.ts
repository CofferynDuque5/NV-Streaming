import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, Rol, Usuario } from '@nv/db';
import {
  ETIQUETAS_ROL,
  type EstadoUsuario,
  type ListarUsuariosEntrada,
  type Pagina,
  type UsuarioPublico,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { DosPasosService } from '../auth/dos-pasos.service.js';
import { usuarioPublico } from '../auth/presentacion.js';
import { SesionesService } from '../auth/sesiones.service.js';
import { TokensService } from '../auth/tokens.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';

type Tx = Prisma.TransactionClient;

/** Llave del bloqueo que serializa los cambios que pueden dejar al sistema sin administradores. */
const BLOQUEO_ADMINS = 7_411_001;

export interface UsuarioDetalle extends UsuarioPublico {
  invitacionPendiente: boolean;
  sesionesActivas: number;
}

/** Gestión de las cuentas de otras personas (solo administración). */
@Injectable()
export class UsuariosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(DosPasosService) private readonly dosPasos: DosPasosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listar(filtro: ListarUsuariosEntrada): Promise<Pagina<UsuarioPublico>> {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.rol ? { rol: filtro.rol } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
              { correo: { contains: filtro.busqueda.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(usuarioPublico),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<UsuarioDetalle> {
    const usuario = await this.buscar(id);
    const sesionesActivas = (await this.sesiones.listarActivas(id)).length;
    return {
      ...usuarioPublico(usuario),
      invitacionPendiente: usuario.hashContrasena === null,
      sesionesActivas,
    };
  }

  async invitar(
    auth: ContextoAuth,
    entrada: { correo: string; nombre: string; rol: Rol },
    cliente: InfoCliente,
  ): Promise<UsuarioPublico> {
    const existente = await this.prisma.usuario.findUnique({ where: { correo: entrada.correo } });
    if (existente) {
      throw new ErrorApp(409, 'CORREO_EN_USO', 'Ya existe una cuenta con ese correo.', {
        correo: ['Ya existe una cuenta con ese correo.'],
      });
    }
    const { usuario, token } = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { correo: entrada.correo, nombre: entrada.nombre, rol: entrada.rol },
      });
      const token = await this.tokens.emitir(usuario.id, 'invitacion', tx);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'usuario.invitado',
          entidad: 'usuario',
          entidadId: usuario.id,
          despues: { correo: usuario.correo, rol: usuario.rol },
          cliente,
        },
        tx,
      );
      return { usuario, token };
    });
    await this.enviarInvitacion(usuario, token);
    return usuarioPublico(usuario);
  }

  async reenviarInvitacion(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    const usuario = await this.buscar(id);
    if (usuario.hashContrasena !== null) {
      throw new ErrorApp(409, 'INVITACION_ACEPTADA', 'Esta persona ya aceptó la invitación.');
    }
    const token = await this.prisma.$transaction(async (tx) => {
      const token = await this.tokens.emitir(usuario.id, 'invitacion', tx);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'usuario.invitacion_reenviada',
          entidad: 'usuario',
          entidadId: id,
          cliente,
        },
        tx,
      );
      return token;
    });
    await this.enviarInvitacion(usuario, token);
  }

  async cambiarRol(
    auth: ContextoAuth,
    id: string,
    rol: Rol,
    cliente: InfoCliente,
  ): Promise<UsuarioPublico> {
    this.exigirOtraPersona(auth, id);
    const usuario = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquearYBuscar(tx, id);
      if (actual.rol === rol) return actual;
      if (actual.rol === 'admin') await this.exigirOtroAdmin(tx, id);
      const usuario = await tx.usuario.update({ where: { id }, data: { rol } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'usuario.rol_cambiado',
          entidad: 'usuario',
          entidadId: id,
          antes: { rol: actual.rol },
          despues: { rol },
          cliente,
        },
        tx,
      );
      return usuario;
    });
    // Con otro rol cambian los permisos y quizá la exigencia de 2FA: nueva sesión.
    await this.sesiones.revocarTodas(id);
    return usuarioPublico(usuario);
  }

  async cambiarEstado(
    auth: ContextoAuth,
    id: string,
    entrada: { estado: EstadoUsuario; motivo: string },
    cliente: InfoCliente,
  ): Promise<UsuarioPublico> {
    this.exigirOtraPersona(auth, id);
    const usuario = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquearYBuscar(tx, id);
      if (actual.estado === entrada.estado) return actual;
      if (actual.rol === 'admin' && entrada.estado !== 'activo') await this.exigirOtroAdmin(tx, id);
      const usuario = await tx.usuario.update({ where: { id }, data: { estado: entrada.estado } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: entrada.estado === 'activo' ? 'usuario.reactivado' : 'usuario.suspendido',
          entidad: 'usuario',
          entidadId: id,
          antes: { estado: actual.estado },
          despues: { estado: entrada.estado, motivo: entrada.motivo },
          cliente,
        },
        tx,
      );
      return usuario;
    });
    if (usuario.estado !== 'activo') await this.sesiones.revocarTodas(id);
    return usuarioPublico(usuario);
  }

  /** Para quien perdió su teléfono: quita la verificación y la persona la configura de nuevo al entrar. */
  async restablecerDosPasos(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    this.exigirOtraPersona(auth, id);
    const usuario = await this.buscar(id);
    if (!usuario.totpSecreto) {
      throw new ErrorApp(
        409,
        'DOS_PASOS_INACTIVO',
        'Esta persona no tiene activada la verificación en dos pasos.',
      );
    }
    await this.dosPasos.desactivar(id);
    await this.sesiones.revocarTodas(id);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'dos_pasos.restablecido_por_admin',
      entidad: 'usuario',
      entidadId: id,
      cliente,
    });
    await this.correo.enviar(
      usuario.correo,
      'dosPasosDesactivados',
      Plantillas.dosPasosDesactivados(usuario.nombre),
    );
  }

  private async enviarInvitacion(usuario: Usuario, token: string): Promise<void> {
    await this.correo.enviar(
      usuario.correo,
      'invitacion',
      Plantillas.invitacion(
        ETIQUETAS_ROL[usuario.rol],
        this.correo.urlWeb('/invitacion', { token }),
      ),
    );
  }

  private async buscar(id: string): Promise<Usuario> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw Errores.noEncontrado('La persona');
    return usuario;
  }

  private async bloquearYBuscar(tx: Tx, id: string): Promise<Usuario> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BLOQUEO_ADMINS}::bigint)`;
    const usuario = await tx.usuario.findUnique({ where: { id } });
    if (!usuario) throw Errores.noEncontrado('La persona');
    return usuario;
  }

  private async exigirOtroAdmin(tx: Tx, excepto: string): Promise<void> {
    const otros = await tx.usuario.count({
      where: {
        rol: 'admin',
        estado: 'activo',
        id: { not: excepto },
        hashContrasena: { not: null },
      },
    });
    if (otros === 0) {
      throw new ErrorApp(
        409,
        'ULTIMO_ADMINISTRADOR',
        'Debe quedar al menos un administrador activo.',
      );
    }
  }

  private exigirOtraPersona(auth: ContextoAuth, id: string): void {
    if (auth.usuario.id === id) {
      throw new ErrorApp(
        403,
        'ACCION_SOBRE_UNO_MISMO',
        'No puedes cambiar tu propio rol, estado ni verificación desde aquí.',
      );
    }
  }
}
