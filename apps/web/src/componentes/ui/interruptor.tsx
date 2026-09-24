import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

interface PropsInterruptor extends Omit<ComponentProps<'button'>, 'onClick' | 'role'> {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  cargando?: boolean;
}

/**
 * Interruptor de encendido y apagado (rol "switch"). Necesita un nombre
 * accesible: `aria-label` o `aria-labelledby`.
 */
export function Interruptor({
  activo,
  onCambiar,
  cargando,
  disabled,
  className,
  ...resto
}: PropsInterruptor) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-busy={cargando || undefined}
      disabled={disabled || cargando}
      onClick={() => onCambiar(!activo)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150',
        'focus-visible:ring-3 focus-visible:ring-marca-suave focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-55',
        activo ? 'border-marca bg-marca' : 'border-borde-fuerte bg-hundida',
        className,
      )}
      {...resto}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'grid size-4.5 place-items-center rounded-full shadow-sm transition-transform duration-150',
          activo
            ? 'translate-x-[1.375rem] bg-marca-tinta'
            : 'translate-x-[0.1875rem] bg-tinta-tenue',
        )}
      >
        {cargando && (
          <LoaderCircle
            className={clsx('size-3 animate-spin', activo ? 'text-marca' : 'text-superficie')}
          />
        )}
      </span>
    </button>
  );
}
