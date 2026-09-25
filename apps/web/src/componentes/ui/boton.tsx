import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
type Tamano = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55';

const variantes: Record<Variante, string> = {
  primario:
    'bg-marca text-marca-tinta hover:bg-marca-fuerte shadow-[0_8px_24px_-12px_var(--nv-marca)]',
  secundario:
    'border border-borde-fuerte bg-superficie text-tinta hover:bg-elevada hover:border-tinta-tenue',
  fantasma: 'text-tinta-suave hover:bg-hundida hover:text-tinta',
  peligro:
    'border border-peligro/40 bg-peligro-suave text-peligro hover:bg-peligro hover:text-white',
};

const tamanos: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
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
