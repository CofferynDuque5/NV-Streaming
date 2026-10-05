'use client';

import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface Pestana {
  href: string;
  texto: string;
  icono: LucideIcon;
  /** Insignia ámbar con lo que espera en esa sección (0 o sin valor: no se muestra). */
  insignia?: { n: number; que: [string, string] };
}

/**
 * Pestañas fijas del teléfono de los paneles (revendedor y equipo). La raíz
 * del panel solo se marca en su propia página; las demás, también dentro.
 */
export function BarraInferior({ pestanas, raiz }: { pestanas: Pestana[]; raiz: string }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Accesos rápidos"
      className="barra-inferior vidrio fixed inset-x-2.5 bottom-[calc(0.6rem+env(safe-area-inset-bottom,0px))] z-40 grid auto-cols-fr grid-flow-col rounded-[1.4rem] px-1 py-1.5 shadow-nv nav:hidden"
    >
      {pestanas.map(({ href, texto, icono: Icono, insignia }) => {
        const activa =
          !href.includes('#') && (href === raiz ? ruta === href : ruta.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={clsx(
              'relative grid justify-items-center gap-0.5 rounded-xl py-1 text-[0.7rem] font-medium',
              activa ? 'text-cian' : 'text-tinta-suave',
            )}
          >
            <Icono className="size-5" aria-hidden="true" />
            {texto}
            {insignia && insignia.n > 0 && (
              <em className="absolute top-0 left-1/2 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-aviso px-1 text-[0.62rem] font-bold text-fondo not-italic tabular-nums">
                {insignia.n}
                <span className="sr-only"> {insignia.que[insignia.n === 1 ? 0 : 1]}</span>
              </em>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
