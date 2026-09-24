import type { Pagina, SuscripcionPublica } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NuevaSolicitud } from '@/componentes/cliente/soporte';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Nueva solicitud' };

export default async function NuevaSolicitudPagina({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const [{ datos }, { categoria }] = await Promise.all([
    leerApi<Pagina<SuscripcionPublica>>('/mi/suscripciones?porPagina=50'),
    searchParams,
  ]);
  return (
    <>
      <Link
        href="/cuenta/soporte"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Soporte
      </Link>
      <CabeceraPagina
        titulo="Nueva solicitud"
        descripcion="Cuanto más detalle nos des, antes podremos ayudarte."
      />
      <Tarjeta className="max-w-3xl p-5 sm:p-6">
        <NuevaSolicitud suscripciones={datos?.elementos ?? []} categoria={categoria} />
      </Tarjeta>
    </>
  );
}
