'use client';

import clsx from 'clsx';
import {
  ChevronDown,
  Globe,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { Avatar } from '@/componentes/panel/avatar';
import { EnlaceAlPasar } from '@/componentes/panel/enlace-al-pasar';
import { ICONOS_CUENTA } from '@/componentes/panel/menu-cuenta';
import { llamarApi } from '@/lib/api-cliente';
import type { ContadorCuenta, ElementoCuenta } from '@/lib/navegacion';
import { abrirBuscador } from './buscador';

const LLAVE_CERRADOS = 'nv:menu-equipo-cerrados';
const LLAVE_RIEL = 'nv:lateral';
const EVENTO = 'nv:menu-equipo';

function leer(llave: string): string {
  try {
    return localStorage.getItem(llave) ?? '';
  } catch {
    return '';
  }
}

function guardar(llave: string, valor: string) {
  try {
    localStorage.setItem(llave, valor);
  } catch {
    // Sin almacenamiento: vale solo para esta visita.
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
 * Pone el modo del menú en <html> antes de pintar, para que el plegado no
 * «salte» al cargar. Va en el HTML del servidor (la política de contenido
 * admite scripts en línea).
 */
export const SCRIPT_RIEL = `try{if(localStorage.getItem('${LLAVE_RIEL}')==='riel')document.documentElement.dataset.lateral='riel'}catch(e){}`;

function alternarRiel() {
  const riel = document.documentElement.dataset.lateral !== 'riel';
  if (riel) document.documentElement.dataset.lateral = 'riel';
  else delete document.documentElement.dataset.lateral;
  guardar(LLAVE_RIEL, riel ? 'riel' : '');
}

function alternarGrupo(titulo: string) {
  const cerrados = new Set(leer(LLAVE_CERRADOS).split('|').filter(Boolean));
  if (cerrados.has(titulo)) cerrados.delete(titulo);
  else cerrados.add(titulo);
  guardar(LLAVE_CERRADOS, [...cerrados].join('|'));
}

function Insignia({ n, className }: { n: number; className?: string }) {
  return (
    <em
      className={clsx(
        'grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-aviso px-1 font-mono text-[0.66rem] font-bold text-fondo not-italic tabular-nums',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
      <span className="sr-only"> por atender</span>
    </em>
  );
}

const claseAccion =
  'grid size-9 shrink-0 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] hover:text-tinta';

/**
 * Menú lateral del equipo en escritorio: fijo a la izquierda y a toda la
 * altura, con la marca, el buscador, los módulos por grupos (plegables) con lo
 * que espera en cada uno y, abajo, la persona con sus accesos. Se pliega a una
 * columna de iconos y lo recuerda en este navegador.
 */
export function LateralEquipo({
  grupos,
  titulos,
  contadores,
  persona,
  gestor,
  marca,
}: {
  grupos: ElementoCuenta[][];
  titulos: (string | null)[];
  contadores: Partial<Record<ContadorCuenta, number>>;
  persona: { letras: string; nombre: string; rol: string };
  /** Dirección de NV Gestor, si está configurado. */
  gestor: string | null;
  /** Logo y sello de la cabecera del menú. */
  marca: ReactNode;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const riel = useSyncExternalStore(
    suscribir,
    () => leer(LLAVE_RIEL) === 'riel',
    () => false,
  );
  const cerrados = new Set(
    useSyncExternalStore(
      suscribir,
      () => leer(LLAVE_CERRADOS),
      () => '',
    )
      .split('|')
      .filter(Boolean),
  );
  const activo = (href: string) =>
    ruta === href || (href !== '/admin' && ruta.startsWith(`${href}/`));

  async function salir() {
    setSaliendo(true);
    await llamarApi('POST', '/auth/cierre-sesion');
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <aside
      aria-label="Menú del equipo"
      className="fixed inset-y-0 left-0 z-30 hidden w-(--ancho-lateral) flex-col border-r border-borde bg-[rgb(6_9_22/0.94)] backdrop-blur-xl nav:flex"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 px-3 riel:justify-center riel:px-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 riel:hidden">{marca}</div>
        <button
          type="button"
          onClick={alternarRiel}
          className={claseAccion}
          aria-label={riel ? 'Mostrar el menú completo' : 'Plegar el menú'}
          title={riel ? 'Mostrar el menú completo' : 'Plegar el menú'}
        >
          {riel ? (
            <PanelLeftOpen className="size-[1.1rem]" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-[1.1rem]" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="shrink-0 px-3 pb-2 riel:px-2">
        <button
          type="button"
          onClick={abrirBuscador}
          aria-keyshortcuts="Control+K Meta+K"
          title="Buscar (Ctrl K)"
          className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-borde bg-white/[0.03] px-3 text-sm text-tinta-tenue hover:border-borde-fuerte hover:text-tinta-suave riel:justify-center riel:px-0"
        >
          <Search className="size-4 shrink-0 text-cian" aria-hidden="true" />
          <span className="flex-1 text-left riel:sr-only">Buscar…</span>
          <kbd className="rounded-md border border-borde px-1.5 font-mono text-[0.68rem] riel:hidden">
            Ctrl K
          </kbd>
        </button>
      </div>

      <nav
        aria-label="Módulos del equipo"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin] riel:px-2"
      >
        {grupos.map((grupo, i) => {
          if (grupo.length === 0) return null;
          const titulo = titulos[i];
          // Plegado a iconos se ven todos; un grupo con la página abierta no se queda cerrado.
          const abierto =
            riel || !titulo || !cerrados.has(titulo) || grupo.some((e) => activo(e.href));
          const pendientes = grupo.reduce(
            (n, e) => n + ((e.contador && contadores[e.contador]) || 0),
            0,
          );
          const idLista = `lateral-${i}`;
          return (
            <div key={titulo ?? `g${i}`} className="grid">
              {titulo ? (
                <button
                  type="button"
                  onClick={() => alternarGrupo(titulo)}
                  aria-expanded={abierto}
                  aria-controls={idLista}
                  className="mt-3 flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.68rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase hover:text-tinta-suave riel:hidden"
                >
                  <span className="flex-1 truncate text-left">{titulo}</span>
                  {!abierto && pendientes > 0 && <Insignia n={pendientes} />}
                  <ChevronDown
                    className={clsx('size-3.5 transition-transform', !abierto && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                i > 0 && <hr className="my-2 border-0 border-t border-borde" />
              )}
              {titulo && <hr className="my-2 hidden border-0 border-t border-borde riel:block" />}
              <ul id={idLista} hidden={!abierto} className="grid gap-px">
                {grupo.map((e) => {
                  const Icono = ICONOS_CUENTA[e.icono];
                  const n = (e.contador && contadores[e.contador]) || 0;
                  const esActivo = activo(e.href);
                  return (
                    <li key={e.href}>
                      <EnlaceAlPasar
                        href={e.href}
                        aria-current={esActivo ? 'page' : undefined}
                        title={riel ? e.etiqueta : undefined}
                        className={clsx(
                          'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.86rem] font-medium transition-colors riel:justify-center riel:px-0',
                          esActivo
                            ? 'bg-marca/[0.18] text-tinta before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-marca riel:before:-left-2'
                            : 'text-tinta-suave hover:bg-white/[0.05] hover:text-tinta',
                        )}
                      >
                        <Icono
                          className={clsx('size-[1.05rem] shrink-0', esActivo && 'text-cian')}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate riel:sr-only">{e.etiqueta}</span>
                        {n > 0 && (
                          <Insignia
                            n={n}
                            className="riel:absolute riel:top-0.5 riel:right-0.5 riel:h-4 riel:min-w-4 riel:text-[0.6rem]"
                          />
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

      <div className="shrink-0 border-t border-borde p-3 riel:px-2">
        <div className="flex items-center gap-2.5 riel:flex-col">
          <Link
            href="/ajustes"
            title="Perfil y seguridad"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 hover:bg-white/[0.05] riel:flex-none"
          >
            <Avatar letras={persona.letras} className="size-9 text-[0.8rem]" />
            <span className="grid min-w-0 leading-tight riel:hidden">
              <b className="truncate text-sm">{persona.nombre}</b>
              <span className="truncate text-xs text-tinta-tenue">{persona.rol}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void salir()}
            disabled={saliendo}
            aria-busy={saliendo || undefined}
            className={claseAccion}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            {saliendo ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 riel:mt-1 riel:flex-col riel:items-center">
          <Link
            href="/"
            title="Ver tienda"
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde text-xs font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta riel:size-9 riel:flex-none"
          >
            <Globe className="size-3.5 text-cian" aria-hidden="true" />
            <span className="riel:sr-only">Ver tienda</span>
          </Link>
          {gestor && (
            <a
              href={gestor}
              target="_blank"
              rel="noopener noreferrer"
              title="NV Gestor (se abre en otra pestaña)"
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-borde text-xs font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta riel:size-9 riel:flex-none"
            >
              <LayoutGrid className="size-3.5 text-violeta" aria-hidden="true" />
              <span className="riel:sr-only">NV Gestor</span>
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
