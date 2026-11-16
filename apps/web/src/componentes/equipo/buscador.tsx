'use client';

import type { ClienteResumen, CuentaServicioResumen, Pagina } from '@nv/shared';
import clsx from 'clsx';
import {
  CornerDownLeft,
  History,
  KeyRound,
  LayoutGrid,
  LoaderCircle,
  Search,
  UserRound,
  X,
} from 'lucide-react';
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

type Alcance = 'todo' | 'modulos' | 'clientes' | 'cuentas';

/** Marca en el texto lo que coincide con la búsqueda (sin importar tildes ni mayúsculas). */
function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  if (!busqueda) return <>{texto}</>;
  // Se normaliza letra por letra para que las posiciones coincidan con el texto original.
  const letras = [...texto];
  const plano = letras.map((l) => normal(l));
  const unido = plano.join('');
  const desde = unido.indexOf(busqueda);
  if (desde < 0) return <>{texto}</>;
  let cuenta = 0;
  let inicio = -1;
  let fin = letras.length;
  for (let i = 0; i < letras.length; i++) {
    if (inicio < 0 && cuenta >= desde) inicio = i;
    cuenta += plano[i]!.length;
    if (inicio >= 0 && cuenta >= desde + busqueda.length) {
      fin = i + 1;
      break;
    }
  }
  if (inicio < 0) return <>{texto}</>;
  return (
    <>
      {letras.slice(0, inicio).join('')}
      <mark className="rounded-[0.25rem] bg-cian/20 px-px text-tinta">
        {letras.slice(inicio, fin).join('')}
      </mark>
      {letras.slice(fin).join('')}
    </>
  );
}

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
  const [alcance, setAlcance] = useState<Alcance>('todo');
  const alcances: { clave: Alcance; etiqueta: string }[] = [
    { clave: 'todo', etiqueta: 'Todo' },
    { clave: 'modulos', etiqueta: 'Módulos' },
    ...(clientes ? [{ clave: 'clientes' as const, etiqueta: 'Clientes' }] : []),
    ...(cuentas ? [{ clave: 'cuentas' as const, etiqueta: 'Cuentas' }] : []),
  ];
  const conModulos = alcance === 'todo' || alcance === 'modulos';

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
    const conClientes = clientes && (alcance === 'todo' || alcance === 'clientes');
    const conCuentas = cuentas && (alcance === 'todo' || alcance === 'cuentas');
    if (consulta.length < 2 || (!conClientes && !conCuentas)) return;
    let vigente = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      const q = encodeURIComponent(consulta);
      void Promise.all([
        conClientes
          ? llamarApi<Pagina<ClienteResumen>>(
              'GET',
              `/clientes?busqueda=${q}&porPagina=5&estado=todos`,
            )
          : null,
        conCuentas
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
        setRemotos({ para: `${alcance}:${consulta}`, resultados });
      });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [consulta, clientes, cuentas, alcance]);

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
  const ultimos: Resultado[] =
    n || !conModulos
      ? []
      : recientes
          .map((h) => destinos.find((d) => d.href === h))
          .filter((d): d is DestinoBuscador => !!d)
          .map((d) => comoResultado(d, 'reciente'));
  const locales: Resultado[] = (conModulos ? destinos : [])
    .filter((d) => !n || normal(`${d.etiqueta} ${d.detalle} ${d.claves ?? ''}`).includes(n))
    .sort((a, b) => (n ? puntaje(a) - puntaje(b) : 0))
    .slice(0, n ? 8 : destinos.length)
    .map((d) => comoResultado(d, 'destino'));
  if (!n) {
    // Por grupo (en el orden en que aparece cada uno), para que las flechas sigan la lista.
    const orden = [...new Set(locales.map((r) => r.detalle))];
    locales.sort((a, b) => orden.indexOf(a.detalle) - orden.indexOf(b.detalle));
  }
  const externos =
    consulta.length >= 2 && remotos.para === `${alcance}:${consulta}` ? remotos.resultados : [];
  const resultados = [...ultimos, ...locales, ...externos];
  const actual = Math.min(marcado, Math.max(0, resultados.length - 1));

  function cerrar() {
    dialogo.current?.close();
    setTexto('');
    setMarcado(0);
    setAlcance('todo');
  }

  function cambiarAlcance(paso: 1 | -1) {
    const i = alcances.findIndex((a) => a.clave === alcance);
    setAlcance(alcances[(i + paso + alcances.length) % alcances.length]!.clave);
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
    } else if (e.key === 'Tab') {
      // Tab cambia entre «Todo», «Módulos», «Clientes» y «Cuentas».
      e.preventDefault();
      cambiarAlcance(e.shiftKey ? -1 : 1);
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
    'Cuentas',
    indexados.filter(({ r }) => r.tipo === 'cuenta'),
  );

  const total = resultados.length;

  return (
    <dialog
      ref={dialogo}
      aria-label="Buscador del panel"
      onClose={() => {
        setTexto('');
        setMarcado(0);
        setAlcance('todo');
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
      className="mx-auto mt-[8vh] w-[calc(100%-1.5rem)] max-w-[44rem] overflow-hidden rounded-[1.4rem] border border-borde-fuerte bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/65 backdrop:backdrop-blur-md max-sm:mt-3"
    >
      <div className="border-b border-borde bg-gradient-to-b from-marca/[0.09] to-transparent px-3 pt-3 pb-2.5 sm:px-4">
        <div className="flex items-center gap-2.5 rounded-2xl border border-borde-fuerte bg-hundida px-3.5 focus-within:border-cian/60 focus-within:ring-2 focus-within:ring-cian/20">
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
            className="h-13 min-w-0 flex-1 bg-transparent text-[1.05rem] outline-none placeholder:text-tinta-tenue"
          />
          {texto ? (
            <button
              type="button"
              onClick={() => {
                setTexto('');
                setMarcado(0);
                entrada.current?.focus();
              }}
              className="grid size-7 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
              aria-label="Borrar la búsqueda"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={cerrar}
            className="hidden rounded-md border border-borde px-1.5 font-mono text-[0.7rem] text-tinta-tenue hover:text-tinta sm:inline"
            aria-label="Cerrar el buscador"
          >
            Esc
          </button>
        </div>
        {alcances.length > 1 && (
          <div
            role="tablist"
            aria-label="Dónde buscar"
            className="mt-2.5 flex items-center gap-1.5 overflow-x-auto"
          >
            {alcances.map((a) => (
              <button
                key={a.clave}
                type="button"
                role="tab"
                aria-selected={alcance === a.clave}
                onClick={() => {
                  setAlcance(a.clave);
                  setMarcado(0);
                  entrada.current?.focus();
                }}
                className={clsx(
                  'h-7 shrink-0 rounded-full border px-3 text-xs font-semibold',
                  alcance === a.clave
                    ? 'border-cian/50 bg-cian/[0.14] text-tinta'
                    : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
                )}
              >
                {a.etiqueta}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-xs text-tinta-tenue max-sm:hidden">
              {consulta ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : 'Tab cambia'}
            </span>
          </div>
        )}
      </div>
      <ul
        ref={lista}
        id={`${ids}-lista`}
        role="listbox"
        aria-label="Resultados"
        className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain p-2 sm:p-2.5"
      >
        {total === 0 && (
          <li
            className="grid justify-items-center gap-2 px-3 py-10 text-center"
            role="presentation"
          >
            <span className="grid size-11 place-items-center rounded-2xl border border-borde bg-white/[0.03] text-tinta-tenue">
              {buscando ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-5" aria-hidden="true" />
              )}
            </span>
            <span className="text-sm font-semibold">
              {buscando
                ? 'Buscando…'
                : consulta
                  ? `Nada coincide con «${consulta}»`
                  : 'Escribe para buscar'}
            </span>
            {!buscando && consulta && alcance !== 'todo' ? (
              <button
                type="button"
                onClick={() => setAlcance('todo')}
                className="text-xs font-semibold text-cian hover:underline"
              >
                Buscar en todo
              </button>
            ) : !buscando && consulta.length === 1 && (clientes || cuentas) ? (
              <span className="text-xs text-tinta-suave">
                Clientes y cuentas se buscan desde 2 letras.
              </span>
            ) : null}
          </li>
        )}
        {secciones.map(({ titulo, filas }) => (
          <li key={titulo} role="presentation" className="mb-1 last:mb-0">
            <p className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5 text-[0.66rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
              {titulo}
              <span className="h-px flex-1 bg-borde" aria-hidden="true" />
            </p>
            <ul role="presentation" className="grid gap-0.5">
              {filas.map(({ r, i }) => {
                const Icono = r.icono
                  ? ICONOS_CUENTA[r.icono]
                  : r.tipo === 'cliente'
                    ? UserRound
                    : r.tipo === 'cuenta'
                      ? KeyRound
                      : LayoutGrid;
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
                      'relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm',
                      marcadoAhora
                        ? 'bg-gradient-to-r from-marca/[0.2] to-marca/[0.06] ring-1 ring-marca/30'
                        : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-9 shrink-0 place-items-center rounded-[0.7rem] border',
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
                      <span className="truncate font-semibold text-tinta">
                        <Resaltado texto={r.etiqueta} busqueda={n} />
                      </span>
                      {r.tipo !== 'destino' || n ? (
                        <span className="truncate text-xs text-tinta-tenue">
                          <Resaltado texto={r.detalle} busqueda={n} />
                        </span>
                      ) : null}
                    </span>
                    {r.tipo === 'cliente' || r.tipo === 'cuenta' ? (
                      <span className="shrink-0 rounded-full border border-borde px-2 py-px text-[0.66rem] font-semibold text-tinta-suave max-sm:hidden">
                        {r.tipo === 'cliente' ? 'Cliente' : 'Cuenta'}
                      </span>
                    ) : null}
                    <CornerDownLeft
                      className={clsx(
                        'size-3.5 shrink-0',
                        marcadoAhora ? 'text-tinta-suave' : 'invisible',
                      )}
                      aria-hidden="true"
                    />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde bg-black/10 px-4 py-2.5 text-xs text-tinta-tenue max-sm:hidden">
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>↑</kbd>
          <kbd className={claseTecla}>↓</kbd> moverte
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>Enter</kbd> abrir
        </span>
        {alcances.length > 1 && (
          <span className="inline-flex items-center gap-1.5">
            <kbd className={claseTecla}>Tab</kbd> filtrar
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <kbd className={claseTecla}>Esc</kbd> cerrar
        </span>
        <span className="ml-auto">Ctrl K o / desde cualquier página</span>
      </p>
    </dialog>
  );
}
