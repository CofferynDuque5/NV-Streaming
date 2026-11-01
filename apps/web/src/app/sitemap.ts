import type { MetadataRoute } from 'next';
import { leerCatalogo } from '@/lib/sitio';

const ORIGEN = process.env.WEB_ORIGEN ?? 'http://localhost:3000';

/** Se genera en cada petición: así incluye los servicios que se agregan al catálogo. */
export const dynamic = 'force-dynamic';

/** Páginas públicas de la tienda para los buscadores. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalogo = await leerCatalogo().catch(() => null);
  const fijas = [
    '',
    '/catalogo',
    '/planes',
    '/revendedores',
    '/politicas',
    '/terminos',
    '/privacidad',
  ];
  return [
    ...fijas.map((ruta) => ({ url: `${ORIGEN}${ruta}` })),
    ...(catalogo?.servicios ?? []).map((s) => ({ url: `${ORIGEN}/catalogo/${s.slug}` })),
  ];
}
