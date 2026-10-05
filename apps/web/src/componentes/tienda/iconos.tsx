import type { CategoriaServicio, Moneda } from '@nv/shared';
import clsx from 'clsx';
import {
  AppWindow,
  Cloud,
  Gamepad2,
  Layers,
  type LucideIcon,
  MonitorPlay,
  Music,
  Sparkles,
} from 'lucide-react';
import type { CSSProperties } from 'react';

export const ICONO_CATEGORIA: Record<CategoriaServicio, LucideIcon> = {
  streaming: MonitorPlay,
  musica: Music,
  ia: Sparkles,
  juegos: Gamepad2,
  software: AppWindow,
  nube: Cloud,
};

export function IconoCategoria({
  categoria,
  className,
}: {
  categoria: CategoriaServicio | null;
  className?: string;
}) {
  const Icono = categoria ? ICONO_CATEGORIA[categoria] : Layers;
  return <Icono className={className} aria-hidden="true" />;
}

/** Orbe de color con el icono del universo y una órbita punteada. */
export function Orbe({
  categoria,
  color,
  tamano = 'md',
  className,
}: {
  categoria: CategoriaServicio | null;
  color: string;
  tamano?: 'sm' | 'md' | 'xl';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'orbe',
        tamano === 'sm' && 'orbe-sm',
        tamano === 'xl' && 'orbe-xl',
        className,
      )}
      style={{ '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      <IconoCategoria categoria={categoria} />
    </span>
  );
}

const PAIS_MONEDA: Record<Moneda, string> = {
  VES: 'Venezuela',
  USD: 'Estados Unidos',
  EUR: 'la Unión Europea',
  COP: 'Colombia',
  PEN: 'Perú',
  ARS: 'Argentina',
};

function puntos(n: number, cx: number, cy: number, r: number, desde: number, paso: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((desde + i * paso) * Math.PI) / 180;
    return [
      Number((cx + r * Math.cos(a)).toFixed(2)),
      Number((cy + r * Math.sin(a)).toFixed(2)),
    ] as const;
  });
}

const ESTRELLAS_VE = puntos(8, 15, 13.4, 5.2, -155, 18.5);
const ESTRELLAS_UE = puntos(12, 15, 10, 6, 0, 30);
const ESTRELLAS_US = [
  [2, 2],
  [5, 2],
  [8, 2],
  [11, 2],
  [3.5, 4.4],
  [6.5, 4.4],
  [9.5, 4.4],
  [2, 6.8],
  [5, 6.8],
  [8, 6.8],
  [11, 6.8],
  [3.5, 9],
] as const;

function Dibujo({ moneda }: { moneda: Moneda }) {
  switch (moneda) {
    case 'VES':
      return (
        <>
          <rect width="30" height="6.67" fill="#fcd116" />
          <rect y="6.67" width="30" height="6.67" fill="#00247d" />
          <rect y="13.33" width="30" height="6.67" fill="#cf142b" />
          <g fill="#fff">
            {ESTRELLAS_VE.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r=".62" />
            ))}
          </g>
        </>
      );
    case 'USD':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#b22234" />
          ))}
          <rect width="13" height="10.77" fill="#3c3b6e" />
          <g fill="#fff">
            {ESTRELLAS_US.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r=".55" />
            ))}
          </g>
        </>
      );
    case 'EUR':
      return (
        <>
          <rect width="30" height="20" fill="#003399" />
          <g fill="#ffcc00">
            {ESTRELLAS_UE.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r=".85" />
            ))}
          </g>
        </>
      );
    case 'COP':
      return (
        <>
          <rect width="30" height="10" fill="#fcd116" />
          <rect y="10" width="30" height="5" fill="#003893" />
          <rect y="15" width="30" height="5" fill="#ce1126" />
        </>
      );
    case 'PEN':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="10" height="20" fill="#d91023" />
          <rect x="20" width="10" height="20" fill="#d91023" />
        </>
      );
    case 'ARS':
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="30" height="6.67" fill="#74acdf" />
          <rect y="13.33" width="30" height="6.67" fill="#74acdf" />
          <circle cx="15" cy="10" r="2.1" fill="#f6b40e" stroke="#85340a" strokeWidth=".35" />
        </>
      );
  }
}

/** Bandera de la moneda (dibujo propio, sin imágenes externas). */
export function Bandera({
  moneda,
  grande,
  decorativa,
}: {
  moneda: Moneda;
  grande?: boolean;
  decorativa?: boolean;
}) {
  return (
    <span
      className={clsx(
        'inline-grid flex-none overflow-hidden shadow-[0_0_0_1px_rgb(255_255_255/0.18),0_2px_6px_rgb(0_0_0/0.4)]',
        grande ? 'h-5 w-[30px] rounded-[5px]' : 'h-4 w-6 rounded-[4px]',
      )}
      {...(decorativa
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `Bandera de ${PAIS_MONEDA[moneda]}` })}
    >
      <svg viewBox="0 0 30 20" className="block size-full" aria-hidden="true">
        <Dibujo moneda={moneda} />
      </svg>
    </span>
  );
}
