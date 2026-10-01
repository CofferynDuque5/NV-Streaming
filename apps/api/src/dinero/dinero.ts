import { Prisma, type Moneda, type Plan, type PrecioFijo } from '@nv/db';
import { INFO_MONEDA, MONEDAS, type PreciosPorMoneda } from '@nv/shared';

export type Dec = Prisma.Decimal;
export const D = (v: string | number | Dec): Dec => new Prisma.Decimal(v);
export const CERO = D(0);

/** Redondea al número de decimales de la moneda (mitad hacia arriba). */
export function redondear(v: Dec, moneda: Moneda): Dec {
  return v.toDecimalPlaces(INFO_MONEDA[moneda].decimales, Prisma.Decimal.ROUND_HALF_UP);
}

/** Tasas vigentes: unidades de la moneda por 1 USD. USD siempre vale 1. */
export type MapaTasas = Map<Moneda, Dec>;

export interface PrecioCalculado {
  precio: Dec;
  fijo: boolean;
  /** Tasa usada para expresar el precio en USD (implícita si el precio es fijo y no hay tasa). */
  tasa: Dec;
}

/**
 * Precio de un plan en una moneda: el fijo si existe, o el precio en USD por
 * la tasa vigente, redondeado. Devuelve null si falta la tasa.
 */
export function precioEn(
  plan: Pick<Plan, 'precioUsd'> & { preciosFijos: Pick<PrecioFijo, 'moneda' | 'precio'>[] },
  moneda: Moneda,
  tasas: MapaTasas,
): PrecioCalculado | null {
  if (moneda === 'USD') return { precio: plan.precioUsd, fijo: false, tasa: D(1) };
  const fijo = plan.preciosFijos.find((p) => p.moneda === moneda);
  const tasa = tasas.get(moneda);
  if (fijo) {
    const implicita = plan.precioUsd.gt(0) ? fijo.precio.div(plan.precioUsd) : D(1);
    return { precio: fijo.precio, fijo: true, tasa: tasa ?? implicita.toDecimalPlaces(6) };
  }
  if (!tasa) return null;
  return { precio: redondear(plan.precioUsd.mul(tasa), moneda), fijo: false, tasa };
}

export function preciosPorMoneda(
  plan: Parameters<typeof precioEn>[0],
  tasas: MapaTasas,
): PreciosPorMoneda {
  const r = {} as PreciosPorMoneda;
  for (const m of MONEDAS) {
    const p = precioEn(plan, m, tasas);
    r[m] = p ? { precio: p.precio.toFixed(2), fijo: p.fijo } : null;
  }
  return r;
}

/** Convierte un importe en `moneda` a USD con la tasa dada. */
export function aUsd(monto: Dec, tasa: Dec): Dec {
  return monto.div(tasa).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Suma una duración de plan a una fecha. Los meses respetan el calendario (31 ene + 1 mes = 28/29 feb). */
export function sumarDuracion(desde: Date, cantidad: number, unidad: 'dia' | 'mes'): Date {
  const d = new Date(desde);
  if (unidad === 'dia') {
    d.setUTCDate(d.getUTCDate() + cantidad);
    return d;
  }
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + cantidad);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** Equivalente mensual en USD de un plan (para el ingreso recurrente estimado). */
export function mensualUsd(
  plan: Pick<Plan, 'precioUsd' | 'duracionCantidad' | 'duracionUnidad'>,
): Dec {
  const meses =
    plan.duracionUnidad === 'mes' ? D(plan.duracionCantidad) : D(plan.duracionCantidad).div(30);
  return plan.precioUsd.div(meses);
}
