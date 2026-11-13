'use client';

import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { EnlaceAlPasar } from '@/componentes/panel/enlace-al-pasar';
import { ICONOS_CUENTA } from '@/componentes/panel/menu-cuenta';
import type { ContadorCuenta, ElementoCuenta } from '@/lib/navegacion';

const LLAVE = 'nv:menu-equipo-cerrados';
const EVENTO = 'nv:menu-equipo';

function leerCerrados(): string {
  try {
    return localStorage.getItem(LLAVE) ?? '';
  } catch {
    return '';
  }
}

function alternar(titulo: string) {
  const cerrados = new Set(leerCerrados().split('|').filter(Boolean));
  if (cerrados.has(titulo)) cerrados.delete(titulo);
  else cerrados.add(titulo);
  try {
    localStorage.setItem(LLAVE, [...cerrados].join('|'));
  } catch {
    // Sin almacenamiento: el grupo se pliega solo en esta visita.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener('storage', avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener('storage', avisar);
  };
}

/**
 * Menú del equipo en escritorio: grupos que se pliegan (y se recuerdan en este
 * navegador), el pendiente de cada módulo y, si es muy largo, su propio
 * desplazamiento para que nunca quede un módulo fuera de alcance.
 */
export function MenuEquipo({
  grupos,
  titulos,
  contadores,
}: {
  grupos: ElementoCuenta[][];
  titulos: (string | null)[];
  contadores: Partial<Record<ContadorCuenta, number>>;
}) {
  const ruta = usePathname();
  const cerrados = new Set(
    useSyncExternalStore(suscribir, leerCerrados, () => '')
      .split('|')
      .filter(Boolean),
  );
  const activo = (href: string) =>
    ruta === href || (href !== '/admin' && ruta.startsWith(`${href}/`));

  return (
    <nav
      aria-label="Módulos del equipo"
      className="grid gap-0.5 rounded-[1.25rem] border border-borde bg-[rgb(8_11_26/0.7)] p-2 max-cuenta:hidden"
    >
      {grupos.map((grupo, i) => {
        if (grupo.length === 0) return null;
        const titulo = titulos[i];
        // Un grupo con la página abierta no se queda plegado.
        const abierto = !titulo || !cerrados.has(titulo) || grupo.some((e) => activo(e.href));
        const pendientes = grupo.reduce(
          (n, e) => n + ((e.contador && contadores[e.contador]) || 0),
          0,
        );
        const idLista = `menu-equipo-${i}`;
        return (
          <div key={titulo ?? i} className="grid gap-0.5">
            {titulo ? (
              <button
                type="button"
                onClick={() => alternar(titulo)}
                aria-expanded={abierto}
                aria-controls={idLista}
                className="mt-1.5 flex min-h-9 items-center gap-2 rounded-lg px-3 text-[0.66rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase hover:bg-white/[0.04] hover:text-tinta-suave"
              >
                <span className="flex-1 text-left">{titulo}</span>
                {!abierto && pendientes > 0 && (
                  <em className="rounded-full bg-aviso/20 px-[0.45rem] py-px font-mono text-[0.7rem] font-bold tracking-normal text-[#fde68a] not-italic">
                    {pendientes}
                    <span className="sr-only"> por atender</span>
                  </em>
                )}
                <ChevronDown
                  className={clsx('size-3.5 transition-transform', !abierto && '-rotate-90')}
                  aria-hidden="true"
                />
              </button>
            ) : (
              i > 0 && <hr className="mx-1 my-1.5 border-0 border-t border-borde" />
            )}
            <ul id={idLista} hidden={!abierto} className="grid gap-0.5">
              {grupo.map((e) => {
                const Icono = ICONOS_CUENTA[e.icono];
                const n = (e.contador && contadores[e.contador]) || 0;
                const esActivo = activo(e.href);
                return (
                  <li key={e.href}>
                    <EnlaceAlPasar
                      href={e.href}
                      aria-current={esActivo ? 'page' : undefined}
                      className={clsx(
                        'relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                        esActivo
                          ? 'bg-marca/15 text-tinta shadow-[inset_3px_0_0_var(--nv-marca)]'
                          : 'text-tinta-suave hover:bg-white/[0.04] hover:text-tinta',
                      )}
                    >
                      <Icono className="size-[1.05rem] shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{e.etiqueta}</span>
                      {n > 0 && (
                        <em className="rounded-full bg-aviso/20 px-[0.45rem] py-px font-mono text-[0.7rem] font-bold text-[#fde68a] not-italic">
                          {n}
                          <span className="sr-only"> por atender</span>
                        </em>
                      )}
                    </EnlaceAlPasar>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
