import type { NotaPublica } from '@nv/shared';
import clsx from 'clsx';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ListaNotas, NuevaNota } from '@/componentes/admin/notas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Notas y pendientes' };

export default async function Notas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'clientes.notas' });
  const hechas = (await searchParams).estado === 'hechas';
  const { datos } = await leerApi<NotaPublica[]>(
    `/notas?estado=${hechas ? 'hechas' : 'pendientes'}`,
  );
  const pestana = (activa: boolean) =>
    clsx(
      'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
      activa
        ? 'border-cian bg-acento-suave text-tinta'
        : 'border-borde text-tinta-suave hover:text-tinta',
    );

  return (
    <>
      <CabeceraPagina
        titulo="Notas y pendientes"
        descripcion="Lo que hay que entregar, renovar o cobrar, de un cliente o general. Con fecha y hora de aviso, sale en el inicio cuando llega el momento."
        acciones={<NuevaNota />}
      />
      <nav className="flex gap-2" aria-label="Notas">
        <Link
          href="/admin/notas"
          className={pestana(!hechas)}
          aria-current={hechas ? undefined : 'page'}
        >
          Pendientes
        </Link>
        <Link
          href="/admin/notas?estado=hechas"
          className={pestana(hechas)}
          aria-current={hechas ? 'page' : undefined}
        >
          Hechas
        </Link>
      </nav>
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar las notas. Recarga la página.</Alerta>
      ) : (
        <ListaNotas notas={datos} hechas={hechas} />
      )}
    </>
  );
}
