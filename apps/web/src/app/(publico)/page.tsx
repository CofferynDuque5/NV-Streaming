import { BLOQUES_INICIO, PAGINA_INICIO } from '@nv/shared';
import type { Metadata } from 'next';
import { BloquesSitio } from '@/componentes/bloques/bloques';
import { contextoPublico, leerPaginaPublicada, metadatosPagina } from '@/lib/sitio';

/**
 * Portada de respaldo: el mismo contenido que publicó la semilla. Se muestra si
 * la API no responde o todavía no hay una portada publicada, para que el sitio
 * nunca se quede en blanco.
 */
const RESPALDO = {
  ruta: '/',
  titulo: PAGINA_INICIO.titulo,
  descripcion: PAGINA_INICIO.descripcion,
  bloques: BLOQUES_INICIO,
};

async function paginaInicio() {
  const publicada = await leerPaginaPublicada('/');
  return publicada && publicada.bloques.length > 0 ? publicada : RESPALDO;
}

export async function generateMetadata(): Promise<Metadata> {
  const p = await paginaInicio();
  return { ...metadatosPagina(p), title: { absolute: p.titulo } };
}

export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const [pagina, { moneda }] = await Promise.all([paginaInicio(), searchParams]);
  const contexto = await contextoPublico(pagina, typeof moneda === 'string' ? moneda : undefined);
  return <BloquesSitio bloques={pagina.bloques} titulo={pagina.titulo} contexto={contexto} />;
}
