'use client';

import { type BloqueSitio, MAX_BLOQUES } from '@nv/shared';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, GripVertical, Layers, Plus } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { INFO_BLOQUES, resumenBloque } from './modelo';

/**
 * Lista de bloques de la página: tocar uno lo elige; se ordena arrastrando el
 * asa (ratón o dedo), con las flechas de cada fila o, con el asa enfocada,
 * con las teclas ↑ y ↓.
 */
export function ListaBloques({
  bloques,
  seleccionado,
  errores,
  onElegir,
  onMover,
  onMoverA,
  onAnadir,
  onDatos,
}: {
  bloques: BloqueSitio[];
  seleccionado: string | null;
  /** Errores por id de bloque. */
  errores: ReadonlyMap<string, number>;
  onElegir: (id: string) => void;
  onMover: (i: number, d: number) => void;
  /** Mueve el bloque para que quede antes de la posición `a` (0…n). */
  onMoverA: (id: string, a: number) => void;
  onAnadir: () => void;
  onDatos: () => void;
}) {
  const n = bloques.length;
  const lista = useRef<HTMLOListElement>(null);
  const [arrastre, setArrastre] = useState<{ id: string; a: number | null } | null>(null);

  function empezar(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastre({ id, a: null });
  }
  function mover(e: PointerEvent<HTMLButtonElement>) {
    if (!arrastre || !lista.current) return;
    const filas = [...lista.current.querySelectorAll<HTMLElement>(':scope > li')];
    let a = filas.findIndex((f) => {
      const r = f.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (a < 0) a = filas.length;
    if (a !== arrastre.a) setArrastre({ ...arrastre, a });
  }
  function soltar(ok: boolean) {
    if (arrastre && ok && arrastre.a !== null) onMoverA(arrastre.id, arrastre.a);
    setArrastre(null);
  }
  function teclas(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      onMover(i, -1);
    } else if (e.key === 'ArrowDown' && i < n - 1) {
      e.preventDefault();
      onMover(i, 1);
    }
  }

  return (
    <>
      <header className="ed-col-cab">
        <div className="grid min-w-0">
          <b className="ed-col-t">Bloques</b>
          <small className={clsx('ed-cuenta', n >= MAX_BLOQUES && 'mal')}>
            {n} de {MAX_BLOQUES} bloques
          </small>
        </div>
        {n > 0 && (
          <button
            type="button"
            className="ed-anadir"
            disabled={n >= MAX_BLOQUES}
            onClick={onAnadir}
          >
            <Plus className="size-4" aria-hidden="true" />
            Añadir bloque
          </button>
        )}
      </header>
      {n === 0 ? (
        <div className="ed-vacio">
          <span className="orbe" style={{ '--c': '#4f8dff' } as CSSProperties} aria-hidden="true">
            <Layers />
          </span>
          <b>Esta página está vacía</b>
          <p>Empieza con una portada o un texto. Caben hasta {MAX_BLOQUES} bloques.</p>
          <button type="button" className="ed-anadir" onClick={onAnadir}>
            <Plus className="size-4" aria-hidden="true" />
            Añadir bloque
          </button>
        </div>
      ) : (
        <ol className="ed-lista" ref={lista} aria-label="Bloques de la página">
          {bloques.map((b, i) => {
            const info = INFO_BLOQUES[b.tipo];
            const nErr = errores.get(b.id) ?? 0;
            const actual = b.id === seleccionado;
            return (
              <li
                key={b.id || i}
                data-edsel={b.id}
                className={clsx(
                  'ed-b',
                  actual && 'actual',
                  nErr > 0 && 'mal',
                  arrastre?.id === b.id && 'arrastrando',
                  arrastre?.a === i && arrastre.id !== b.id && 'sobre-arriba',
                  arrastre?.a === n && i === n - 1 && arrastre.id !== b.id && 'sobre-abajo',
                )}
              >
                <button
                  type="button"
                  className="ed-asa"
                  aria-label={`Mover el bloque ${i + 1}: arrastra o usa las flechas del teclado`}
                  title="Arrastra para mover"
                  onPointerDown={(e) => empezar(e, b.id)}
                  onPointerMove={mover}
                  onPointerUp={() => soltar(true)}
                  onPointerCancel={() => soltar(false)}
                  onKeyDown={(e) => teclas(e, i)}
                >
                  <GripVertical aria-hidden="true" />
                </button>
                <span className="ed-num" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  type="button"
                  className="ed-b-t"
                  aria-current={actual}
                  aria-label={`Bloque ${i + 1}: ${info.nombre}${nErr ? ', por revisar' : ''}`}
                  onClick={() => onElegir(b.id)}
                >
                  <b>
                    <span className="ed-b-n">{info.nombre}</span>
                    {info.grupo === 'tienda' && <span className="ed-vivo">En vivo</span>}
                    {nErr > 0 && <span className="ed-rev">Revisar</span>}
                  </b>
                  <small>{resumenBloque(b) || ' '}</small>
                </button>
                <div className="ed-mov">
                  <button
                    type="button"
                    aria-label={`Subir el bloque ${i + 1}`}
                    disabled={i === 0}
                    onClick={() => onMover(i, -1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar el bloque ${i + 1}`}
                    disabled={i === n - 1}
                    onClick={() => onMover(i, 1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="ed-pista">
        {n > 0 && (
          <p>
            Toca un bloque para editarlo. Arrastra{' '}
            <GripVertical className="inline size-3.5 align-[-2px]" aria-hidden="true" /> o usa las
            flechas para moverlo.
          </p>
        )}
        <button type="button" className={claseEnlace} onClick={onDatos}>
          Título y descripción de la página
        </button>
      </div>
    </>
  );
}
