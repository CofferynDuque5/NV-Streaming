import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type CrearNotaEntrada,
  type EditarNotaEntrada,
  type ListarNotasEntrada,
  type NotaPublica,
  ROLES_EQUIPO,
} from '@nv/shared';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';

export const INCLUIR_NOTA = {
  autor: { select: { id: true, nombre: true } },
  asignadaA: { select: { id: true, nombre: true } },
  cliente: { select: { id: true, nombre: true } },
} as const satisfies Prisma.NotaInternaInclude;

type FilaNota = Prisma.NotaInternaGetPayload<{ include: typeof INCLUIR_NOTA }>;

export function notaPublica(n: FilaNota): NotaPublica {
  return {
    id: n.id,
    texto: n.texto,
    tipo: n.tipo,
    cliente: n.cliente,
    autor: n.autor,
    asignadaA: n.asignadaA,
    avisarEn: iso(n.avisarEn),
    diaPago: n.diaPago,
    hechaEn: iso(n.hechaEn),
    creadoEn: iso(n.creadoEn)!,
  };
}

const MAX_NOTAS = 300;

/**
 * Notas y pendientes del equipo (la sección «Notas» del Gestor): de un cliente o
 * generales, con tipo, aviso a una fecha y hora, y marca de hecha. Ventas solo
 * ve las de su cartera y las generales.
 */
@Injectable()
export class NotasService {
  private readonly logger = new Logger('Notas');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  private alcance(auth: ContextoAuth): Prisma.NotaInternaWhereInput {
    const clientes = alcanceClientes(auth);
    // Equipo completo: todas. Si no, las generales, las de su cartera y las que le asignaron.
    if (Object.keys(clientes).length === 0) return {};
    return {
      OR: [{ clienteId: null }, { cliente: { is: clientes } }, { asignadaAId: auth.usuario.id }],
    };
  }

  private vista(
    auth: ContextoAuth,
    vista: ListarNotasEntrada['vista'],
  ): Prisma.NotaInternaWhereInput {
    if (vista === 'mias') return { asignadaAId: auth.usuario.id };
    if (vista === 'delegadas') {
      return {
        autorId: auth.usuario.id,
        asignadaAId: { not: null },
        NOT: { asignadaAId: auth.usuario.id },
      };
    }
    return {};
  }

  /** Solo se delega a alguien activo del equipo. */
  private async exigirAsignable(tx: Prisma.TransactionClient, usuarioId: string) {
    const u = await tx.usuario.findFirst({
      where: { id: usuarioId, rol: { in: [...ROLES_EQUIPO] }, estado: 'activo' },
      select: { id: true },
    });
    if (!u) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige a alguien activo del equipo.', {
        asignadaAId: ['Elige a alguien activo del equipo.'],
      });
    }
  }

  /** Avisa por correo a quien recibe la tarea (no a quien se la asigna a sí mismo). */
  private async avisarAsignada(auth: ContextoAuth, n: NotaPublica): Promise<void> {
    if (!n.asignadaA || n.asignadaA.id === auth.usuario.id) return;
    const url = this.correo.urlWeb('/admin/notas', { vista: 'mias' });
    const cuando = n.avisarEn
      ? new Intl.DateTimeFormat('es', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'America/Caracas',
        }).format(new Date(n.avisarEn))
      : null;
    try {
      await this.avisos.avisar({
        plantilla: 'tareaAsignada',
        destinatario: { usuarioId: n.asignadaA.id },
        claveUnica: `tarea_asignada:${n.id}:${n.asignadaA.id}`,
        automatizacion: null,
        entidad: { tipo: 'nota', id: n.id },
        canales: ['correo'],
        contenido: (nombre) => ({
          correo: Plantillas.tareaAsignada(nombre, n.autor.nombre, n.texto, cuando, url),
        }),
      });
    } catch (err) {
      // El aviso no deshace la tarea: queda en el registro de notificaciones.
      this.logger.warn(`No se pudo avisar la tarea ${n.id}: ${String(err)}`);
    }
  }

  /** Miembros activos del equipo, para delegar tareas. */
  equipo(): Promise<{ id: string; nombre: string }[]> {
    return this.prisma.usuario.findMany({
      where: { rol: { in: [...ROLES_EQUIPO] }, estado: 'activo' },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
      take: 200,
    });
  }

  /** Tareas pendientes asignadas a quien consulta. */
  misTareas(auth: ContextoAuth) {
    return this.prisma.notaInterna.count({
      where: { asignadaAId: auth.usuario.id, hechaEn: null },
    });
  }

  async listar(auth: ContextoAuth, f: ListarNotasEntrada): Promise<NotaPublica[]> {
    const pendientes = f.estado === 'pendientes';
    const filas = await this.prisma.notaInterna.findMany({
      where: {
        AND: [
          this.alcance(auth),
          { hechaEn: pendientes ? null : { not: null } },
          f.clienteId ? { clienteId: f.clienteId } : {},
          this.vista(auth, f.vista),
        ],
      },
      include: INCLUIR_NOTA,
      orderBy: pendientes
        ? [{ avisarEn: { sort: 'asc', nulls: 'last' } }, { creadoEn: 'desc' }]
        : [{ hechaEn: 'desc' }],
      take: MAX_NOTAS,
    });
    return filas.map(notaPublica);
  }

  /** Pendientes cuyo aviso ya llegó. */
  porAvisar(auth: ContextoAuth, ahora = new Date()) {
    return this.prisma.notaInterna.count({
      where: { AND: [this.alcance(auth), { hechaEn: null, avisarEn: { lte: ahora } }] },
    });
  }

  async crear(auth: ContextoAuth, e: CrearNotaEntrada, cliente: InfoCliente): Promise<NotaPublica> {
    const nota = await this.prisma.$transaction(async (tx) => {
      if (e.asignadaAId) await this.exigirAsignable(tx, e.asignadaAId);
      if (e.clienteId) {
        const c = await tx.cliente.findFirst({
          where: { AND: [{ id: e.clienteId }, alcanceClientes(auth)] },
          select: { id: true },
        });
        if (!c) throw Errores.noEncontrado('El cliente');
      }
      const n = await tx.notaInterna.create({
        data: {
          clienteId: e.clienteId ?? null,
          autorId: auth.usuario.id,
          asignadaAId: e.asignadaAId ?? null,
          tipo: e.tipo,
          texto: e.texto,
          avisarEn: e.avisarEn ? new Date(e.avisarEn) : null,
          diaPago: e.tipo === 'paga_dia' ? (e.diaPago ?? null) : null,
        },
        include: INCLUIR_NOTA,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nota.creada',
          entidad: 'nota',
          entidadId: n.id,
          despues: {
            tipo: n.tipo,
            clienteId: n.clienteId,
            asignadaAId: n.asignadaAId,
            avisarEn: iso(n.avisarEn),
          },
          cliente,
        },
        tx,
      );
      return notaPublica(n);
    });
    await this.avisarAsignada(auth, nota);
    return nota;
  }

  private async exigir(auth: ContextoAuth, id: string, tx: Prisma.TransactionClient) {
    const n = await tx.notaInterna.findFirst({ where: { AND: [{ id }, this.alcance(auth)] } });
    if (!n) throw Errores.noEncontrado('La nota');
    return n;
  }

  async editar(
    auth: ContextoAuth,
    id: string,
    e: EditarNotaEntrada,
    cliente: InfoCliente,
  ): Promise<NotaPublica> {
    let reasignada = false;
    const nota = await this.prisma.$transaction(async (tx) => {
      const antes = await this.exigir(auth, id, tx);
      if (e.asignadaAId) await this.exigirAsignable(tx, e.asignadaAId);
      reasignada = e.asignadaAId !== undefined && e.asignadaAId !== antes.asignadaAId;
      const tipo = e.tipo ?? antes.tipo;
      const diaPago = e.diaPago !== undefined ? e.diaPago : antes.diaPago;
      if (tipo === 'paga_dia' && !diaPago) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Indica el día de pago (1 a 31).', {
          diaPago: ['Indica el día de pago (1 a 31).'],
        });
      }
      const n = await tx.notaInterna.update({
        where: { id },
        data: {
          ...(e.texto !== undefined ? { texto: e.texto } : {}),
          ...(e.asignadaAId !== undefined ? { asignadaAId: e.asignadaAId } : {}),
          tipo,
          diaPago: tipo === 'paga_dia' ? diaPago : null,
          ...(e.avisarEn !== undefined
            ? { avisarEn: e.avisarEn ? new Date(e.avisarEn) : null }
            : {}),
          ...(e.hecha !== undefined
            ? { hechaEn: e.hecha ? (antes.hechaEn ?? new Date()) : null }
            : {}),
        },
        include: INCLUIR_NOTA,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion:
            e.hecha === true ? 'nota.hecha' : e.hecha === false ? 'nota.reabierta' : 'nota.editada',
          entidad: 'nota',
          entidadId: id,
          antes: { tipo: antes.tipo, hecha: !!antes.hechaEn, asignadaAId: antes.asignadaAId },
          despues: { tipo: n.tipo, hecha: !!n.hechaEn, asignadaAId: n.asignadaAId },
          cliente,
        },
        tx,
      );
      return notaPublica(n);
    });
    if (reasignada) await this.avisarAsignada(auth, nota);
    return nota;
  }

  async borrar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const n = await this.exigir(auth, id, tx);
      await tx.notaInterna.delete({ where: { id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nota.borrada',
          entidad: 'nota',
          entidadId: id,
          antes: { tipo: n.tipo, clienteId: n.clienteId },
          cliente,
        },
        tx,
      );
    });
  }
}
