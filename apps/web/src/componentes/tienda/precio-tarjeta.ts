import {
  etiquetaPlan,
  formatearMonto,
  INFO_CATEGORIA,
  type Moneda,
  ofertaActiva,
  type PlanPublico,
  preciosVigentes,
} from '@nv/shared';
import type { MonedaMayorista } from '@/componentes/planes-mayoristas';
import type { VistaMayorista } from '@/lib/revendedor-publico';
import { precioAntesTexto, precioTexto } from '@/lib/precios';

export interface MayoristaTienda {
  vista: VistaMayorista;
  moneda: MonedaMayorista;
}

export interface PrecioTarjeta {
  /** Precio principal en la moneda elegida (o el mayorista del revendedor). */
  principal: string | null;
  /** Referencia en dólares si la moneda no es USD. */
  referencia: string | null;
  /** «Tu precio» para revendedores. */
  etiqueta: string | null;
  /** Plan disponible para comprar con saldo (revendedor) o sumar al carrito. */
  compraMayorista: boolean;
  /** Precio normal tachado si el plan está en oferta HOT (solo precio público). */
  antes: string | null;
  /** Porcentaje de la oferta HOT vigente. */
  oferta: number | null;
  /** Fin de la oferta HOT (ISO). */
  ofertaHasta: string | null;
}

/**
 * Precio que se muestra en una tarjeta: el que calculó la API para la moneda o,
 * para un revendedor con sesión, su precio mayorista del nivel. Nada se calcula aquí.
 */
export function precioDeTarjeta(
  plan: PlanPublico,
  moneda: Moneda,
  mayorista?: MayoristaTienda | null,
): PrecioTarjeta {
  if (mayorista?.vista.estado === 'ok') {
    const suyo = mayorista.vista.catalogo.planes.find((p) => p.id === plan.id);
    if (suyo) {
      const ves = mayorista.moneda === 'VES' && suyo.precioVes;
      return {
        principal: ves
          ? formatearMonto(suyo.precioVes ?? '0', 'VES')
          : formatearMonto(suyo.precioUsd, 'USD'),
        referencia: ves ? formatearMonto(suyo.precioUsd, 'USD') : null,
        etiqueta: 'Tu precio',
        compraMayorista: true,
        antes: null,
        oferta: null,
        ofertaHasta: null,
      };
    }
  }
  const usd = preciosVigentes(plan).USD;
  const oferta = ofertaActiva(plan);
  return {
    principal: precioTexto(plan, moneda),
    referencia:
      moneda !== 'USD' && usd && Number(usd.precio) > 0 ? formatearMonto(usd.precio, 'USD') : null,
    etiqueta: null,
    compraMayorista: false,
    antes: precioAntesTexto(plan, moneda),
    oferta: oferta?.porcentaje ?? null,
    ofertaHasta: oferta?.hasta ?? null,
  };
}

/** «Streaming · 1 mes» para la línea de categoría de la tarjeta. */
export function lineaCategoria(plan: PlanPublico, categoria: keyof typeof INFO_CATEGORIA | null) {
  const duracion = etiquetaPlan(plan);
  return categoria ? `${INFO_CATEGORIA[categoria].nombre} · ${duracion}` : duracion;
}
