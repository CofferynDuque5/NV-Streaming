import { Inject, Injectable } from '@nestjs/common';
import type { EstadoRevendedor, Prisma, PrismaClient, Revendedor } from '@nv/db';
import type {
  ActualizarRevendedorEntrada,
  AprobarRevendedorEntrada,
  ListarRevendedoresEntrada,
  MiSolicitudRevendedor,
  Pagina,
  ResumenProgramaRevendedores,
  RevendedorDetalle,
  RevendedorResumen,
  SolicitudRevendedorEntrada,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { SesionesService } from '../auth/sesiones.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO } from '../dinero/dinero.js';
import { LimitesService } from '../limites/limites.service.js';
import { bloquearRevendedor, type Tx } from './libro-mayor.js';
import { INCLUIR_REVENDEDOR, miSolicitud, revendedorResumen } from './presentacion.js';

/** Solicitudes por persona y día (reenviar tras un rechazo cuenta como otra). */
const LIMITE_SOLICITUDES = { maximo: 5, ventanaSegundos: 24 * 3600 };

const transicionInvalida = (mensaje: string) =>
  new ErrorApp(409, 'TRANSICION_NO_PERMITIDA', mensaje);

/** Inicio del mes en curso en Venezuela (UTC−4). */
export function inicioMesVenezuela(ahora = new Date()): Date {
  const local = new Date(ahora.getTime() - 4 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + 4 * 3600_000);
}

/**
 * Solicitudes y ciclo de vida de los revendedores: un cliente solicita, la
 * administración aprueba (asignando nivel y cambiando su rol), rechaza,
 * suspende o reactiva. Cada transición bloquea la fila y queda auditada.
 */
@Injectable()
export class RevendedoresService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  // ── Solicitud (cliente) ────────────────────────────────────────────────────

  async miSolicitud(auth: ContextoAuth): Promise<MiSolicitudRevendedor | null> {
    const r = await this.prisma.revendedor.findUnique({ where: { usuarioId: auth.usuario.id } });
    return r ? miSolicitud(r) : null;
  }

  /** Una ficha por persona. Tras un rechazo puede volver a solicitar: la ficha vuelve a revisión. */
  async solicitar(
    auth: ContextoAuth,
    e: SolicitudRevendedorEntrada,
    cliente: InfoCliente,
  ): Promise<MiSolicitudRevendedor> {
    await this.limites.consumir(`revendedor:solicitud:${auth.usuario.id}`, LIMITE_SOLICITUDES);
    const datos = {
      nombreComercial: e.nombreComercial,
      documento: e.documento ?? null,
      telefono: e.telefono ?? null,
      pais: e.pais,
      mensaje: e.mensaje ?? null,
    };
    const r = await this.prisma.$transaction(async (tx) => {
      // Serializa dos envíos simultáneos de la misma persona.
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${auth.usuario.id}::uuid FOR UPDATE`;
      const previa = await tx.revendedor.findUnique({ where: { usuarioId: auth.usuario.id } });
      let r: Revendedor;
      if (previa) {
        if (previa.estado !== 'rechazado') {
          throw new ErrorApp(
            409,
            'SOLICITUD_EXISTENTE',
            previa.estado === 'solicitud'
              ? 'Ya enviaste tu solicitud: la estamos revisando.'
              : 'Tu cuenta ya es de revendedor.',
          );
        }
        r = await tx.revendedor.update({
          where: { id: previa.id },
          data: {
            ...datos,
            estado: 'solicitud',
            motivoEstado: null,
            revisadoPorId: null,
            revisadoEn: null,
          },
        });
      } else {
        r = await tx.revendedor.create({ data: { ...datos, usuarioId: auth.usuario.id } });
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: previa ? 'revendedor.solicitud_reenviada' : 'revendedor.solicitado',
          entidad: 'revendedor',
          entidadId: r.id,
          ...(previa ? { antes: { estado: previa.estado, motivo: previa.motivoEstado } } : {}),
          despues: { ...datos, estado: 'solicitud' },
          cliente,
        },
        tx,
      );
      return r;
    });
    return miSolicitud(r);
  }

  // ── Consulta (equipo) ──────────────────────────────────────────────────────

  async listar(filtro: ListarRevendedoresEntrada): Promise<Pagina<RevendedorResumen>> {
    const where: Prisma.RevendedorWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { nombreComercial: { contains: filtro.busqueda, mode: 'insensitive' } },
              { documento: { contains: filtro.busqueda, mode: 'insensitive' } },
              { usuario: { correo: { contains: filtro.busqueda.toLowerCase() } } },
              { usuario: { nombre: { contains: filtro.busqueda, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.revendedor.count({ where }),
      this.prisma.revendedor.findMany({
        where,
        include: INCLUIR_REVENDEDOR,
        // Las solicitudes se atienden por orden de llegada.
        orderBy:
          filtro.estado === 'solicitud'
            ? [{ creadoEn: 'asc' }, { id: 'asc' }]
            : [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(revendedorResumen),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string, tx: Tx | PrismaClient = this.prisma): Promise<RevendedorDetalle> {
    const r = await tx.revendedor.findUnique({
      where: { id },
      include: {
        ...INCLUIR_REVENDEDOR,
        revisadoPor: { select: { id: true, nombre: true } },
        _count: {
          select: {
            clientes: true,
            compras: { where: { estado: 'completada' } },
            recargas: { where: { estado: 'en_revision' } },
            suscripciones: { where: { estado: { in: ['activa', 'en_gracia'] } } },
          },
        },
      },
    });
    if (!r) throw Errores.noEncontrado('El revendedor');
    return {
      ...revendedorResumen(r),
      documento: r.documento,
      telefono: r.telefono,
      mensaje: r.mensaje,
      motivoEstado: r.motivoEstado,
      revisadoPor: r.revisadoPor,
      clientes: r._count.clientes,
      suscripcionesActivas: r._count.suscripciones,
      compras: r._count.compras,
      recargasEnRevision: r._count.recargas,
    };
  }

  async resumenPrograma(ahora = new Date()): Promise<ResumenProgramaRevendedores> {
    const inicioMes = inicioMesVenezuela(ahora);
    const [porEstado, recargasEnRevision, recargasMes, saldo, comprasMes] = await Promise.all([
      this.prisma.revendedor.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.recargaSaldo.count({ where: { estado: 'en_revision' } }),
      this.prisma.recargaSaldo.aggregate({
        where: { estado: 'confirmada', revisadoEn: { gte: inicioMes } },
        _sum: { montoUsd: true },
      }),
      this.prisma.revendedor.aggregate({ _sum: { saldoUsd: true } }),
      this.prisma.compraRevendedor.count({
        where: { estado: 'completada', creadoEn: { gte: inicioMes } },
      }),
    ]);
    const cuenta = (e: EstadoRevendedor) => porEstado.find((f) => f.estado === e)?._count._all ?? 0;
    return {
      solicitudes: cuenta('solicitud'),
      aprobados: cuenta('aprobado'),
      suspendidos: cuenta('suspendido'),
      recargasEnRevision,
      recargasMesUsd: (recargasMes._sum.montoUsd ?? CERO).toFixed(2),
      saldoTotalUsd: (saldo._sum.saldoUsd ?? CERO).toFixed(2),
      comprasMes,
    };
  }

  // ── Gestión (administración) ───────────────────────────────────────────────

  /**
   * Aprueba la solicitud: asigna el nivel, cambia el rol de la cuenta a
   * revendedor y cierra sus sesiones (al volver a entrar deberá configurar la
   * verificación en dos pasos). Su ficha de cliente y sus suscripciones
   * propias se conservan tal cual.
   */
  async aprobar(
    auth: ContextoAuth,
    id: string,
    e: AprobarRevendedorEntrada,
    cliente: InfoCliente,
  ): Promise<RevendedorDetalle> {
    const usuarioId = await this.prisma.$transaction(async (tx) => {
      const r = await bloquearRevendedor(tx, id);
      if (r.estado !== 'solicitud') {
        throw transicionInvalida('Solo se aprueban solicitudes pendientes.');
      }
      await this.exigirNivelActivo(tx, e.nivelId);
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${r.usuarioId}::uuid FOR UPDATE`;
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: r.usuarioId } });
      if (usuario.rol !== 'cliente' || usuario.estado !== 'activo') {
        throw new ErrorApp(
          409,
          'CUENTA_NO_APTA',
          'La cuenta de esta persona ya no es de un cliente activo. Revísala en Equipo y usuarios.',
        );
      }
      const ahora = new Date();
      await tx.revendedor.update({
        where: { id },
        data: {
          estado: 'aprobado',
          nivelId: e.nivelId,
          limiteDiarioCompras: e.limiteDiarioCompras ?? null,
          motivoEstado: null,
          revisadoPorId: auth.usuario.id,
          revisadoEn: ahora,
        },
      });
      await tx.usuario.update({ where: { id: usuario.id }, data: { rol: 'revendedor' } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'revendedor.aprobado',
          entidad: 'revendedor',
          entidadId: id,
          antes: { estado: r.estado },
          despues: {
            estado: 'aprobado',
            nivelId: e.nivelId,
            limiteDiarioCompras: e.limiteDiarioCompras ?? null,
          },
          cliente,
        },
        tx,
      );
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'usuario.rol_cambiado',
          entidad: 'usuario',
          entidadId: usuario.id,
          antes: { rol: usuario.rol },
          despues: { rol: 'revendedor', motivo: 'Solicitud de revendedor aprobada' },
          cliente,
        },
        tx,
      );
      return usuario.id;
    });
    // Con el rol nuevo cambian los permisos y se exige la verificación en dos pasos.
    await this.sesiones.revocarTodas(usuarioId);
    return this.obtener(id);
  }

  rechazar(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    return this.cambiarEstado(auth, id, cliente, {
      de: ['solicitud'],
      a: 'rechazado',
      motivo,
      accion: 'revendedor.rechazado',
      error: 'Solo se rechazan solicitudes pendientes.',
    });
  }

  suspender(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    return this.cambiarEstado(auth, id, cliente, {
      de: ['aprobado'],
      a: 'suspendido',
      motivo,
      accion: 'revendedor.suspendido',
      error: 'Solo se suspenden revendedores aprobados.',
    });
  }

  reactivar(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    return this.cambiarEstado(auth, id, cliente, {
      de: ['suspendido'],
      a: 'aprobado',
      motivo,
      accion: 'revendedor.reactivado',
      error: 'Solo se reactivan revendedores suspendidos.',
    });
  }

  /** Cambia el nivel (y con él los precios) o el límite diario de compras. */
  async actualizar(
    auth: ContextoAuth,
    id: string,
    e: ActualizarRevendedorEntrada,
    cliente: InfoCliente,
  ): Promise<RevendedorDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const r = await bloquearRevendedor(tx, id);
      if (r.estado !== 'aprobado' && r.estado !== 'suspendido') {
        throw transicionInvalida('Primero aprueba la solicitud.');
      }
      if (e.nivelId !== undefined && e.nivelId !== r.nivelId) {
        await this.exigirNivelActivo(tx, e.nivelId);
      }
      await tx.revendedor.update({
        where: { id },
        data: {
          ...(e.nivelId !== undefined ? { nivelId: e.nivelId } : {}),
          ...(e.limiteDiarioCompras !== undefined
            ? { limiteDiarioCompras: e.limiteDiarioCompras }
            : {}),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'revendedor.actualizado',
          entidad: 'revendedor',
          entidadId: id,
          antes: { nivelId: r.nivelId, limiteDiarioCompras: r.limiteDiarioCompras },
          despues: e as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  private async cambiarEstado(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
    t: {
      de: EstadoRevendedor[];
      a: EstadoRevendedor;
      motivo: string;
      accion: string;
      error: string;
    },
  ): Promise<RevendedorDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const r = await bloquearRevendedor(tx, id);
      if (!t.de.includes(r.estado)) throw transicionInvalida(t.error);
      await tx.revendedor.update({
        where: { id },
        data: {
          estado: t.a,
          // Al reactivar se borra el motivo de la suspensión (queda en la auditoría).
          motivoEstado: t.a === 'aprobado' ? null : t.motivo,
          revisadoPorId: auth.usuario.id,
          revisadoEn: new Date(),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: t.accion,
          entidad: 'revendedor',
          entidadId: id,
          antes: { estado: r.estado },
          despues: { estado: t.a, motivo: t.motivo },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  private async exigirNivelActivo(tx: Tx, nivelId: string) {
    const nivel = await tx.nivelRevendedor.findUnique({ where: { id: nivelId } });
    if (!nivel || !nivel.activo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige un nivel activo.', {
        nivelId: ['Elige un nivel activo.'],
      });
    }
  }
}
