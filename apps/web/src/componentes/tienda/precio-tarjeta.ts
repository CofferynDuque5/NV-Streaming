import {
  etiquetaDuracion,
  formatearMonto,
  INFO_CATEGORIA,
  type Moneda,
  type PlanPublico,
} from '@nv/shared';
import type { MonedaMayorista } from '@/componentes/planes-mayoristas';
import type { VistaMayorista } from '@/lib/revendedor-publico';
import { precioTexto } from '@/lib/precios';

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
      };
    }
  }
  const usd = plan.precios.USD;
  return {
    principal: precioTexto(plan, moneda),
    referencia:
      moneda !== 'USD' && usd && Number(usd.precio) > 0 ? formatearMonto(usd.precio, 'USD') : null,
    etiqueta: null,
    compraMayorista: false,
  };
}

/** «Streaming · 1 mes» para la línea de categoría de la tarjeta. */
export function lineaCategoria(plan: PlanPublico, categoria: keyof typeof INFO_CATEGORIA | null) {
  const duracion = etiquetaDuracion(plan.duracionCantidad, plan.duracionUnidad);
  return categoria ? `${INFO_CATEGORIA[categoria].nombre} · ${duracion}` : duracion;
}
