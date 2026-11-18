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
 * tarjeta de marca (Rakuten Viki, Prime Video, Plex…): la misma tarjeta que
 * las de marca (degradado de su color, haces de luz, ranura para colgar,
 * «PREMIUM» y «ORIGINAL»), dibujada en el navegador.
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
        'tarjeta-generada relative grid aspect-[258/397] max-w-full content-center justify-items-center gap-[3%] overflow-hidden rounded-[7%/4.5%] px-[7%] text-white @container/g',
        className,
      )}
      style={{ '--c': color } as CSSProperties}
    >
      {/* Haces de luz, como en las tarjetas de marca. */}
      <svg
        viewBox="0 0 258 397"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      >
        <g fill="none" stroke="rgb(255 255 255 / 0.75)" strokeLinecap="round">
          <path d="M-30 368 C 70 268, 190 338, 290 178" strokeWidth="2" />
          <path d="M-30 413 C 80 308, 200 358, 290 223" strokeWidth="1.3" opacity="0.8" />
          <path d="M-30 390 C 75 288, 195 348, 290 200" strokeWidth="0.7" opacity="0.6" />
          <path d="M-30 120 C 60 60, 180 150, 290 40" strokeWidth="1.1" opacity="0.6" />
          <path d="M-30 150 C 60 90, 190 170, 290 62" strokeWidth="0.7" opacity="0.4" />
        </g>
      </svg>
      <span className="relative grid place-items-center drop-shadow-[0_6px_14px_rgb(0_0_0/0.45)]">
        <IconoCategoria categoria={categoria} className="size-[30cqw] min-h-6 min-w-6 text-white" />
      </span>
      <b className="relative w-full text-center font-titulo text-[clamp(0.7rem,13cqw,2.1rem)] leading-[1.05] font-extrabold tracking-tight uppercase italic [text-shadow:0_3px_14px_rgb(0_0_0/0.55)]">
        {nombre}
      </b>
      <span className="relative pl-[0.42em] text-[clamp(0.4rem,5cqw,0.8rem)] font-semibold tracking-[0.42em] text-white/90">
        PREMIUM
      </span>
      <span className="absolute inset-x-0 bottom-[6.5%] pl-[0.6em] text-center text-[clamp(0.35rem,4.2cqw,0.7rem)] tracking-[0.6em] text-white/80">
        ORIGINAL
      </span>
    </span>
  );
}
