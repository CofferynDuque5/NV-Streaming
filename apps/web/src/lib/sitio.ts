import {
  type CatalogoPublico,
  esPaletaSitio,
  PALETA_PREDETERMINADA,
  type PaginaPublicada,
  type PaletaSitio,
} from '@nv/shared';
import type { Metadata } from 'next';
import type { ContextoBloques } from '@/componentes/bloques/bloques';
import { monedaValida } from '@/componentes/planes';
import { monedaMayorista } from '@/componentes/planes-mayoristas';
import { vistaMayorista } from './revendedor-publico';
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

/** Paleta elegida para el sitio; la de NV si la API no responde. */
export async function leerPaletaSitio(): Promise<PaletaSitio> {
  try {
    const r = await fetch(`${API}/api/v1/sitio/publico/tema`, CACHE_SITIO);
    const datos = r.ok ? ((await r.json()) as { paleta?: unknown }) : null;
    return esPaletaSitio(datos?.paleta) ? datos.paleta : PALETA_PREDETERMINADA;
  } catch {
    return PALETA_PREDETERMINADA;
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

/** Datos para los bloques: solo se consulta el catálogo si la página lo muestra. */
export async function contextoPublico(
  pagina: Pick<PaginaPublicada, 'ruta' | 'bloques'>,
  monedaPedida: string | undefined,
): Promise<ContextoBloques> {
  if (!pagina.bloques.some((b) => b.tipo === 'planes')) {
    return { ruta: pagina.ruta, catalogo: null, moneda: 'USD' };
  }
  const [catalogo, ubicacion, vista] = await Promise.all([
    leerCatalogo(),
    ubicacionVisitante(),
    vistaMayorista(),
  ]);
  const moneda = monedaValida(catalogo?.monedas ?? ['USD'], monedaPedida, ubicacion.moneda);
  // Revendedor con sesión: sus precios, calculados para esta petición (nunca en caché).
  const mayorista = vista
    ? { vista, moneda: monedaMayorista(vista, monedaPedida, ubicacion.moneda) }
    : null;
  return { ruta: pagina.ruta, catalogo, moneda, mayorista };
}

/** Título y descripción para buscadores y redes a partir de la página publicada. */
export function metadatosPagina(p: { titulo: string; descripcion: string | null }): Metadata {
  return {
    title: p.titulo.includes('NV Streaming') ? { absolute: p.titulo } : p.titulo,
    ...(p.descripcion ? { description: p.descripcion } : {}),
    openGraph: { title: p.titulo, ...(p.descripcion ? { description: p.descripcion } : {}) },
  };
}
