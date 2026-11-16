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
 * tarjeta de marca (Rakuten Viki, Prime Video, Plex…): la misma tarjeta de
 * regalo que las de marca (negra, ranura para colgar, trazos de luz en su
 * color, «PREMIUM · GLOBAL ACCESS»), dibujada en el navegador.
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
        'tarjeta-generada relative grid aspect-[258/397] max-w-full content-center justify-items-center gap-[4%] overflow-hidden rounded-[0.9rem] px-[8%] drop-shadow-[0_18px_30px_rgb(0_0_0/0.55)] @container/g',
        className,
      )}
      style={{ '--c': color } as CSSProperties}
    >
      {/* Trazos de luz, como en las tarjetas de marca. */}
      <svg
        viewBox="0 0 258 397"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <filter id="tg-brillo" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g fill="none" stroke="var(--c)" strokeLinecap="round">
          <g filter="url(#tg-brillo)" opacity="0.75">
            <path d="M-30 330 C 40 250, 210 300, 250 150 S 210 -10, 120 -20" strokeWidth="9" />
            <path d="M290 380 C 200 330, 30 360, 10 230 S 90 40, 190 10" strokeWidth="7" />
          </g>
          <g opacity="0.9">
            <path d="M-30 330 C 40 250, 210 300, 250 150 S 210 -10, 120 -20" strokeWidth="1.6" />
            <path d="M-20 345 C 60 270, 220 315, 262 160 S 220 0, 140 -25" strokeWidth="0.8" />
            <path d="M290 380 C 200 330, 30 360, 10 230 S 90 40, 190 10" strokeWidth="1.4" />
            <path d="M300 395 C 205 345, 18 372, -2 235 S 80 30, 200 -2" strokeWidth="0.7" />
          </g>
        </g>
      </svg>
      {/* Ranura para colgar, como en las tarjetas de regalo. */}
      <i className="absolute top-[3.5%] left-1/2 h-[4%] w-[30%] -translate-x-1/2 rounded-full border border-white/25 bg-black shadow-[inset_0_2px_4px_rgb(0_0_0/0.9)]" />
      <span className="relative grid place-items-center rounded-full border border-white/30 bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.35),rgb(255_255_255/0.06)_60%)] p-[11%] shadow-[0_0_28px_var(--c)]">
        <IconoCategoria categoria={categoria} className="size-[16cqw] min-h-5 min-w-5 text-white" />
      </span>
      <b className="relative w-full text-center font-titulo text-[clamp(0.7rem,12cqw,1.6rem)] leading-[1.05] font-extrabold tracking-tight text-white uppercase [text-shadow:0_2px_12px_rgb(0_0_0/0.8)]">
        {nombre}
      </b>
      <span className="relative grid justify-items-center gap-[0.15em] text-center leading-none">
        <span className="text-[clamp(0.45rem,6.5cqw,0.85rem)] font-semibold tracking-[0.2em] text-white/90">
          PREMIUM
        </span>
        <span className="text-[clamp(0.35rem,4cqw,0.6rem)] tracking-[0.12em] text-white/60">
          GLOBAL ACCESS
        </span>
      </span>
    </span>
  );
}
