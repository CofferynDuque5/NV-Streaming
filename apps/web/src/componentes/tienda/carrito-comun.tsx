import { etiquetaDuracion, type PlanPublico, type ServicioTienda } from '@nv/shared';
import clsx from 'clsx';

/*
 * Piezas que comparten el carrito lateral y la página del carrito. Sin
 * 'use client': no tienen estado y sirven en ambos lados.
 */

/** Servicios por popularidad (lo más pedido primero) y luego en el orden del catálogo. */
export function porPopularidad(servicios: ServicioTienda[]): ServicioTienda[] {
  return servicios
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        (a.s.ranking ?? Number.POSITIVE_INFINITY) - (b.s.ranking ?? Number.POSITIVE_INFINITY) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
}

/** Barra que brilla mientras la API calcula un precio. */
export function Esqueleto({ ancho = 'w-16' }: { ancho?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-4 animate-pulse rounded-md bg-[linear-gradient(90deg,rgb(140_160_255/0.12),rgb(140_160_255/0.28),rgb(140_160_255/0.12))]',
        ancho,
      )}
    />
  );
}

/** Nombre de la opción de un plan: su duración (y su nombre si hay dos con la misma). */
export function nombreOpcion(p: PlanPublico, planes: PlanPublico[]) {
  const d = etiquetaDuracion(p.duracionCantidad, p.duracionUnidad);
  const repetida = planes.some(
    (x) =>
      x.id !== p.id &&
      x.duracionCantidad === p.duracionCantidad &&
      x.duracionUnidad === p.duracionUnidad,
  );
  return repetida ? `${d} · ${p.nombre}` : d;
}
