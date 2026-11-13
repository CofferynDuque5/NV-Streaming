import type { NotaPublica, Referencia } from '@nv/shared';
import clsx from 'clsx';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ListaNotas, NuevaNota } from '@/componentes/admin/notas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Notas y tareas' };

const VISTAS = [
  { id: 'todas', titulo: 'Todas' },
  { id: 'mias', titulo: 'Mis tareas' },
  { id: 'delegadas', titulo: 'Que delegué' },
] as const;
type Vista = (typeof VISTAS)[number]['id'];

export default async function Notas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'clientes.notas' });
  const q = await searchParams;
  const hechas = q.estado === 'hechas';
  const vista: Vista = VISTAS.some((v) => v.id === q.vista) ? (q.vista as Vista) : 'todas';
  const [{ datos }, { datos: equipo }] = await Promise.all([
    leerApi<NotaPublica[]>(`/notas?estado=${hechas ? 'hechas' : 'pendientes'}&vista=${vista}`),
    leerApi<Referencia[]>('/notas/equipo'),
  ]);
  const pestana = (activa: boolean) =>
    clsx(
      'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
      activa
        ? 'border-cian bg-acento-suave text-tinta'
        : 'border-borde text-tinta-suave hover:text-tinta',
    );
  const enlace = (cambios: { estado?: 'hechas' | null; vista?: Vista }) => {
    const p = new URLSearchParams();
    const e = cambios.estado !== undefined ? cambios.estado : hechas ? 'hechas' : null;
    const v = cambios.vista ?? vista;
    if (e) p.set('estado', e);
    if (v !== 'todas') p.set('vista', v);
    const s = p.toString();
    return s ? `/admin/notas?${s}` : '/admin/notas';
  };

  return (
    <>
      <CabeceraPagina
        titulo="Notas y tareas"
        descripcion="Lo que hay que entregar, renovar o cobrar, de un cliente o general. Asígnala a alguien del equipo para delegarla; con fecha y hora de aviso sale en el inicio cuando llega el momento."
        acciones={<NuevaNota equipo={equipo ?? []} />}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <nav className="flex flex-wrap gap-2" aria-label="Quién">
          {VISTAS.map((v) => (
            <Link
              key={v.id}
              href={enlace({ vista: v.id })}
              className={pestana(vista === v.id)}
              aria-current={vista === v.id ? 'page' : undefined}
            >
              {v.titulo}
            </Link>
          ))}
        </nav>
        <nav className="flex gap-2" aria-label="Estado">
          <Link
            href={enlace({ estado: null })}
            className={pestana(!hechas)}
            aria-current={hechas ? undefined : 'page'}
          >
            Pendientes
          </Link>
          <Link
            href={enlace({ estado: 'hechas' })}
            className={pestana(hechas)}
            aria-current={hechas ? 'page' : undefined}
          >
            Hechas
          </Link>
        </nav>
      </div>
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar las notas. Recarga la página.</Alerta>
      ) : (
        <ListaNotas notas={datos} hechas={hechas} />
      )}
    </>
  );
}
