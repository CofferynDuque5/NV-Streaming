'use client';

import {
  categoriasTienda,
  duracionesCatalogo,
  type FiltrosCatalogo,
  filtrarCatalogo,
  formatearMonto,
  type Moneda,
  ORDENES_CATALOGO,
  type OrdenCatalogo,
  type ServicioTienda,
  valorEn,
} from '@nv/shared';
import clsx from 'clsx';
import { LayoutGrid, LayoutList, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { type EstadoCatalogo, POR_PAGINA } from './catalogo-estado';
import { Orbe } from './iconos';
import type { MayoristaTienda } from './precio-tarjeta';
import { FilaServicio, TarjetaServicio } from './tarjeta-servicio';

const NOMBRE_ORDEN: Record<OrdenCatalogo, string> = {
  recomendados: 'Recomendados',
  menor: 'Menor precio',
  mayor: 'Mayor precio',
  az: 'Nombre (A-Z)',
};

/** La misma URL con los filtros (conserva la moneda y otros parámetros ajenos). */
function urlDe(e: EstadoCatalogo): string {
  const u = new URL(window.location.href);
  const poner = (k: string, v: string | null) =>
    v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
  poner('q', e.texto.trim() || null);
  poner('categoria', e.categoria);
  poner('duracion', e.duracion);
  poner('max', e.precioMax === null ? null : String(e.precioMax));
  poner('orden', e.orden === 'recomendados' ? null : e.orden);
  poner('vista', e.vista === 'lista' ? 'lista' : null);
  return `${u.pathname}${u.search}`;
}

/** Número «redondo» hacia arriba (1, 2, 2,5 o 5 por potencia de 10) para los atajos de precio. */
function redondo(v: number): number {
  const base = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= v) return m * base;
  return 10 * base;
}

/** Rango de precios del catálogo en la moneda y hasta tres atajos. */
function rangoPrecios(servicios: ServicioTienda[], moneda: Moneda) {
  const valores = servicios
    .flatMap((s) => s.planes.map((p) => valorEn(p, moneda)))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (valores.length < 2) return null;
  const min = valores[0] ?? 0;
  const max = valores[valores.length - 1] ?? 0;
  if (max <= min) return null;
  const atajos = [0.25, 0.5, 0.75]
    .map((q) => redondo(valores[Math.floor(q * (valores.length - 1))] ?? 0))
    .filter((v, i, a) => v > min && v < max && a.indexOf(v) === i);
  const paso = redondo((max - min) / 100);
  return { min, max, atajos, paso };
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 border-t border-borde pt-4 first:border-0 first:pt-0">
      <legend className="float-left mb-3 font-titulo text-[0.95rem] font-bold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function PanelFiltros({
  estado,
  cambiar,
  rango,
  duraciones,
  moneda,
}: {
  estado: EstadoCatalogo;
  cambiar: (c: Partial<EstadoCatalogo>) => void;
  rango: ReturnType<typeof rangoPrecios>;
  duraciones: { clave: string; etiqueta: string }[];
  moneda: Moneda;
}) {
  const id = useId();
  const monto = (v: number) => formatearMonto(String(v), moneda);
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={`${id}-q`} className="font-titulo text-[0.95rem] font-bold">
          Buscar
        </label>
        <div className="flex h-11 items-center gap-2 rounded-[0.9rem] border border-borde-fuerte bg-hundida px-3 focus-within:border-cian">
          <Search className="size-4 shrink-0 text-cian" aria-hidden="true" />
          <input
            id={`${id}-q`}
            type="search"
            value={estado.texto}
            onChange={(e) => cambiar({ texto: e.target.value })}
            placeholder="Nombre del servicio"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-tinta-tenue"
          />
        </div>
      </div>
      {rango && (
        <Grupo titulo="Precio máximo">
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor={`${id}-max`} className="text-tinta-suave">
                Hasta
              </label>
              <b className="text-cian tabular-nums">
                {estado.precioMax === null ? 'Sin límite' : monto(estado.precioMax)}
              </b>
            </div>
            <input
              id={`${id}-max`}
              type="range"
              min={rango.min}
              max={rango.max}
              step={rango.paso}
              value={estado.precioMax ?? rango.max}
              aria-valuetext={estado.precioMax === null ? 'Sin límite' : monto(estado.precioMax)}
              onChange={(e) => {
                const v = Number(e.target.value);
                cambiar({ precioMax: v >= rango.max ? null : v });
              }}
              className="w-full accent-cian"
            />
            <div className="flex justify-between text-xs text-tinta-tenue tabular-nums">
              <span>{monto(rango.min)}</span>
              <span>{monto(rango.max)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rango.atajos.map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={estado.precioMax === v}
                onClick={() => cambiar({ precioMax: v })}
              >
                Hasta {monto(v)}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              aria-pressed={estado.precioMax === null}
              onClick={() => cambiar({ precioMax: null })}
            >
              Sin límite
            </button>
          </div>
        </Grupo>
      )}
      {duraciones.length > 1 && (
        <Grupo titulo="Duración del plan">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="chip"
              aria-pressed={estado.duracion === null}
              onClick={() => cambiar({ duracion: null })}
            >
              Todas
            </button>
            {duraciones.map((d) => (
              <button
                key={d.clave}
                type="button"
                className="chip"
                aria-pressed={estado.duracion === d.clave}
                onClick={() => cambiar({ duracion: d.clave })}
              >
                {d.etiqueta}
              </button>
            ))}
          </div>
          <p className="text-xs text-tinta-tenue">
            En el detalle de cada servicio eliges entre sus planes.
          </p>
        </Grupo>
      )}
    </div>
  );
}

/**
 * Catálogo con filtros: universo, búsqueda, precio máximo, duración y orden.
 * Todo se filtra con los precios que calculó la API; los filtros viven en la
 * URL para poder compartirla o volver atrás.
 */
export function CatalogoTienda({
  servicios,
  moneda,
  mayorista,
  inicial,
  pie,
}: {
  servicios: ServicioTienda[];
  moneda: Moneda;
  mayorista: MayoristaTienda | null;
  inicial: EstadoCatalogo;
  /** Contenido bajo los resultados (p. ej. «¿No encuentras tu servicio?»). */
  pie?: ReactNode;
}) {
  const [estado, setEstado] = useState(inicial);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const hoja = useRef<HTMLDialogElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const primeraCarga = useRef(true);

  // Con precios de revendedor, el precio al público no sirve de filtro.
  const rango = useMemo(
    () => (mayorista ? null : rangoPrecios(servicios, moneda)),
    [servicios, moneda, mayorista],
  );
  const duraciones = useMemo(() => duracionesCatalogo(servicios), [servicios]);
  const filtros: FiltrosCatalogo = {
    texto: estado.texto,
    duracion: estado.duracion,
    precioMax: estado.precioMax,
    orden: estado.orden,
  };
  const sinUniverso = filtrarCatalogo(servicios, moneda, filtros);
  const resultados = estado.categoria
    ? sinUniverso.filter((r) => r.item.servicio.categoria === estado.categoria)
    : sinUniverso;
  const universos = categoriasTienda(servicios, moneda).map((c) => ({
    ...c,
    resultados: sinUniverso.filter((r) => r.item.servicio.categoria === c.id).length,
  }));

  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    window.history.replaceState(window.history.state, '', urlDe(estado));
  }, [estado]);

  function cambiar(c: Partial<EstadoCatalogo>) {
    setEstado((e) => ({ ...e, ...c }));
    if (!('vista' in c) || Object.keys(c).length > 1) setMostrar(POR_PAGINA);
  }

  const activos: { clave: string; texto: string; quitar: Partial<EstadoCatalogo> }[] = [];
  if (estado.texto.trim())
    activos.push({ clave: 'q', texto: `«${estado.texto.trim()}»`, quitar: { texto: '' } });
  if (estado.categoria) {
    const u = universos.find((x) => x.id === estado.categoria);
    if (u) activos.push({ clave: 'cat', texto: u.nombre, quitar: { categoria: null } });
  }
  if (estado.duracion) {
    const d = duraciones.find((x) => x.clave === estado.duracion);
    if (d) activos.push({ clave: 'dur', texto: d.etiqueta, quitar: { duracion: null } });
  }
  if (estado.precioMax !== null && rango)
    activos.push({
      clave: 'max',
      texto: `Hasta ${formatearMonto(String(estado.precioMax), moneda)}`,
      quitar: { precioMax: null },
    });
  const limpiar = () => cambiar({ texto: '', categoria: null, duracion: null, precioMax: null });

  const visibles = resultados.slice(0, mostrar);
  const quedan = resultados.length - visibles.length;
  const nFiltros = activos.filter((a) => a.clave !== 'cat').length;
  const panel = (
    <PanelFiltros
      estado={estado}
      cambiar={cambiar}
      rango={rango}
      duraciones={duraciones}
      moneda={moneda}
    />
  );
  const texto = (n: number) => `${n} ${n === 1 ? 'resultado' : 'resultados'}`;

  return (
    <div className="grid gap-6">
      {universos.length > 0 && (
        <nav
          aria-label="Filtrar por universo"
          className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          <ul className="flex w-max gap-2.5 nav:w-auto nav:flex-wrap">
            <li>
              <button
                type="button"
                aria-pressed={estado.categoria === null}
                onClick={() => cambiar({ categoria: null })}
                className="tarjeta-universo"
                style={{ '--c': '#8b5cf6' } as CSSProperties}
              >
                <Orbe categoria={null} color="#8b5cf6" tamano="sm" />
                <span className="grid text-left">
                  <b className="font-titulo text-sm">Todo</b>
                  <span className="text-xs text-tinta-tenue">{texto(sinUniverso.length)}</span>
                </span>
              </button>
            </li>
            {universos.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={estado.categoria === u.id}
                  onClick={() => cambiar({ categoria: u.id })}
                  className="tarjeta-universo"
                  style={{ '--c': u.color } as CSSProperties}
                >
                  <Orbe categoria={u.id} color={u.color} tamano="sm" />
                  <span className="grid text-left">
                    <b className="font-titulo text-sm">{u.nombre}</b>
                    <span className="text-xs text-tinta-tenue">{texto(u.resultados)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="grid items-start gap-6 nav:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside
          aria-label="Filtros"
          className="tarjeta-brillo sticky top-40 hidden p-5 nav:block"
          style={{ '--c': '#5b98ff' } as CSSProperties}
        >
          <h2 className="mb-4 font-titulo text-lg font-bold">Filtros</h2>
          {panel}
        </aside>

        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="mr-auto text-sm text-tinta-suave" aria-live="polite">
              <b className="font-titulo text-base text-tinta">{resultados.length}</b>{' '}
              {resultados.length === 1 ? 'resultado' : 'resultados'}
            </p>
            <button
              type="button"
              onClick={() => hoja.current?.showModal()}
              className={clsx(clasesBoton('secundario', 'md', 'px-3.5'), 'nav:hidden')}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filtros
              {nFiltros > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-marca text-[0.7rem] font-bold text-marca-tinta">
                  {nFiltros}
                </span>
              )}
            </button>
            <label className="sr-only" htmlFor="orden-catalogo">
              Ordenar por
            </label>
            <select
              id="orden-catalogo"
              value={estado.orden}
              onChange={(e) => cambiar({ orden: e.target.value as OrdenCatalogo })}
              className="h-11 rounded-[0.875rem] border border-borde-fuerte bg-hundida px-3 text-sm text-tinta focus-visible:border-cian"
            >
              {ORDENES_CATALOGO.map((o) => (
                <option key={o} value={o}>
                  {NOMBRE_ORDEN[o]}
                </option>
              ))}
            </select>
            <div
              role="group"
              aria-label="Vista"
              className="hidden gap-1 rounded-[0.875rem] border border-borde p-1 @xl:flex"
            >
              {(
                [
                  ['rejilla', 'Ver en cuadrícula', LayoutGrid],
                  ['lista', 'Ver en lista', LayoutList],
                ] as const
              ).map(([v, etiqueta, Icono]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={estado.vista === v}
                  aria-label={etiqueta}
                  title={etiqueta}
                  onClick={() => cambiar({ vista: v })}
                  className="grid size-9 place-items-center rounded-[0.6rem] text-tinta-suave aria-pressed:bg-marca-suave aria-pressed:text-tinta"
                >
                  <Icono className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {activos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activos.map((a) => (
                <button
                  key={a.clave}
                  type="button"
                  onClick={() => cambiar(a.quitar)}
                  className="chip"
                  aria-label={`Quitar filtro ${a.texto}`}
                >
                  {a.texto}
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ))}
              {activos.length > 1 && (
                <button
                  type="button"
                  onClick={limpiar}
                  className="px-2 text-sm font-medium text-cian hover:underline"
                >
                  Quitar todos
                </button>
              )}
            </div>
          )}

          {resultados.length === 0 ? (
            <div className="grid justify-items-center gap-3 rounded-[1.3rem] border border-dashed border-borde-fuerte px-6 py-14 text-center">
              <Search className="size-6 text-tinta-tenue" aria-hidden="true" />
              <p className="font-titulo text-lg font-bold">
                No encontramos servicios con esos filtros
              </p>
              <p className="max-w-sm text-sm text-tinta-suave">
                Prueba con otro universo, sube el precio máximo o quita la duración.
              </p>
              <button type="button" onClick={limpiar} className={clasesBoton('primario', 'md')}>
                Quitar filtros
              </button>
            </div>
          ) : (
            <ul
              ref={lista}
              className={clsx(
                'grid gap-3 @xl:gap-4',
                estado.vista === 'lista'
                  ? 'grid-cols-1'
                  : 'grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4',
              )}
            >
              {visibles.map((r, i) => (
                <li key={r.item.servicio.id} className="grid">
                  {estado.vista === 'lista' ? (
                    <FilaServicio
                      item={r.item}
                      plan={r.plan}
                      moneda={moneda}
                      mayorista={mayorista}
                    />
                  ) : (
                    <TarjetaServicio
                      item={r.item}
                      plan={r.plan}
                      moneda={moneda}
                      mayorista={mayorista}
                      prioridad={i < 4}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {resultados.length > POR_PAGINA && (
            <div className="grid justify-items-center gap-3 pt-4">
              <p className="text-sm text-tinta-tenue">
                Viendo {visibles.length} de {resultados.length}
              </p>
              <div className="h-1 w-56 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-[image:var(--nv-degradado)]"
                  style={{ width: `${(visibles.length / resultados.length) * 100}%` }}
                />
              </div>
              {quedan > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const desde = visibles.length;
                    setMostrar((m) => m + POR_PAGINA);
                    // Lleva el foco al primer resultado nuevo cuando aparece.
                    requestAnimationFrame(() =>
                      lista.current?.children[desde]
                        ?.querySelector<HTMLElement>('a[href]:not([tabindex="-1"])')
                        ?.focus(),
                    );
                  }}
                  className={clasesBoton('secundario', 'md')}
                >
                  Cargar {Math.min(quedan, POR_PAGINA)} más
                </button>
              )}
            </div>
          )}
          {pie}
        </div>
      </div>

      <dialog
        ref={hoja}
        aria-label="Filtros"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88dvh] w-full max-w-none bg-transparent p-0 text-tinta backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-[nv-entrar_.25s_ease]"
      >
        <div className="flotante grid max-h-[88dvh] grid-rows-[auto_1fr_auto] rounded-t-[1.5rem]">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <h2 className="font-titulo text-lg font-bold">Filtros</h2>
            <button
              type="button"
              onClick={() => hoja.current?.close()}
              className="grid size-10 place-items-center rounded-xl border border-borde"
              aria-label="Cerrar filtros"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{panel}</div>
          <div className="flex gap-2 border-t border-borde px-5 py-4">
            <button type="button" onClick={limpiar} className={clasesBoton('secundario', 'md')}>
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => hoja.current?.close()}
              className={clasesBoton('primario', 'md', 'flex-1')}
            >
              Ver {texto(resultados.length)}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
