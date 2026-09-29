import type { Archivo, Cupon, Factura, LineaFactura, MetodoCobro, Pago, Usuario } from '@nv/db';
import type { FacturaDetalle, FacturaPublica, PagoPublico, PlanDeFactura } from '@nv/shared';
import { dec, dec2, iso, numeroFactura } from '../comun/formato.js';
import { esPasarela } from '../pagos-en-linea/pasarelas.js';

export const INCLUIR_FACTURA = {
  cliente: { select: { id: true, nombre: true } },
  cupon: { select: { codigo: true } },
  pagos: { where: { estado: 'en_revision' }, select: { id: true }, take: 1 },
  lineas: {
    where: { planId: { not: null } },
    select: {
      plan: {
        select: {
          id: true,
          nombre: true,
          servicio: { select: { nombre: true, slug: true, categoria: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
    take: 1,
  },
} as const;

type FacturaBase = Factura & {
  cliente: { id: string; nombre: string };
  cupon: Pick<Cupon, 'codigo'> | null;
  pagos: { id: string }[];
  lineas: { plan: PlanDeFactura | null }[];
};

export function facturaPublica(f: FacturaBase, ahora = new Date()): FacturaPublica {
  return {
    id: f.id,
    numero: numeroFactura(f.numero),
    cliente: f.cliente,
    suscripcionId: f.suscripcionId,
    concepto: f.concepto,
    estado: f.estado,
    vencida: f.estado === 'emitida' && f.venceEn < ahora,
    moneda: f.moneda,
    subtotal: dec2(f.subtotal),
    descuento: dec2(f.descuento),
    total: dec2(f.total),
    tasa: dec2(f.tasa, 6),
    totalUsd: dec2(f.totalUsd),
    cupon: f.cupon?.codigo ?? null,
    venceEn: iso(f.venceEn)!,
    pagadaEn: iso(f.pagadaEn),
    anuladaEn: iso(f.anuladaEn),
    motivoAnulacion: f.motivoAnulacion,
    creadoEn: iso(f.creadoEn)!,
    pagoEnRevision: f.pagos.length > 0,
    pedidoId: f.pedidoId,
    plan: f.lineas.find((l) => l.plan)?.plan ?? null,
  };
}

export const INCLUIR_PAGO = {
  factura: { select: { id: true, numero: true, total: true, moneda: true } },
  cliente: { select: { id: true, nombre: true } },
  metodoCobro: { select: { id: true, nombre: true } },
  revisadoPor: { select: { id: true, nombre: true } },
} as const;

type PagoBase = Pago & {
  factura: Pick<Factura, 'id' | 'numero' | 'total' | 'moneda'>;
  cliente: { id: string; nombre: string };
  metodoCobro: Pick<MetodoCobro, 'id' | 'nombre'> | null;
  revisadoPor: Pick<Usuario, 'id' | 'nombre'> | null;
  comprobante?: Archivo | null;
};

/** `equipo` añade las notas de conciliación y quién revisó el pago. */
export function pagoPublico(p: PagoBase, equipo: boolean): PagoPublico {
  return {
    id: p.id,
    referencia: p.referencia,
    factura: {
      id: p.factura.id,
      numero: numeroFactura(p.factura.numero),
      total: dec2(p.factura.total),
      moneda: p.factura.moneda,
    },
    cliente: p.cliente,
    // Los pagos con saldo no tienen método de cobro: se muestran como la billetera.
    metodo: p.metodoCobro
      ? { id: p.metodoCobro.id, nombre: p.metodoCobro.nombre }
      : { id: 'billetera', nombre: 'Saldo de la billetera' },
    moneda: p.moneda,
    montoDeclarado: dec2(p.montoDeclarado),
    montoRecibido: dec(p.montoRecibido),
    referenciaExterna: p.referenciaExterna,
    fechaPago: iso(p.fechaPago)!,
    estado: p.estado,
    motivoRechazo: p.motivoRechazo,
    tieneComprobante: p.comprobanteId !== null,
    creadoEn: iso(p.creadoEn)!,
    origen: p.origen === 'pasarela' || p.origen === 'billetera' ? p.origen : 'manual',
    pasarela: esPasarela(p.pasarela) ? p.pasarela : null,
    montoReembolsado: dec2(p.montoReembolsado),
    ...(equipo
      ? {
          notasConciliacion: p.notasConciliacion,
          revisadoPor: p.revisadoPor,
          revisadoEn: iso(p.revisadoEn),
        }
      : {}),
  };
}

export const INCLUIR_LINEAS_FACTURA = {
  lineas: {
    include: {
      plan: {
        select: {
          id: true,
          nombre: true,
          servicio: { select: { nombre: true, slug: true, categoria: true } },
        },
      },
    },
  },
} as const;

export function facturaDetalle(
  f: Omit<FacturaBase, 'lineas'> & { lineas: (LineaFactura & { plan: PlanDeFactura | null })[] },
  pagos: PagoBase[],
  equipo: boolean,
): FacturaDetalle {
  return {
    ...facturaPublica(f),
    lineas: f.lineas.map((l) => ({
      id: l.id,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: dec2(l.precioUnitario),
      total: dec2(l.total),
    })),
    pagos: pagos.map((p) => pagoPublico(p, equipo)),
  };
}
