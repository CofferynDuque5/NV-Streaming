'use client';

import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';

interface PropsCampo extends Omit<ComponentProps<'input'>, 'id'> {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
  accesorio?: ReactNode;
}

export const clasesEntrada =
  'h-11 w-full rounded-xl border border-borde-fuerte bg-hundida px-3.5 text-[0.95rem] text-tinta placeholder:text-tinta-tenue transition-colors hover:border-tinta-tenue focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca-suave aria-invalid:border-peligro aria-invalid:focus:ring-peligro-suave';

/** Campo de formulario con etiqueta, ayuda y error accesibles. */
export function Campo({
  etiqueta,
  error,
  ayuda,
  accesorio,
  className,
  type,
  ...resto
}: PropsCampo) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const esContrasena = type === 'password';
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clsx('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-tinta">
          {etiqueta}
        </label>
        {accesorio}
      </div>
      <div className="relative">
        <input
          id={id}
          type={esContrasena && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe || undefined}
          className={clsx(clasesEntrada, esContrasena && 'pr-11')}
          {...resto}
        />
        {esContrasena && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-tinta-tenue hover:text-tinta"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
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
