import { Inject, Injectable } from '@nestjs/common';
import type { Moneda, PrismaClient } from '@nv/db';
import {
  ESTADOS_SUSCRIPCION,
  type EstadoSuscripcion,
  limitadoACartera,
  type MetricasPanel,
} from '@nv/shared';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO, type Dec, mensualUsd } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { INCLUIR_SUSCRIPCION, suscripcionPublica } from '../suscripciones/presentacion.js';

@Injectable()
export class MetricasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TasasService) private readonly tasas: TasasService,
  ) {}

  async panel(auth: ContextoAuth, ahora = new Date()): Promise<MetricasPanel> {
    const cliente = alcanceClientes(auth);
    const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
    const en7Dias = new Date(ahora.getTime() + 7 * 24 * 3600_000);

    const [
      clientesActivos,
      clientesNuevosMes,
      porEstado,
      activas,
      pagosMes,
      pagosEnRevision,
      facturasVencidas,
      ticketsAbiertos,
      ticketsSla,
      proximos,
      tasasFaltantes,
    ] = await Promise.all([
      this.prisma.cliente.count({ where: { AND: [cliente, { estado: 'activo' }] } }),
      this.prisma.cliente.count({ where: { AND: [cliente, { creadoEn: { gte: inicioMes } }] } }),
      this.prisma.suscripcion.groupBy({
        by: ['estado'],
        where: { cliente },
        _count: { _all: true },
      }),
      this.prisma.suscripcion.findMany({
        where: { cliente, estado: { in: ['activa', 'en_gracia'] } },
        select: {
          plan: { select: { precioUsd: true, duracionCantidad: true, duracionUnidad: true } },
        },
      }),
      this.prisma.pago.findMany({
        where: { cliente, estado: 'confirmado', revisadoEn: { gte: inicioMes } },
        select: {
          moneda: true,
          montoRecibido: true,
          factura: { select: { total: true, totalUsd: true } },
        },
      }),
      this.prisma.pago.count({ where: { cliente, estado: 'en_revision' } }),
      this.prisma.factura.count({ where: { cliente, estado: 'emitida', venceEn: { lt: ahora } } }),
      this.prisma.ticket.count({
        where: { cliente, estado: { in: ['abierto', 'en_progreso', 'esperando_cliente'] } },
      }),
      this.prisma.ticket.count({
        where: {
          cliente,
          estado: { in: ['abierto', 'en_progreso', 'esperando_cliente'] },
          primeraRespuestaEn: null,
          slaPrimeraRespuesta: { lt: ahora },
        },
      }),
      this.prisma.suscripcion.findMany({
        where: { cliente, estado: { in: ['activa', 'en_gracia'] }, venceEn: { lte: en7Dias } },
        include: INCLUIR_SUSCRIPCION,
        orderBy: { venceEn: 'asc' },
        take: 8,
      }),
      this.tasas.faltantes(),
    ]);

    const suscripcionesPorEstado = Object.fromEntries(
      ESTADOS_SUSCRIPCION.map((e) => [e, 0]),
    ) as Record<EstadoSuscripcion, number>;
    for (const f of porEstado) suscripcionesPorEstado[f.estado] = f._count._all;

    const mrr = activas.reduce((suma, s) => suma.add(mensualUsd(s.plan)), CERO);

    // Ingresos del mes: lo facturado de los pagos confirmados, por moneda y su equivalente en USD.
    const porMoneda = new Map<Moneda, { total: Dec; pagos: number }>();
    let totalUsd = CERO;
    for (const p of pagosMes) {
      const actual = porMoneda.get(p.moneda) ?? { total: CERO, pagos: 0 };
      porMoneda.set(p.moneda, {
        total: actual.total.add(p.factura.total),
        pagos: actual.pagos + 1,
      });
      totalUsd = totalUsd.add(p.factura.totalUsd);
    }

    return {
      soloCartera: limitadoACartera(auth.usuario.rol),
      clientesActivos,
      clientesNuevosMes,
      suscripcionesPorEstado,
      ingresoMensualRecurrenteUsd: mrr.toFixed(2),
      ingresosMes: [...porMoneda.entries()].map(([moneda, v]) => ({
        moneda,
        total: v.total.toFixed(2),
        pagos: v.pagos,
      })),
      ingresosMesUsd: totalUsd.toFixed(2),
      pagosEnRevision,
      facturasVencidas,
      ticketsAbiertos,
      ticketsSlaIncumplido: ticketsSla,
      proximosVencimientos: proximos.map(suscripcionPublica),
      tasasFaltantes,
    };
  }
}
