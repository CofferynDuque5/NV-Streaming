import {
  formatearMonto,
  type Moneda,
  type PlanPublico,
  ofertaActiva,
  preciosVigentes,
} from '@nv/shared';

/**
 * Precio de un plan en la moneda, tal como lo calculó la API (con la oferta
 * HOT si está vigente), listo para mostrar. `null` si no tiene precio en esa moneda.
 */
export function precioTexto(plan: PlanPublico, moneda: Moneda): string | null {
  const p = preciosVigentes(plan)[moneda];
  if (!p) return null;
  return Number(p.precio) === 0 ? 'Gratis' : formatearMonto(p.precio, moneda);
}

/** Precio normal tachado de un plan en oferta HOT; null si no está en oferta. */
export function precioAntesTexto(plan: PlanPublico, moneda: Moneda): string | null {
  if (!ofertaActiva(plan)) return null;
  const p = plan.precios[moneda];
  return p && Number(p.precio) > 0 ? formatearMonto(p.precio, moneda) : null;
}
