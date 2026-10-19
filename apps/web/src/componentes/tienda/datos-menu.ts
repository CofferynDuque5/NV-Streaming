import {
  type CatalogoPublico,
  categoriasTienda,
  etiquetaDuracion,
  formatearMonto,
  INFO_MONEDA,
  type Moneda,
  planMasBarato,
  type ServicioTienda,
  serviciosTienda,
} from '@nv/shared';
import { precioTexto } from '@/lib/precios';
import type { CategoriaMenu, OpcionMoneda, ServicioMenu } from './tipos';

const SIMBOLO: Record<Moneda, string> = {
  VES: 'Bs',
  USD: '$',
  EUR: '€',
  COP: 'COP',
  PEN: 'S/',
  ARS: 'ARS',
};

export function servicioMenu(s: ServicioTienda, moneda: Moneda): ServicioMenu {
  const plan = planMasBarato(s.planes, moneda);
  return {
    id: s.servicio.id,
    nombre: s.servicio.nombre,
    slug: s.servicio.slug,
    categoria: s.servicio.categoria,
    color: s.color,
    arte: s.arte,
    desde: plan ? precioTexto(plan, moneda) : null,
    duracion: plan ? etiquetaDuracion(plan.duracionCantidad, plan.duracionUnidad) : null,
  };
}

/** Opciones del selector de moneda con la tasa vigente que publicó el equipo. */
export function opcionesMoneda(catalogo: CatalogoPublico | null): OpcionMoneda[] {
  const monedas = catalogo?.monedas ?? ['USD'];
  return monedas.map((codigo) => {
    const tasa = catalogo?.tasas.find((t) => t.moneda === codigo);
    return {
      codigo,
      nombre: codigo === 'USD' ? 'Dólar' : INFO_MONEDA[codigo].nombre,
      simbolo: SIMBOLO[codigo],
      detalle:
        codigo === 'USD'
          ? 'Moneda base de los precios'
          : tasa
            ? `1 USD = ${formatearMonto(tasa.valor, codigo)}`
            : null,
    };
  });
}

/** Lo que necesitan el buscador, el megamenú y el menú lateral (precios ya formateados). */
export function datosMenu(catalogo: CatalogoPublico | null, moneda: Moneda) {
  const servicios = catalogo ? serviciosTienda(catalogo) : [];
  const lista = servicios.map((s) => servicioMenu(s, moneda));
  const categorias: CategoriaMenu[] = categoriasTienda(servicios, moneda).map((c) => {
    const suyos = servicios.filter((s) => s.servicio.categoria === c.id);
    const masPedido = suyos
      .filter((s) => s.ranking !== null)
      .sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0))[0];
    return {
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      color: c.color,
      cuenta: c.servicios,
      desde: c.desde ? precioTexto(c.desde, moneda) : null,
      servicios: lista.filter((s) => s.categoria === c.id).slice(0, 8),
      destacado: masPedido ? servicioMenu(masPedido, moneda) : null,
    };
  });
  return { servicios, lista, categorias, monedas: opcionesMoneda(catalogo) };
}
