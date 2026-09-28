import type { CatalogoPublico, PaginaPublicada } from '@nv/shared';
import type { Metadata } from 'next';
import type { ContextoBloques } from '@/componentes/bloques/bloques';
import { monedaMayorista } from '@/componentes/planes-mayoristas';
import { vistaMayorista } from './revendedor-publico';
import { catalogoTienda, leerTemaPublico, monedaTienda } from './tienda';
import { ubicacionVisitante } from './ubicacion';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

/** Etiqueta de caché del contenido publicado; se invalida al publicar o cambiar el tema. */
export const ETIQUETA_SITIO = 'sitio';
const CACHE_SITIO = { next: { tags: [ETIQUETA_SITIO], revalidate: 60 } };

/**
 * Versión publicada de una página. `null` si no existe (o está archivada);
 * `undefined` si la API no respondió.
 */
export async function leerPaginaPublicada(
  ruta: string,
): Promise<PaginaPublicada | null | undefined> {
  try {
    const r = await fetch(
      `${API}/api/v1/sitio/publico/pagina?ruta=${encodeURIComponent(ruta)}`,
      CACHE_SITIO,
    );
    if (r.status === 404 || r.status === 400) return null;
    return r.ok ? ((await r.json()) as PaginaPublicada) : undefined;
  } catch {
    return undefined;
  }
}

/** Catálogo público (planes visibles con su precio en cada moneda). */
export async function leerCatalogo(): Promise<CatalogoPublico | null> {
  try {
    const r = await fetch(`${API}/api/v1/catalogo`, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as CatalogoPublico) : null;
  } catch {
    return null;
  }
}

/**
 * Datos para los bloques: catálogo (con caché), moneda de la visita, métodos
 * de cobro y contacto del sitio. Los precios de revendedor se leen por petición.
 */
export async function contextoPublico(
  pagina: Pick<PaginaPublicada, 'ruta' | 'bloques'>,
  monedaPedida: string | undefined,
): Promise<ContextoBloques> {
  const [catalogo, tema, moneda, ubicacion, vista] = await Promise.all([
    catalogoTienda(),
    leerTemaPublico(),
    monedaTienda(monedaPedida),
    ubicacionVisitante(),
    pagina.bloques.some((b) => TIPOS_CON_PRECIOS.has(b.tipo)) ? vistaMayorista() : null,
  ]);
  // Revendedor con sesión: sus precios, calculados para esta petición (nunca en caché).
  const mayorista = vista
    ? { vista, moneda: monedaMayorista(vista, monedaPedida, ubicacion.moneda) }
    : null;
  return {
    ruta: pagina.ruta,
    catalogo,
    moneda,
    mayorista,
    metodosPago: tema.metodosPago,
    contacto: tema.contacto,
  };
}

const TIPOS_CON_PRECIOS = new Set<string>(['planes', 'servicios', 'ranking']);
/** Título y descripción para buscadores y redes a partir de la página publicada. */
export function metadatosPagina(p: { titulo: string; descripcion: string | null }): Metadata {
  return {
    title: p.titulo.includes('NV Streaming') ? { absolute: p.titulo } : p.titulo,
    ...(p.descripcion ? { description: p.descripcion } : {}),
    openGraph: { title: p.titulo, ...(p.descripcion ? { description: p.descripcion } : {}) },
  };
}
