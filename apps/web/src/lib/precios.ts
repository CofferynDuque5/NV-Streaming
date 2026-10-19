import { formatearMonto, type Moneda, type PlanPublico } from '@nv/shared';

/**
 * Precio de un plan en la moneda, tal como lo calculó la API, listo para
 * mostrar. `null` si el plan no tiene precio en esa moneda.
 */
export function precioTexto(plan: PlanPublico, moneda: Moneda): string | null {
  const p = plan.precios[moneda];
  if (!p) return null;
  return Number(p.precio) === 0 ? 'Gratis' : formatearMonto(p.precio, moneda);
}
