import clsx from 'clsx';
import { Check } from 'lucide-react';

const PASOS = ['Carrito', 'Pago', 'Listo'] as const;

/**
 * Pasos de la compra (Carrito, Pago y Listo). `actual` es el paso en curso;
 * los anteriores se ven hechos. En el teléfono solo se nombra el actual.
 */
export function PasosCompra({ actual, className }: { actual: 1 | 2 | 3; className?: string }) {
  return (
    <ol
      aria-label="Pasos de la compra"
      className={clsx('flex items-center gap-2 text-[0.8rem] text-tinta-tenue', className)}
    >
      {PASOS.map((texto, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const enCurso = n === actual;
        return (
          <li
            key={texto}
            aria-current={enCurso ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-2 whitespace-nowrap',
              i > 0 && 'before:h-px before:w-5 before:bg-borde-fuerte',
              enCurso && 'font-semibold text-tinta',
            )}
          >
            <span
              className={clsx(
                'grid size-6 place-items-center rounded-full border font-titulo text-xs font-bold',
                hecho && 'border-exito bg-exito text-fondo',
                enCurso && 'border-cian text-cian shadow-[0_0_14px_-4px_var(--nv-cian)]',
                !hecho && !enCurso && 'border-borde-fuerte',
              )}
            >
              {hecho ? <Check className="size-3.5" aria-hidden="true" /> : n}
            </span>
            <span className={clsx(!enCurso && 'max-sm:sr-only')}>
              {texto}
              {hecho && <span className="sr-only"> (hecho)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
