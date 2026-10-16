import type { Factura, MetodoCobro, MovimientoBilletera, Pedido, RecargaBilletera } from '@nv/db';
import type {
  EstadoPago,
  EstadoPedido,
  MovimientoBilleteraPublico,
  PedidoPublico,
  PlanDeFactura,
  RecargaBilleteraPublica,
} from '@nv/shared';
import { dec, dec2, iso, numeroFactura } from '../comun/formato.js';
import { aUsd, CERO, D } from '../dinero/dinero.js';

type Ref = { id: string; nombre: string };

export const numeroPedido = (n: number): string => `PED-${String(n).padStart(6, '0')}`;

export const INCLUIR_PEDIDO = {
  cliente: { select: { id: true, nombre: true } },
  facturas: {
    orderBy: { numero: 'asc' },
    include: {
      lineas: {
        select: {
          descripcion: true,
          plan: {
            select: {
              id: true,
              nombre: true,
              servicio: { select: { nombre: true, slug: true, categoria: true } },
            },
          },
        },
        take: 1,
      },
      pagos: { orderBy: { creadoEn: 'desc' }, select: { estado: true }, take: 1 },
    },
  },
} as const;

type PedidoBase = Pedido & {
  cliente: Ref;
  facturas: (Factura & {
    lineas: { descripcion: string; plan: PlanDeFactura | null }[];
    pagos: { estado: EstadoPago }[];
  })[];
};

/** El estado de un pedido se deduce de sus facturas. */
export function estadoPedido(facturas: Pick<Factura, 'estado'>[]): EstadoPedido {
  if (facturas.some((f) => f.estado === 'emitida')) return 'pendiente';
  if (facturas.some((f) => f.estado === 'pagada')) return 'pagado';
  return 'anulado';
}

export function pedidoPublico(p: PedidoBase, ahora = new Date()): PedidoPublico {
  const vivas = p.facturas.filter((f) => f.estado !== 'anulada');
  const total = vivas.reduce((a, f) => a.add(f.total), CERO);
  const totalUsd = vivas.reduce((a, f) => a.add(f.totalUsd), CERO);
  const pendienteUsd = p.facturas
    .filter((f) => f.estado === 'emitida')
    .reduce((a, f) => a.add(f.totalUsd), CERO);
  return {
    id: p.id,
    numero: numeroPedido(p.numero),
    estado: estadoPedido(p.facturas),
    moneda: p.moneda,
    total: dec2(total),
    totalUsd: dec2(totalUsd),
    pendienteUsd: dec2(pendienteUsd),
    pagarAlRecargar: p.pagarAlRecargar,
    facturas: p.facturas.map((f) => ({
      id: f.id,
      numero: numeroFactura(f.numero),
      estado: f.estado,
      moneda: f.moneda,
      total: dec2(f.total),
      totalUsd: dec2(f.totalUsd),
      descripcion: f.lineas[0]?.descripcion ?? '',
      suscripcionId: f.suscripcionId,
      plan: f.lineas[0]?.plan ?? null,
      vencida: f.estado === 'emitida' && f.venceEn < ahora,
      ultimoPago: f.pagos[0]?.estado ?? null,
    })),
    cliente: p.cliente,
    creadoEn: iso(p.creadoEn)!,
  };
}

export const INCLUIR_RECARGA_BILLETERA = {
  cliente: { select: { id: true, nombre: true } },
  pedido: { select: { id: true, numero: true } },
  metodoCobro: { select: { id: true, nombre: true } },
  revisadoPor: { select: { id: true, nombre: true } },
} as const;

type RecargaBase = RecargaBilletera & {
  cliente: Ref;
  pedido: { id: string; numero: number } | null;
  metodoCobro: Pick<MetodoCobro, 'id' | 'nombre'>;
  revisadoPor: Ref | null;
};

/** `equipo` añade las notas de conciliación y quién la revisó. */
export function recargaBilleteraPublica(r: RecargaBase, equipo: boolean): RecargaBilleteraPublica {
  return {
    id: r.id,
    referencia: r.referencia,
    cliente: r.cliente,
    pedido: r.pedido ? { id: r.pedido.id, numero: numeroPedido(r.pedido.numero) } : null,
    metodo: { id: r.metodoCobro.id, nombre: r.metodoCobro.nombre },
    moneda: r.moneda,
    montoDeclarado: dec2(r.montoDeclarado),
    montoRecibido: dec(r.montoRecibido),
    tasa: dec2(r.tasa, 6),
    montoUsd: dec(r.montoUsd),
    montoUsdEstimado: dec2(aUsd(r.montoDeclarado, r.tasa)),
    referenciaExterna: r.referenciaExterna,
    fechaPago: iso(r.fechaPago)!,
    estado: r.estado,
    motivoRechazo: r.motivoRechazo,
    tieneComprobante: r.comprobanteId !== null,
    creadoEn: iso(r.creadoEn)!,
    revisadoEn: iso(r.revisadoEn),
    ...(equipo ? { notas: r.notas, revisadoPor: r.revisadoPor } : {}),
  };
}

export const INCLUIR_MOVIMIENTO_BILLETERA = {
  recarga: { select: { id: true, referencia: true } },
  factura: { select: { id: true, numero: true } },
  autor: { select: { id: true, nombre: true } },
} as const;

type MovimientoBase = MovimientoBilletera & {
  recarga: { id: string; referencia: string } | null;
  factura: { id: string; numero: number } | null;
  autor: Ref | null;
};

/** `equipo` muestra quién hizo cada movimiento (el cliente no ve nombres del equipo). */
export function movimientoBilleteraPublico(
  m: MovimientoBase,
  equipo: boolean,
): MovimientoBilleteraPublico {
  return {
    id: m.id,
    tipo: m.tipo,
    montoUsd: dec2(m.montoUsd),
    saldoResultanteUsd: dec2(m.saldoResultanteUsd),
    motivo: m.motivo,
    recarga: m.recarga,
    factura: m.factura ? { id: m.factura.id, numero: numeroFactura(m.factura.numero) } : null,
    autor: equipo ? m.autor : null,
    creadoEn: iso(m.creadoEn)!,
  };
}

/** Suma en USD de lo que falta pagar. */
export const pendienteUsd = (facturas: Pick<Factura, 'estado' | 'totalUsd'>[]) =>
  facturas.filter((f) => f.estado === 'emitida').reduce((a, f) => a.add(f.totalUsd), D(0));
