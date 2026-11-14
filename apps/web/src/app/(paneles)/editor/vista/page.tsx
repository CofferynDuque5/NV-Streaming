import { RUTA_PAGINA_REGEX } from '@nv/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VistaPagina } from '@/componentes/editor-tienda/vista';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Vista previa' };

const TITULOS: Record<string, string> = {
  '/': 'Portada',
  '/catalogo': 'Catálogo',
  '/carrito': 'Carrito',
  '/revendedores/ganancias': 'Ganancias de revendedores',
  '/politicas': 'Políticas',
  '/terminos': 'Términos',
  '/privacidad': 'Privacidad',
  '/ingresar': 'Ingresar',
};

/** Vista previa de cualquier página pública de la tienda (solo rutas internas). */
export default async function Vista({
  searchParams,
}: {
  searchParams: Promise<{ ruta?: string | string[] }>;
}) {
  await requerirSesion({ permiso: 'sitio.editar' });
  const { ruta } = await searchParams;
  const destino = typeof ruta === 'string' ? ruta : '/';
  // Solo páginas de la propia tienda: nada de direcciones de afuera.
  if (destino !== '/' && !RUTA_PAGINA_REGEX.test(destino)) notFound();
  const titulo =
    TITULOS[destino] ??
    (destino.startsWith('/catalogo/') ? `Servicio: ${destino.slice(10)}` : destino);
  return <VistaPagina ruta={destino} titulo={titulo} />;
}
