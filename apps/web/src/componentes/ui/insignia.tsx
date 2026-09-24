import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tono = 'neutro' | 'marca' | 'acento' | 'exito' | 'aviso' | 'peligro';

const estilos: Record<Tono, string> = {
  neutro: 'bg-hundida text-tinta-suave border-borde',
  marca: 'bg-marca-suave text-marca border-marca/25',
  acento: 'bg-acento-suave text-acento border-acento/25',
  exito: 'bg-exito-suave text-exito border-exito/25',
  aviso: 'bg-aviso-suave text-aviso border-aviso/25',
  peligro: 'bg-peligro-suave text-peligro border-peligro/25',
};

export function Insignia({
  tono = 'neutro',
  children,
  className,
}: {
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        estilos[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}
