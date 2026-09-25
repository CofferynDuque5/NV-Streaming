import { esRutaReservada, RUTA_PAGINA_REGEX } from '@nv/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BloquesSitio } from '@/componentes/bloques/bloques';
import { contextoPublico, leerPaginaPublicada, metadatosPagina } from '@/lib/sitio';

type Props = {
  params: Promise<{ ruta: string[] }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
};

/** Página publicada con el editor visual. Sin publicar, archivada o reservada: 404. */
async function cargar(params: Props['params']) {
  const { ruta: segmentos } = await params;
  const ruta = `/${segmentos.join('/')}`;
  if (!RUTA_PAGINA_REGEX.test(ruta) || esRutaReservada(ruta)) notFound();
  const pagina = await leerPaginaPublicada(ruta);
  if (pagina === undefined) throw new Error('No pudimos cargar la página. Inténtalo de nuevo.');
  if (!pagina) notFound();
  return pagina;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadatosPagina(await cargar(params));
}

export default async function PaginaSitio({ params, searchParams }: Props) {
  const [pagina, { moneda }] = await Promise.all([cargar(params), searchParams]);
  const contexto = await contextoPublico(pagina, typeof moneda === 'string' ? moneda : undefined);
  return <BloquesSitio bloques={pagina.bloques} titulo={pagina.titulo} contexto={contexto} />;
}
