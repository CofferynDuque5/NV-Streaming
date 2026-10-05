import type { CategoriaServicio, ClaveArte } from '@nv/shared';
import clsx from 'clsx';
import { Orbe } from './iconos';

/**
 * Imagen del servicio: su tarjeta con marca si existe (public/servicios) y, si
 * no, un orbe con el icono de su universo en el color del servicio.
 */
export function ArteServicio({
  arte,
  nombre,
  categoria,
  color,
  className,
  prioridad,
  decorativa = true,
  orbe = 'xl',
}: {
  arte: ClaveArte | null;
  nombre: string;
  categoria: CategoriaServicio | null;
  color: string;
  className?: string;
  /** La imagen principal de la página: se carga sin esperar. */
  prioridad?: boolean;
  decorativa?: boolean;
  /** Tamaño del orbe cuando no hay imagen (en espacios pequeños, «sm»). */
  orbe?: 'sm' | 'md' | 'xl';
}) {
  if (!arte) {
    return (
      <span className={clsx('grid place-items-center', className)}>
        <Orbe categoria={categoria} color={color} tamano={orbe} />
        {!decorativa && <span className="sr-only">{nombre}</span>}
      </span>
    );
  }
  return (
    <img
      src={`/servicios/${arte}.webp`}
      alt={decorativa ? '' : `Tarjeta de ${nombre}`}
      width={258}
      height={397}
      loading={prioridad ? 'eager' : 'lazy'}
      fetchPriority={prioridad ? 'high' : undefined}
      decoding="async"
      className={clsx('h-auto object-contain drop-shadow-[0_18px_30px_rgb(0_0_0/0.55)]', className)}
    />
  );
}
