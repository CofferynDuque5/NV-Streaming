import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient, PrioridadTicket, Ticket } from '@nv/db';
import {
  type AbrirTicketEntrada,
  type AbrirTicketEquipoEntrada,
  type ActualizarTicketEntrada,
  esEquipo,
  type ListarTicketsEntrada,
  type Pagina,
  SLA_HORAS,
  type TicketDetalle,
  type TicketResumen,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { LimitesService } from '../limites/limites.service.js';

type Tx = Prisma.TransactionClient;

const INCLUIR = {
  cliente: { select: { id: true, nombre: true } },
  asignadoA: { select: { id: true, nombre: true } },
} as const;

type TicketBase = Ticket & {
  cliente: { id: string; nombre: string };
  asignadoA: { id: string; nombre: string } | null;
};

const ABIERTOS = ['abierto', 'en_progreso', 'esperando_cliente'] as const;
const LIMITE_TICKETS = { maximo: 5, ventanaSegundos: 3600 };
const LIMITE_MENSAJES = { maximo: 30, ventanaSegundos: 3600 };

const slaDesde = (desde: Date, prioridad: PrioridadTicket) =>
  new Date(desde.getTime() + SLA_HORAS[prioridad] * 3600_000);

function resumen(t: TicketBase, ahora = new Date()): TicketResumen {
  return {
    id: t.id,
    numero: t.numero,
    asunto: t.asunto,
    categoria: t.categoria,
    prioridad: t.prioridad,
    estado: t.estado,
    cliente: t.cliente,
    asignadoA: t.asignadoA,
    slaPrimeraRespuesta: iso(t.slaPrimeraRespuesta)!,
    primeraRespuestaEn: iso(t.primeraRespuestaEn),
    slaIncumplido:
      t.primeraRespuestaEn === null &&
      (ABIERTOS as readonly string[]).includes(t.estado) &&
      t.slaPrimeraRespuesta < ahora,
    creadoEn: iso(t.creadoEn)!,
    actualizadoEn: iso(t.actualizadoEn)!,
  };
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger('Soporte');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listar(auth: ContextoAuth, f: ListarTicketsEntrada): Promise<Pagina<TicketResumen>> {
    const where: Prisma.TicketWhereInput = {
      cliente: alcanceClientes(auth),
      ...(f.estado ? { estado: f.estado } : f.abiertos ? { estado: { in: [...ABIERTOS] } } : {}),
      ...(f.prioridad ? { prioridad: f.prioridad } : {}),
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.asignacion === 'mios' ? { asignadoAId: auth.usuario.id } : {}),
      ...(f.asignacion === 'sin_asignar' ? { asignadoAId: null } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ actualizadoEn: 'desc' }, { id: 'asc' }],
        skip: (f.pagina - 1) * f.porPagina,
        take: f.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((t) => resumen(t)),
      total,
      pagina: f.pagina,
      porPagina: f.porPagina,
    };
  }

  async obtener(auth: ContextoAuth, id: string): Promise<TicketDetalle> {
    const verInternos = esEquipo(auth.usuario.rol);
    const t = await this.prisma.ticket.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: {
        ...INCLUIR,
        mensajes: {
          where: verInternos ? {} : { interno: false },
          orderBy: { creadoEn: 'asc' },
          include: { autor: { select: { id: true, nombre: true, rol: true } } },
        },
      },
    });
    if (!t) throw Errores.noEncontrado('El ticket');
    return {
      ...resumen(t),
      suscripcionId: t.suscripcionId,
      mensajes: t.mensajes.map((m) => ({
        id: m.id,
        texto: m.texto,
        interno: m.interno,
        autor: { id: m.autor.id, nombre: m.autor.nombre, esEquipo: esEquipo(m.autor.rol) },
        creadoEn: iso(m.creadoEn)!,
      })),
    };
  }

  /** Ticket abierto por el propio cliente. */
  async abrir(auth: ContextoAuth, e: AbrirTicketEntrada, cliente: InfoCliente) {
    await this.limites.consumir(`ticket:abrir:${auth.usuario.id}`, LIMITE_TICKETS);
    const propio = await this.clientes.deUsuario(auth.usuario);
    return this.crear(auth, propio.id, { ...e, prioridad: 'normal' }, cliente);
  }

  /** Ticket abierto por el equipo en nombre de un cliente. */
  async abrirEquipo(auth: ContextoAuth, e: AbrirTicketEquipoEntrada, cliente: InfoCliente) {
    await this.clientes.exigirAlcance(auth, e.clienteId);
    return this.crear(auth, e.clienteId, e, cliente);
  }

  async responder(
    auth: ContextoAuth,
    id: string,
    e: { texto: string; interno: boolean },
    cliente: InfoCliente,
  ): Promise<TicketDetalle> {
    const deEquipo = esEquipo(auth.usuario.rol);
    const interno = deEquipo && e.interno;
    await this.limites.consumir(`ticket:mensaje:${auth.usuario.id}`, LIMITE_MENSAJES);
    const avisar = await this.prisma.$transaction(async (tx) => {
      const t = await this.bloquear(tx, auth, id);
      if (t.estado === 'cerrado') {
        throw new ErrorApp(
          409,
          'TICKET_CERRADO',
          'Este ticket está cerrado. Abre uno nuevo si lo necesitas.',
        );
      }
      const m = await tx.mensajeTicket.create({
        data: { ticketId: id, autorId: auth.usuario.id, texto: e.texto, interno },
      });
      const cambios: Prisma.TicketUpdateInput = {};
      if (deEquipo && !interno) {
        if (!t.primeraRespuestaEn) cambios.primeraRespuestaEn = m.creadoEn;
        if (t.estado === 'abierto' || t.estado === 'en_progreso')
          cambios.estado = 'esperando_cliente';
      } else if (!deEquipo && (t.estado === 'esperando_cliente' || t.estado === 'resuelto')) {
        cambios.estado = 'abierto';
        cambios.resueltoEn = null;
      }
      // Actualiza siempre la fecha para que el ticket suba en la bandeja.
      await tx.ticket.update({ where: { id }, data: { ...cambios, actualizadoEn: new Date() } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: interno ? 'ticket.nota_interna' : 'ticket.respondido',
          entidad: 'ticket',
          entidadId: id,
          despues: {
            mensajeId: m.id,
            ...(cambios.estado ? { estado: cambios.estado as string } : {}),
          },
          cliente,
        },
        tx,
      );
      return deEquipo && !interno ? t : null;
    });
    if (avisar) await this.avisarRespuesta(avisar);
    return this.obtener(auth, id);
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    e: ActualizarTicketEntrada,
    cliente: InfoCliente,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.bloquear(tx, auth, id);
      if (e.asignadoAId) {
        const u = await tx.usuario.findUnique({ where: { id: e.asignadoAId } });
        if (!u || u.estado !== 'activo' || !['admin', 'operador'].includes(u.rol)) {
          throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Revisa los datos del formulario.', {
            asignadoAId: ['Asigna el ticket a alguien de soporte o administración.'],
          });
        }
      }
      const data: Prisma.TicketUncheckedUpdateInput = {};
      if (e.estado !== undefined) {
        data.estado = e.estado;
        if (e.estado === 'resuelto' || e.estado === 'cerrado')
          data.resueltoEn = t.resueltoEn ?? new Date();
        else data.resueltoEn = null;
      }
      if (e.prioridad !== undefined) {
        data.prioridad = e.prioridad;
        if (!t.primeraRespuestaEn) data.slaPrimeraRespuesta = slaDesde(t.creadoEn, e.prioridad);
      }
      if (e.asignadoAId !== undefined) data.asignadoAId = e.asignadoAId;
      await tx.ticket.update({ where: { id }, data });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'ticket.actualizado',
          entidad: 'ticket',
          entidadId: id,
          antes: { estado: t.estado, prioridad: t.prioridad, asignadoAId: t.asignadoAId },
          despues: e as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
    });
    return this.obtener(auth, id);
  }

  /** El cliente da por resuelta su solicitud. */
  async cerrarPorCliente(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.bloquear(tx, auth, id);
      if (t.estado === 'cerrado') return;
      await tx.ticket.update({
        where: { id },
        data: { estado: 'cerrado', resueltoEn: t.resueltoEn ?? new Date() },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'ticket.cerrado_por_cliente',
          entidad: 'ticket',
          entidadId: id,
          antes: { estado: t.estado },
          despues: { estado: 'cerrado' },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(auth, id);
  }

  private async crear(
    auth: ContextoAuth,
    clienteId: string,
    e: AbrirTicketEntrada & { prioridad: PrioridadTicket },
    cliente: InfoCliente,
  ): Promise<TicketDetalle> {
    const id = await this.prisma.$transaction(async (tx) => {
      if (e.suscripcionId) {
        const s = await tx.suscripcion.findFirst({ where: { id: e.suscripcionId, clienteId } });
        if (!s) throw Errores.noEncontrado('La suscripción');
      }
      const ahora = new Date();
      const t = await tx.ticket.create({
        data: {
          clienteId,
          suscripcionId: e.suscripcionId ?? null,
          asunto: e.asunto,
          categoria: e.categoria,
          prioridad: e.prioridad,
          slaPrimeraRespuesta: slaDesde(ahora, e.prioridad),
          creadoPorId: auth.usuario.id,
          mensajes: { create: { autorId: auth.usuario.id, texto: e.mensaje } },
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'ticket.abierto',
          entidad: 'ticket',
          entidadId: t.id,
          despues: { numero: t.numero, clienteId, categoria: e.categoria, prioridad: e.prioridad },
          cliente,
        },
        tx,
      );
      return t.id;
    });
    return this.obtener(auth, id);
  }

  private async bloquear(tx: Tx, auth: ContextoAuth, id: string): Promise<Ticket> {
    const visible = await tx.ticket.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('El ticket');
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.ticket.findUniqueOrThrow({ where: { id } });
  }

  private async avisarRespuesta(t: Ticket) {
    try {
      const c = await this.prisma.cliente.findUnique({
        where: { id: t.clienteId },
        include: { usuario: { select: { correo: true } } },
      });
      const destino = c?.usuario?.correo ?? c?.correo;
      if (!c || !destino) return;
      await this.correo.enviar(
        destino,
        'ticketRespondido',
        Plantillas.ticketRespondido(
          c.nombre,
          t.numero,
          t.asunto,
          this.correo.urlWeb(`/cuenta/soporte/${t.id}`),
        ),
      );
    } catch (e) {
      this.logger.warn({ err: e, ticketId: t.id }, 'No se pudo avisar de la respuesta');
    }
  }
}
