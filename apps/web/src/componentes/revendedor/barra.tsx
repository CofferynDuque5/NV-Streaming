'use client';

import clsx from 'clsx';
import { Clock, House, type LucideIcon, Plus, UsersRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PESTANAS: [string, string, LucideIcon][] = [
  ['/revendedor', 'Resumen', House],
  ['/revendedor/catalogo', 'Vender', Plus],
  ['/revendedor/renovaciones', 'Renovar', Clock],
  ['/revendedor/clientes', 'Clientes', UsersRound],
  ['/revendedor/saldo', 'Saldo', Wallet],
];

/**
 * Pestañas del teléfono del panel del revendedor. «Renovar» lleva cuántos
 * servicios están vencidos o vencen en 7 días.
 */
export function BarraRevendedor({ urgentes }: { urgentes: number }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Accesos rápidos"
      className="barra-inferior vidrio fixed inset-x-2.5 bottom-[calc(0.6rem+env(safe-area-inset-bottom,0px))] z-40 grid grid-cols-5 rounded-[1.4rem] px-1 py-1.5 shadow-nv nav:hidden"
    >
      {PESTANAS.map(([href, texto, Icono]) => {
        const activa = href === '/revendedor' ? ruta === href : ruta.startsWith(href);
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
            {href === '/revendedor/renovaciones' && urgentes > 0 && (
              <em className="absolute top-0 left-1/2 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-aviso px-1 text-[0.62rem] font-bold text-fondo not-italic tabular-nums">
                {urgentes}
                <span className="sr-only">{urgentes === 1 ? 'urgente' : 'urgentes'}</span>
              </em>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
