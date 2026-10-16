'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useRef, useState } from 'react';

/** Flechas para mover un carril horizontal (el carril también se desliza con el dedo). */
export function Carril({
  children,
  etiqueta,
  cabecera,
  acciones,
}: {
  children: ReactNode;
  etiqueta: string;
  /** Encabezado de la sección, a la izquierda de la fila de controles. */
  cabecera?: ReactNode;
  /** Contenido a la izquierda de las flechas (p. ej. «Ver todo»). */
  acciones?: ReactNode;
}) {
  const pista = useRef<HTMLDivElement>(null);
  const id = useId();
  function mover(dir: 1 | -1) {
    const el = pista.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  }
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">{cabecera}</div>
        <div className="flex items-center gap-3">
          {acciones}
          <div className="hidden gap-2 @2xl:flex">
            {([-1, 1] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => mover(d)}
                aria-controls={id}
                aria-label={d < 0 ? `Anteriores de ${etiqueta}` : `Siguientes de ${etiqueta}`}
                className="grid size-10 place-items-center rounded-xl border border-borde bg-white/[0.02] hover:border-borde-fuerte"
              >
                {d < 0 ? (
                  <ChevronLeft className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={pista}
        id={id}
        role="region"
        aria-label={etiqueta}
        tabIndex={0}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] @2xl:-mx-6 @2xl:scroll-px-6 @2xl:px-6 [&>*]:w-[15.5rem] [&>*]:shrink-0 [&>*]:snap-start @2xl:[&>*]:w-[17rem]"
      >
        {children}
      </div>
    </div>
  );
}

export interface ElementoFiltrable {
  clave: string;
  grupo: string | null;
  nodo: ReactNode;
}

/** Rejilla con chips que filtran por universo sin salir de la página. */
export function RejillaFiltrable({
  chips,
  elementos,
  etiqueta,
}: {
  chips: { valor: string; texto: string; color: string }[];
  elementos: ElementoFiltrable[];
  etiqueta: string;
}) {
  const [filtro, setFiltro] = useState<string | null>(null);
  const visibles = filtro ? elementos.filter((e) => e.grupo === filtro) : elementos;
  return (
    <div className="grid gap-5">
      {chips.length > 1 && (
        <div role="group" aria-label={`Filtrar ${etiqueta}`} className="flex flex-wrap gap-2">
          <button
            type="button"
            className="chip"
            aria-pressed={filtro === null}
            onClick={() => setFiltro(null)}
          >
            Todos
          </button>
          {chips.map((c) => (
            <button
              key={c.valor}
              type="button"
              className="chip"
              aria-pressed={filtro === c.valor}
              onClick={() => setFiltro(c.valor)}
            >
              <i
                className="size-2 rounded-full"
                style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                aria-hidden="true"
              />
              {c.texto}
            </button>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {visibles.length} {visibles.length === 1 ? 'servicio' : 'servicios'}
      </p>
      <ul className={clsx('grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4')}>
        {visibles.map((e) => (
          <li key={e.clave} className="grid">
            {e.nodo}
          </li>
        ))}
      </ul>
    </div>
  );
}
