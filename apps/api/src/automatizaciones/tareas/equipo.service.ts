import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import { formatearMonto, REGLAS_COBRO } from '@nv/shared';
import { NotificacionesService, type ResultadoAviso } from '../../avisos/notificaciones.service.js';
import { numeroFactura } from '../../comun/formato.js';
import { PRISMA } from '../../comun/tokens.js';
import { CorreoService } from '../../correo/correo.service.js';
import { Plantillas } from '../../correo/plantillas.js';
import { usd } from '../../revendedores/libro-mayor.js';
import { TicketsService } from '../../soporte/tickets.service.js';
import {
  type ConfigAutomatizacion,
  ConfigAutomatizacionesService,
} from '../configuracion.service.js';
import { DIA_MS, fechaCaracas, fechaHora, fechaLarga } from '../horario.js';
import {
  equipoConPermiso,
  mensajeError,
  plural,
  Recuento,
  type ResultadoTarea,
} from '../recuento.js';
import { TRABAJO } from '../trabajos.js';
import { TrabajosService } from '../trabajos.service.js';
import { D } from '../../dinero/dinero.js';

const ABIERTOS = ['abierto', 'en_progreso', 'esperando_cliente'] as const;

const sumar = (a: ResultadoAviso, b: ResultadoAviso): ResultadoAviso => ({
  enviadas: a.enviadas + b.enviadas,
  omitidas: a.omitidas + b.omitidas,
  fallidas: a.fallidas + b.fallidas,
  repetidas: a.repetidas + b.repetidas,
});
const VACIO: ResultadoAviso = { enviadas: 0, omitidas: 0, fallidas: 0, repetidas: 0 };

/** Automatizaciones para el equipo (soporte y cobros) y el aviso de saldo bajo a revendedores. */
@Injectable()
export class TareasEquipoService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.avisoSaldoBajo, async (carga) => {
      await this.saldoBajo({
        revendedorId: String(carga['revendedorId']),
        movimientoId: String(carga['movimientoId']),
        saldoUsd: String(carga['saldoUsd']),
        umbralUsd: String(carga['umbralUsd']),
      });
    });
  }

  /**
   * Abre un ticket del sistema por cada suscripción que lleva varios días
   * suspendida sin pago, una sola vez por episodio de suspensión, y avisa al
   * equipo de soporte.
   */
  async escalado(
    config: ConfigAutomatizacion<'escalado_suspension'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const { diasSuspendida, prioridad } = config.parametros;
    const limite = new Date(ahora.getTime() - diasSuspendida * DIA_MS);
    const subs = await this.prisma.suscripcion.findMany({
      where: { estado: 'suspendida', revendedorId: null, cliente: { revendedorId: null } },
      include: {
        cliente: { select: { nombre: true } },
        plan: { include: { servicio: { select: { nombre: true } } } },
        eventos: { where: { tipo: 'suspension' }, orderBy: { creadoEn: 'desc' }, take: 1 },
        facturas: { where: { estado: 'emitida' }, orderBy: { creadoEn: 'desc' }, take: 1 },
      },
      orderBy: { venceEn: 'asc' },
      take: 500,
    });
    let equipo: Awaited<ReturnType<typeof equipoConPermiso>> | null = null;
    for (const s of subs) {
      // Inicio del episodio: el evento de suspensión o, sin él, el fin de la gracia.
      const desde =
        s.eventos[0]?.creadoEn ??
        new Date((s.venceEn?.getTime() ?? ahora.getTime()) + REGLAS_COBRO.diasGracia * DIA_MS);
      if (desde > limite) continue;
      try {
        const dias = Math.max(
          diasSuspendida,
          Math.floor((ahora.getTime() - desde.getTime()) / DIA_MS),
        );
        const servicio = `${s.plan.servicio.nombre} · ${s.plan.nombre}`;
        const factura = s.facturas[0];
        const ticket = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${s.id}::uuid FOR UPDATE`;
          const actual = await tx.suscripcion.findUniqueOrThrow({ where: { id: s.id } });
          if (actual.estado !== 'suspendida') return null;
          const existente = await tx.ticket.findFirst({
            where: {
              suscripcionId: s.id,
              origen: 'sistema',
              OR: [{ creadoEn: { gte: desde } }, { estado: { in: [...ABIERTOS] } }],
            },
            select: { id: true },
          });
          if (existente) return null;
          return this.tickets.abrirTicketSistema(tx, {
            clienteId: s.clienteId,
            suscripcionId: s.id,
            asunto: `Suscripción suspendida sin pago: ${servicio}`,
            prioridad,
            mensaje: `Hola, ${s.cliente.nombre}. Tu suscripción ${servicio} está suspendida desde el ${fechaLarga(desde)} porque no recibimos el pago de la renovación. Abrimos esta solicitud para ayudarte: respóndenos aquí si ya pagaste o si necesitas ayuda para reactivarla.`,
            notaInterna: [
              `Escalado automático: la suscripción lleva ${plural(dias, 'día', 'días')} suspendida sin pago (desde el ${fechaLarga(desde)}).`,
              factura
                ? `Factura pendiente: ${numeroFactura(factura.numero)} por ${formatearMonto(factura.total.toFixed(2), factura.moneda)}.`
                : 'No tiene una factura pendiente: puedes emitir la renovación desde la suscripción.',
              'Contacta al cliente para ayudarle a pagar o confirma si prefiere cancelar.',
            ].join('\n'),
            ahora,
          });
        });
        if (!ticket) {
          r.omitidos += 1;
          continue;
        }
        r.procesados += 1;
        equipo ??= await equipoConPermiso(this.prisma, 'tickets.gestionar');
        const url = this.correo.urlWeb(`/admin/soporte/${ticket.id}`);
        for (const u of equipo) {
          await this.avisos.avisar({
            plantilla: 'escaladoSuspension',
            destinatario: { usuarioId: u.id },
            claveUnica: `escalado:${ticket.id}:${u.id}`,
            automatizacion: 'escalado_suspension',
            entidad: { tipo: 'ticket', id: ticket.id },
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.escaladoSuspension(
                nombre,
                ticket.numero,
                s.cliente.nombre,
                servicio,
                dias,
                url,
              ),
            }),
          });
        }
      } catch (e) {
        r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
      }
    }
    const partes = [plural(r.procesados, 'ticket abierto', 'tickets abiertos')];
    if (r.omitidos) partes.push(plural(r.omitidos, 'ya escalada', 'ya escaladas'));
    if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
    return r.resultado(`${partes.join(', ')}.`);
  }

  /** Avisa de los tickets que pasaron su plazo de primera respuesta. Una vez por ticket (y plazo). */
  async alertaSla(
    _config: ConfigAutomatizacion<'alerta_sla_tickets'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        estado: { in: [...ABIERTOS] },
        primeraRespuestaEn: null,
        slaPrimeraRespuesta: { lt: ahora },
      },
      include: {
        cliente: { select: { nombre: true } },
        asignadoA: { select: { id: true, estado: true } },
      },
      orderBy: { slaPrimeraRespuesta: 'asc' },
      take: 200,
    });
    let equipo: Awaited<ReturnType<typeof equipoConPermiso>> | null = null;
    for (const t of tickets) {
      try {
        const base = `sla:${t.id}:${t.slaPrimeraRespuesta.toISOString()}`;
        const ya = await this.prisma.notificacion.findFirst({
          where: { claveUnica: { startsWith: `${base}:` } },
          select: { id: true },
        });
        if (ya) {
          r.omitidos += 1;
          continue;
        }
        const asignado = t.asignadoA?.estado === 'activo' ? t.asignadoA : null;
        equipo ??= await equipoConPermiso(this.prisma, 'tickets.gestionar');
        const destinatarios = asignado ? [asignado] : equipo;
        const url = this.correo.urlWeb(`/admin/soporte/${t.id}`);
        let total = VACIO;
        for (const u of destinatarios) {
          total = sumar(
            total,
            await this.avisos.avisar({
              plantilla: 'alertaSla',
              destinatario: { usuarioId: u.id },
              claveUnica: `${base}:${u.id}`,
              automatizacion: 'alerta_sla_tickets',
              entidad: { tipo: 'ticket', id: t.id },
              canales: ['correo'],
              contenido: (nombre) => ({
                correo: Plantillas.alertaSla(
                  nombre,
                  t.numero,
                  t.asunto,
                  t.cliente.nombre,
                  fechaHora(t.slaPrimeraRespuesta),
                  Boolean(asignado),
                  url,
                ),
              }),
            }),
          );
        }
        r.aviso(total);
      } catch (e) {
        r.error(`Ticket ${t.id}: ${mensajeError(e)}`);
      }
    }
    const partes = [plural(r.procesados, 'ticket avisado', 'tickets avisados')];
    if (r.omitidos) partes.push(plural(r.omitidos, 'ya avisado', 'ya avisados'));
    if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
    return r.resultado(`${partes.join(', ')}.`);
  }

  /** Resumen diario de pagos de clientes y recargas de revendedores esperando conciliación. */
  async pagosPendientes(
    config: ConfigAutomatizacion<'alerta_pagos_pendientes'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const horas = config.parametros.horasEspera;
    const limite = new Date(ahora.getTime() - horas * 3600_000);
    const [pagos, recargas] = await Promise.all([
      this.prisma.pago.findMany({
        where: { estado: 'en_revision', creadoEn: { lte: limite } },
        include: { cliente: { select: { nombre: true } } },
        orderBy: { creadoEn: 'asc' },
        take: 30,
      }),
      this.prisma.recargaSaldo.findMany({
        where: { estado: 'en_revision', creadoEn: { lte: limite } },
        include: { revendedor: { select: { nombreComercial: true } } },
        orderBy: { creadoEn: 'asc' },
        take: 30,
      }),
    ]);
    if (pagos.length === 0 && recargas.length === 0) {
      return r.resultado(`No hay pagos esperando más de ${plural(horas, 'hora', 'horas')}.`);
    }
    const lineasPagos = pagos.map(
      (p) =>
        `${p.referencia} · ${p.cliente.nombre} · ${formatearMonto(p.montoDeclarado.toFixed(2), p.moneda)} · desde ${fechaHora(p.creadoEn)}`,
    );
    const lineasRecargas = recargas.map(
      (x) =>
        `${x.referencia} · ${x.revendedor.nombreComercial} · ${formatearMonto(x.montoDeclarado.toFixed(2), x.moneda)} · desde ${fechaHora(x.creadoEn)}`,
    );
    const url = this.correo.urlWeb('/admin/cobros');
    const equipo = await equipoConPermiso(this.prisma, 'pagos.gestionar');
    for (const u of equipo) {
      try {
        r.aviso(
          await this.avisos.avisar({
            plantilla: 'pagosPendientes',
            destinatario: { usuarioId: u.id },
            claveUnica: `pagos_pendientes:${fechaCaracas(ahora)}:${u.id}`,
            automatizacion: 'alerta_pagos_pendientes',
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.pagosPendientes(nombre, horas, lineasPagos, lineasRecargas, url),
            }),
          }),
        );
      } catch (e) {
        r.error(`Usuario ${u.id}: ${mensajeError(e)}`);
      }
    }
    return r.resultado(
      `${plural(pagos.length, 'pago', 'pagos')} y ${plural(recargas.length, 'recarga', 'recargas')} esperando; ${plural(r.procesados, 'resumen enviado', 'resúmenes enviados')}${r.omitidos ? `, ${plural(r.omitidos, 'omitido', 'omitidos')}` : ''}.`,
    );
  }

  /** Aviso de saldo bajo al revendedor (lo encola el movimiento que cruza el umbral). */
  async saldoBajo(e: {
    revendedorId: string;
    movimientoId: string;
    saldoUsd: string;
    umbralUsd: string;
  }): Promise<ResultadoAviso | null> {
    const config = await this.config.leer('saldo_bajo_revendedor');
    if (!config.activa) return null;
    const rev = await this.prisma.revendedor.findUnique({ where: { id: e.revendedorId } });
    if (!rev) return null;
    const url = this.correo.urlWeb('/revendedor/saldo');
    const r = await this.avisos.avisar({
      plantilla: 'saldoBajoRevendedor',
      destinatario: { usuarioId: rev.usuarioId },
      claveUnica: `saldo_bajo:${e.movimientoId}`,
      automatizacion: 'saldo_bajo_revendedor',
      entidad: { tipo: 'revendedor', id: rev.id },
      contenido: (nombre) => ({
        correo: Plantillas.saldoBajoRevendedor(
          nombre,
          usd(D(e.saldoUsd)),
          usd(D(e.umbralUsd)),
          url,
        ),
      }),
    });
    await this.prisma.automatizacion.update({
      where: { tipo: 'saldo_bajo_revendedor' },
      data: { ultimaEjecucionEn: new Date() },
    });
    return r;
  }
}
