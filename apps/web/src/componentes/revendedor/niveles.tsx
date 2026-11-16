import clsx from 'clsx';
import { BadgeCheck, Check, Trophy } from 'lucide-react';

export interface NivelVista {
  id: string;
  nombre: string;
  descripcion: string | null;
  requisito: string | null;
  beneficios: string[];
  /** Ganancia (o descuento) promedio frente al precio al público, en %. */
  margenPromedio: number | null;
}

/**
 * Los niveles de revendedor como escalera: qué se pide para llegar, cuánto se
 * gana en promedio y qué beneficios trae cada uno. Marca el nivel actual.
 */
export function TarjetasNiveles({
  niveles,
  actualId,
}: {
  niveles: NivelVista[];
  actualId?: string | null;
}) {
  const indiceActual = niveles.findIndex((n) => n.id === actualId);
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Niveles de revendedor">
      {niveles.map((n, i) => {
        const actual = n.id === actualId;
        const siguiente = indiceActual >= 0 && i === indiceActual + 1;
        return (
          <li
            key={n.id}
            aria-current={actual ? 'true' : undefined}
            className={clsx(
              'relative grid content-start gap-3 rounded-2xl border p-4',
              actual
                ? 'border-marca bg-marca/10 shadow-[0_0_0_1px_var(--nv-marca)]'
                : 'border-borde bg-white/[0.03]',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <span className="text-[0.7rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
                  Nivel {i + 1}
                </span>
                <p className="flex items-center gap-1.5 text-lg font-semibold">
                  <Trophy className="size-4 text-[#fde68a]" aria-hidden="true" />
                  {n.nombre}
                </p>
              </div>
              {actual ? (
                <span className="rounded-full bg-marca px-2 py-0.5 text-xs font-bold text-white">
                  Tu nivel
                </span>
              ) : siguiente ? (
                <span className="rounded-full bg-aviso/20 px-2 py-0.5 text-xs font-bold text-[#fde68a]">
                  Siguiente
                </span>
              ) : null}
            </div>
            {n.margenPromedio !== null && (
              <p className="text-sm text-tinta-suave">
                Ganas en promedio{' '}
                <b className="font-titulo text-xl text-exito tabular-nums">{n.margenPromedio}%</b>{' '}
                del precio al público
              </p>
            )}
            {n.requisito && (
              <p className="flex gap-1.5 text-sm">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden="true" />
                <span>
                  <span className="text-tinta-tenue">Para llegar: </span>
                  {n.requisito}
                </span>
              </p>
            )}
            {n.descripcion && <p className="text-sm text-tinta-suave">{n.descripcion}</p>}
            {n.beneficios.length > 0 && (
              <ul className="grid gap-1.5 text-sm" aria-label={`Beneficios del nivel ${n.nombre}`}>
                {n.beneficios.map((b) => (
                  <li key={b} className="flex gap-1.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
