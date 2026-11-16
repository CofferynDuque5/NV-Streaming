import type { CategoriaServicio } from '@nv/shared';
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { IconoCategoria, Orbe } from './iconos';

/**
 * Imagen del servicio: su logo subido, o su tarjeta con marca si existe
 * (public/servicios) y, si no, un orbe con el icono de su universo en el color
 * del servicio.
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
  /** Dirección de la imagen (ver `aspectoServicio`). */
  arte: string | null;
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
  if (!arte && orbe === 'xl') {
    return (
      <TarjetaGenerada
        nombre={nombre}
        categoria={categoria}
        color={color}
        className={className}
        decorativa={decorativa}
      />
    );
  }
  if (!arte) {
    return (
      <span className={clsx('grid place-items-center', className)}>
        <Orbe categoria={categoria} color={color} tamano={orbe} />
        {!decorativa && <span className="sr-only">{nombre}</span>}
      </span>
    );
  }
  const subida = !arte.startsWith('/servicios/');
  // «h-auto» solo si quien la usa no fija el alto: si no, gana sobre «h-40» y
  // la tarjeta se estira a todo el ancho y se corta (ViX, YouTube…).
  const conAlto = /(^|[\s:])h-/.test(className ?? '');
  return (
    <img
      src={arte}
      alt={decorativa ? '' : `Tarjeta de ${nombre}`}
      width={258}
      height={397}
      loading={prioridad ? 'eager' : 'lazy'}
      fetchPriority={prioridad ? 'high' : undefined}
      decoding="async"
      className={clsx(
        'max-w-full object-contain drop-shadow-[0_18px_30px_rgb(0_0_0/0.55)]',
        !conAlto && 'h-auto',
        subida && 'rounded-2xl',
        className,
      )}
    />
  );
}

/**
 * Tarjeta con el nombre del servicio, para los que no tienen imagen subida ni
 * tarjeta de marca (Rakuten Viki, Prime Video, Plex…): misma forma y brillo
 * que las tarjetas de marca, en el color del servicio.
 */
function TarjetaGenerada({
  nombre,
  categoria,
  color,
  className,
  decorativa,
}: {
  nombre: string;
  categoria: CategoriaServicio | null;
  color: string;
  className?: string | undefined;
  decorativa: boolean;
}) {
  return (
    <span
      role={decorativa ? undefined : 'img'}
      aria-label={decorativa ? undefined : `Tarjeta de ${nombre}`}
      aria-hidden={decorativa || undefined}
      className={clsx(
        'tarjeta-generada relative grid aspect-[258/397] max-w-full grid-rows-[1fr_auto] justify-items-center overflow-hidden rounded-[0.9rem] border border-white/15 px-[8%] pb-[9%] drop-shadow-[0_18px_30px_rgb(0_0_0/0.55)] @container/g',
        className,
      )}
      style={{ '--c': color } as CSSProperties}
    >
      {/* Ranura para colgar, como en las tarjetas de regalo. */}
      <i className="absolute top-[4%] left-1/2 h-[3.5%] w-[34%] -translate-x-1/2 rounded-full bg-black/70" />
      <span className="grid place-items-center self-center rounded-full border border-white/25 bg-white/10 p-[14%] shadow-[0_0_30px_var(--c)]">
        <IconoCategoria categoria={categoria} className="size-[18cqw] min-h-5 min-w-5 text-white" />
      </span>
      <b className="w-full text-center font-titulo text-[clamp(0.7rem,13cqw,1.6rem)] leading-[1.05] font-extrabold tracking-tight text-white uppercase [text-shadow:0_2px_12px_rgb(0_0_0/0.6)]">
        {nombre}
      </b>
    </span>
  );
}
