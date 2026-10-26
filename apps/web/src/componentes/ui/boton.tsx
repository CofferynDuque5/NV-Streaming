import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
type Tamano = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-[0.875rem] border font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55';

// Una sola variante principal por bloque (regla de jerarquía); las demás acompañan.
const variantes: Record<Variante, string> = {
  primario:
    'border-transparent bg-[linear-gradient(180deg,var(--nv-boton-desde),var(--nv-boton-hasta))] text-[var(--nv-boton-tinta)] shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_10px_30px_-10px_var(--nv-boton-brillo)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.2)_inset,0_14px_36px_-10px_var(--nv-boton-brillo)] hover:brightness-110 active:translate-y-px',
  secundario:
    'border-borde-fuerte bg-white/[0.03] text-tinta hover:border-cian hover:bg-white/[0.06]',
  fantasma: 'border-transparent text-tinta-suave hover:bg-white/[0.05] hover:text-tinta',
  peligro: 'border-peligro/40 bg-peligro-suave text-peligro hover:bg-peligro hover:text-fondo',
};

const tamanos: Record<Tamano, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[0.95rem]',
};

export function clasesBoton(
  variante: Variante = 'primario',
  tamano: Tamano = 'md',
  className?: string,
) {
  return clsx(base, variantes[variante], tamanos[tamano], className);
}

interface PropsBoton extends ComponentProps<'button'> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  icono?: ReactNode;
}

export function Boton({
  variante,
  tamano,
  cargando,
  icono,
  className,
  children,
  disabled,
  type = 'button',
  ...resto
}: PropsBoton) {
  return (
    <button
      type={type}
      className={clasesBoton(variante, tamano, className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : icono}
      {children}
    </button>
  );
}

interface PropsEnlace extends ComponentProps<typeof Link> {
  variante?: Variante;
  tamano?: Tamano;
}

export function BotonEnlace({ variante, tamano, className, ...resto }: PropsEnlace) {
  return <Link className={clasesBoton(variante, tamano, className)} {...resto} />;
}
