'use client';

import type { ClienteResumen, CuentaServicioResumen, Pagina } from '@nv/shared';
import clsx from 'clsx';
import { CornerDownLeft, History, KeyRound, LoaderCircle, Search, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ICONOS_CUENTA } from '@/componentes/panel/menu-cuenta';
import { llamarApi } from '@/lib/api-cliente';
import type { IconoCuenta } from '@/lib/navegacion';

/** Un destino del buscador: un módulo, una página de dentro o un atajo. */
export interface DestinoBuscador {
  etiqueta: string;
  href: string;
  icono: IconoCuenta;
  /** Grupo o descripción corta que se ve a la derecha. */
  detalle: string;
  /** Palabras extra con las que también se encuentra. */
  claves?: string;
}

interface Resultado {
  id: string;
  etiqueta: string;
  detalle: string;
  href: string;
  tipo: 'reciente' | 'destino' | 'cliente' | 'cuenta';
  icono?: IconoCuenta;
}

const LLAVE_RECIENTES = 'nv:buscador-recientes';

function leerRecientes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LLAVE_RECIENTES) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function recordar(href: string) {
  try {
    const lista = [href, ...leerRecientes().filter((h) => h !== href)].slice(0, 5);
    localStorage.setItem(LLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento: no hay recientes.
  }
}

/** Minúsculas y sin tildes, para que «codigos» encuentre «Códigos». */
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ABRIR = 'nv:abrir-buscador';

const claseTecla =
  'rounded-md border border-borde bg-white/[0.04] px-1.5 py-px font-mono text-[0.68rem] text-tinta-suave';

/** Abre el buscador desde cualquier botón del panel. */
export function abrirBuscador() {
  window.dispatchEvent(new Event(ABRIR));
}

/** Botón de la cabecera: «Buscar» con el atajo Ctrl K a la vista en escritorio. */
export function BotonBuscador() {
  return (
    <button
      type="button"
      onClick={abrirBuscador}
      className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
      aria-keyshortcuts="Control+K Meta+K"
    >
      <Search className="size-4 text-cian" aria-hidden="true" />
      <span className="max-sm:sr-only">Buscar</span>
      <kbd className="hidden rounded-md border border-borde px-1.5 font-mono text-[0.7rem] text-tinta-tenue lg:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

/**
 * Buscador del panel (Ctrl K o «/»): módulos y páginas a las que puede entrar
 * la persona y, si su rol los ve, clientes por nombre o correo y cuentas de
 * servicio por correo. Se mueve con las flechas y se abre con Enter.
 */
export function Buscador({
  destinos,
  clientes,
  cuentas,
}: {
  destinos: DestinoBuscador[];
  /** Puede buscar clientes (permiso clientes.ver). */
  clientes: boolean;
  /** Puede buscar cuentas de servicio (permiso cuentas.ver). */
  cuentas: boolean;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const ids = useId();
  const [texto, setTexto] = useState('');
  const [marcado, setMarcado] = useState(0);
  const [remotos, setRemotos] = useState<{ para: string; resultados: Resultado[] }>({
    para: '',
    resultados: [],
  });
  const [buscando, setBuscando] = useState(false);
  const [recientes, setRecientes] = useState<string[]>([]);

  // Ctrl K / Cmd K desde cualquier parte; «/» si no se está escribiendo en un campo.
  useEffect(() => {
    function abrir() {
      const d = dialogo.current;
      if (!d || d.open) return;
      setRecientes(leerRecientes());
      d.showModal();
      entrada.current?.select();
    }
    function tecla(e: globalThis.KeyboardEvent) {
      const enCampo =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        abrir();
      } else if (e.key === '/' && !enCampo && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        abrir();
      }
    }
    window.addEventListener('keydown', tecla);
    window.addEventListener(ABRIR, abrir);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener(ABRIR, abrir);
    };
  }, []);

  const consulta = texto.trim();
  // Clientes y cuentas: se piden a la API con una pausa corta mientras escribe.
  useEffect(() => {
    if (consulta.length < 2 || (!clientes && !cuentas)) return;
    let vigente = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      const q = encodeURIComponent(consulta);
      void Promise.all([
        clientes
          ? llamarApi<Pagina<ClienteResumen>>(
              'GET',
              `/clientes?busqueda=${q}&porPagina=5&estado=todos`,
            )
          : null,
        cuentas
          ? llamarApi<Pagina<CuentaServicioResumen>>('GET', `/cuentas?busqueda=${q}&porPagina=5`)
          : null,
      ]).then(([rc, rk]) => {
        setBuscando(false);
        if (!vigente) return;
        const resultados: Resultado[] = [
          ...(rc?.ok
            ? rc.datos.elementos.map((c) => ({
                id: `c-${c.id}`,
                etiqueta: c.nombre,
                detalle: c.correo ?? 'Cliente',
                href: `/admin/clientes/${c.id}`,
                tipo: 'cliente' as const,
              }))
            : []),
          ...(rk?.ok
            ? rk.datos.elementos.map((k) => ({
                id: `k-${k.id}`,
                etiqueta: `${k.servicio.nombre} · ${k.pista}`,
                detalle: `${k.perfiles.libres} libres de ${k.perfiles.total}`,
                href: `/admin/cuentas/${k.id}`,
                tipo: 'cuenta' as const,
              }))
            : []),
        ];
        setRemotos({ para: consulta, resultados });
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [consulta, clientes, cuentas]);

  const n = normal(consulta);
  // Primero lo que empieza por lo escrito, luego lo que lo lleva en el nombre y al final en la descripción.
  const puntaje = (d: DestinoBuscador) => {
    const nombre = normal(d.etiqueta);
    return nombre.startsWith(n) ? 0 : nombre.includes(n) ? 1 : 2;
  };
  const comoResultado = (d: DestinoBuscador, tipo: Resultado['tipo']): Resultado => ({
    id: `${tipo}-${d.href}`,
    etiqueta: d.etiqueta,
    detalle: d.detalle,
    href: d.href,
    tipo,
    icono: d.icono,
  });
  // Sin texto: lo último que abrió arriba y todos los módulos debajo, por grupo.
  const ultimos: Resultado[] = n
    ? []
    : recientes
        .map((h) => destinos.find((d) => d.href === h))
        .filter((d): d is DestinoBuscador => !!d)
        .map((d) => comoResultado(d, 'reciente'));
  const locales: Resultado[] = destinos
    .filter((d) => !n || normal(`${d.etiqueta} ${d.detalle} ${d.claves ?? ''}`).includes(n))
    .sort((a, b) => (n ? puntaje(a) - puntaje(b) : 0))
    .slice(0, n ? 8 : destinos.length)
    .map((d) => comoResultado(d, 'destino'));
  if (!n) {
    // Por grupo (en el orden en que aparece cada uno), para que las flechas sigan la lista.
    const orden = [...new Set(locales.map((r) => r.detalle))];
    locales.sort((a, b) => orden.indexOf(a.detalle) - orden.indexOf(b.detalle));
  }
  const externos = consulta.length >= 2 && remotos.para === consulta ? remotos.resultados : [];
  const resultados = [...ultimos, ...locales, ...externos];
  const actual = Math.min(marcado, Math.max(0, resultados.length - 1));

  function cerrar() {
    dialogo.current?.close();
    setTexto('');
    setMarcado(0);
  }

  function ir(r: Resultado | undefined) {
    if (!r) return;
    if (r.tipo === 'reciente' || r.tipo === 'destino') recordar(r.href);
    cerrar();
    router.push(r.href);
  }

  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const total = resultados.length;
      if (total === 0) return;
      const siguiente = (actual + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
      setMarcado(siguiente);
      lista.current
        ?.querySelector<HTMLElement>(`[data-i="${siguiente}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ir(resultados[actual]);
    }
  }

  // Secciones de la lista: sin texto, los módulos van por su grupo del menú.
  const indexados = resultados.map((r, i) => ({ r, i }));
  const secciones: { titulo: string; filas: typeof indexados }[] = [];
  const agregar = (titulo: string, filas: typeof indexados) => {
    if (filas.length) secciones.push({ titulo, filas });
  };
  agregar(
    'Recientes',
    indexados.filter(({ r }) => r.tipo === 'reciente'),
  );
  const destinosFilas = indexados.filter(({ r }) => r.tipo === 'destino');
  if (n) agregar('Ir a', destinosFilas);
  else {
    for (const grupo of [...new Set(destinosFilas.map(({ r }) => r.detalle))]) {
      agregar(
        grupo,
        destinosFilas.filter(({ r }) => r.detalle === grupo),
      );
    }
  }
  agregar(
    'Clientes',
    indexados.filter(({ r }) => r.tipo === 'cliente'),
  );
  agregar(
    'Cuentas de servicio',
    indexados.filter(({ r }) => r.tipo === 'cuenta'),
  );

  return (
    <dialog
      ref={dialogo}
      aria-label="Buscador del panel"
      onClose={() => {
        setTexto('');
        setMarcado(0);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
      className="mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-2xl rounded-nv border border-borde-fuerte bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-2.5 border-b border-borde px-4">
        {buscando && consulta.length >= 2 ? (
          <LoaderCircle className="size-5 shrink-0 animate-spin text-cian" aria-hidden="true" />
        ) : (
          <Search className="size-5 shrink-0 text-cian" aria-hidden="true" />
        )}
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => {
            setTexto(e.currentTarget.value);
            setMarcado(0);
          }}
          onKeyDown={teclado}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${ids}-lista`}
          aria-activedescendant={resultados[actual] ? `${ids}-${actual}` : undefined}
          aria-autocomplete="list"
          aria-label="Buscar en todo el panel"
          placeholder={
            clientes ? 'Módulo, cliente o correo de una cuenta…' : 'Buscar un módulo o página…'
          }
          autoComplete="off"
          spellCheck={false}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-tinta-tenue"
        />
        <kbd className="hidden rounded-md border border-borde px-1.5 font-mono text-[0.7rem] text-tinta-tenue sm:inline">
          Esc
        </kbd>
      </div>
      <ul
        ref={lista}
        id={`${ids}-lista`}
        role="listbox"
        aria-label="Resultados"
        className="max-h-[min(62vh,32rem)] overflow-y-auto overscroll-contain p-2"
      >
        {resultados.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-tinta-suave" role="presentation">
            {buscando ? 'Buscando…' : `Nada coincide con «${consulta}».`}
          </li>
        )}
        {secciones.map(({ titulo, filas }) => (
          <li key={titulo} role="presentation">
            <p className="px-3 pt-3 pb-1 text-[0.66rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
              {titulo}
            </p>
            <ul role="presentation" className="grid gap-px">
              {filas.map(({ r, i }) => {
                const Icono = r.icono
                  ? ICONOS_CUENTA[r.icono]
                  : r.tipo === 'cliente'
                    ? UserRound
                    : KeyRound;
                const marcadoAhora = i === actual;
                return (
                  <li
                    key={r.id}
                    id={`${ids}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={marcadoAhora}
                    onMouseMove={() => setMarcado(i)}
                    onClick={() => ir(r)}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm',
                      marcadoAhora ? 'bg-marca/[0.16]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-8 shrink-0 place-items-center rounded-lg border',
                        marcadoAhora
                          ? 'border-cian/40 bg-cian/10 text-cian'
                          : 'border-borde bg-white/[0.03] text-tinta-suave',
                      )}
                    >
                      {r.tipo === 'reciente' ? (
                        <History className="size-4" aria-hidden="true" />
                      ) : (
                        <Icono className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="truncate font-semibold text-tinta">{r.etiqueta}</span>
                      {r.tipo !== 'destino' || n ? (
                        <span className="truncate text-xs text-tinta-tenue">{r.detalle}</span>
                      ) : null}
                    </span>
                    {marcadoAhora && (
                      <CornerDownLeft
                        className="size-3.5 shrink-0 text-tinta-tenue"
                        aria-hidden="true"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde px-4 py-2.5 text-xs text-tinta-tenue">
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>↑</kbd>
          <kbd className={claseTecla}>↓</kbd> moverte
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>Enter</kbd> abrir
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>Esc</kbd> cerrar
        </span>
        <span className="ml-auto max-sm:hidden">Ctrl K o / desde cualquier página</span>
      </p>
    </dialog>
  );
}
