// Sin 'use client': piezas de la cabecera de los paneles (revendedor y equipo).
import type { ReactNode } from 'react';

/** Enlace de la cabecera de un panel («Ver tienda», saldo); en el teléfono no se muestra. */
export const claseEnlaceCabecera =
  'hidden h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta nav:inline-flex';

/** Sello junto al logo de la cabecera («Revendedor», «Equipo»). */
export function Sello({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-cian/40 bg-cian/[0.08] px-2.5 py-1 text-[0.68rem] font-bold tracking-[0.12em] whitespace-nowrap text-cian uppercase max-sm:px-1.5 max-sm:py-0.5 max-sm:text-[0.6rem] max-sm:tracking-[0.08em]">
      {children}
    </span>
  );
}
