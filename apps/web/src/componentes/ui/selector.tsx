'use client';

import clsx from 'clsx';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { clasesEntrada } from './clases';

interface PropsSelector extends Omit<ComponentProps<'select'>, 'id'> {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
}

/** Lista desplegable con etiqueta, ayuda y error accesibles (misma forma que `Campo`). */
export function Selector({ etiqueta, error, ayuda, className, children, ...resto }: PropsSelector) {
  const id = useId();
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={clsx('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe || undefined}
        className={clasesEntrada}
        {...resto}
      >
        {children}
      </select>
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-tinta-tenue">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

interface PropsArea extends Omit<ComponentProps<'textarea'>, 'id'> {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
}

/** Área de texto con etiqueta, ayuda y error accesibles. */
export function AreaTexto({ etiqueta, error, ayuda, className, rows = 4, ...resto }: PropsArea) {
  const id = useId();
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={clsx('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe || undefined}
        className={clsx(clasesEntrada, 'h-auto py-2.5 leading-relaxed')}
        {...resto}
      />
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-tinta-tenue">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

/** Casilla de verificación con texto. */
export function Casilla({
  etiqueta,
  ayuda,
  className,
  ...resto
}: Omit<ComponentProps<'input'>, 'type'> & { etiqueta: ReactNode; ayuda?: ReactNode }) {
  const id = useId();
  return (
    <div className={clsx('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-borde-fuerte accent-[var(--nv-marca)]"
        {...resto}
      />
      <label htmlFor={id} className="grid gap-0.5 text-sm">
        <span>{etiqueta}</span>
        {ayuda && <span className="text-xs text-tinta-tenue">{ayuda}</span>}
      </label>
    </div>
  );
}
