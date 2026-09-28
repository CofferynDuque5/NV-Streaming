'use client';

import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  ChevronDown,
  House,
  LayoutGrid,
  Menu,
  Search,
  ShoppingCart,
  User,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { abrirCarrito, useCarrito } from '@/lib/carrito';
import { ArteServicio } from './arte';
import { Bandera, IconoCategoria, Orbe } from './iconos';
import {
  type CategoriaMenu,
  COOKIE_AVISO_TASA,
  type OpcionMoneda,
  type ServicioMenu,
  type SesionMenu,
} from './tipos';

/** Cierra un panel al hacer clic fuera o pulsar Escape. */
function useCerrarFuera(
  abierto: boolean,
  cerrar: () => void,
  ...refs: RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!abierto) return;
    function clic(e: PointerEvent) {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      cerrar();
    }
    function tecla(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') cerrar();
    }
    document.addEventListener('pointerdown', clic);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', clic);
      document.removeEventListener('keydown', tecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cerrar]);
}

function sinAcentos(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* ------------------------------------------------------------------ buscador */

/**
 * Buscador con resultados debajo del campo. Sin JavaScript es un formulario
 * que abre el catálogo filtrado (?q=). «/» lo enfoca desde cualquier parte.
 */
export function BuscadorTienda({
  servicios,
  className,
}: {
  servicios: ServicioMenu[];
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const caja = useRef<HTMLFormElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const q = sinAcentos(texto);
  const resultados = q
    ? servicios.filter((s) => sinAcentos(`${s.nombre} ${s.slug}`).includes(q)).slice(0, 6)
    : servicios.slice(0, 6);
  const mostrar = abierto && servicios.length > 0;

  useCerrarFuera(abierto, () => setAbierto(false), caja);

  useEffect(() => {
    function atajo(e: globalThis.KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Hay un buscador para el teléfono y otro para escritorio: solo responde el visible.
      if (!campo.current || campo.current.offsetParent === null) return;
      e.preventDefault();
      campo.current.focus();
    }
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  }, []);

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && mostrar && resultados[activo] && q) {
      e.preventDefault();
      setAbierto(false);
      router.push(`/catalogo/${resultados[activo].slug}`);
    }
  }

  return (
    <form
      ref={caja}
      role="search"
      action="/catalogo"
      className={clsx('relative', className)}
      onSubmit={(e) => {
        if (!texto.trim()) e.preventDefault();
        setAbierto(false);
      }}
    >
      <label className="flex h-11 items-center gap-2.5 rounded-[0.9rem] border border-borde-fuerte bg-[rgb(6_8_20/0.7)] px-3.5 transition-colors focus-within:border-cian hover:border-tinta-tenue">
        <Search className="size-4 shrink-0 text-cian" aria-hidden="true" />
        <span className="sr-only">Buscar servicios</span>
        <input
          ref={campo}
          type="search"
          name="q"
          value={texto}
          autoComplete="off"
          placeholder="Busca un servicio…"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && resultados[activo] ? `${id}-${activo}` : undefined}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setTexto(e.currentTarget.value);
            setActivo(0);
            setAbierto(true);
          }}
          onKeyDown={teclas}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-tinta outline-none placeholder:text-tinta-tenue [&::-webkit-search-cancel-button]:hidden"
        />
        {texto ? (
          <button
            type="button"
            onClick={() => {
              setTexto('');
              campo.current?.focus();
            }}
            className="grid size-7 place-items-center rounded-md text-tinta-tenue hover:text-tinta"
            aria-label="Borrar búsqueda"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd
            className="hidden rounded-md border border-borde-fuerte px-1.5 font-sans text-xs text-tinta-tenue nav:inline"
            aria-hidden="true"
          >
            /
          </kbd>
        )}
      </label>
      <div
        id={`${id}-lista`}
        role="listbox"
        aria-label="Resultados"
        hidden={!mostrar}
        className="flotante aparecer absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl"
      >
        <p className="px-4 pt-3 pb-1 text-[0.7rem] font-bold tracking-[0.16em] text-tinta-tenue uppercase">
          {q ? 'Resultados' : 'Servicios'}
        </p>
        {resultados.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-tinta-suave">
            No encontramos «{texto.trim()}». Prueba con otro nombre.
          </p>
        ) : (
          <ul className="grid p-1.5">
            {resultados.map((s, i) => (
              <li key={s.id} id={`${id}-${i}`} role="option" aria-selected={i === activo}>
                <Link
                  href={`/catalogo/${s.slug}`}
                  onClick={() => setAbierto(false)}
                  onMouseEnter={() => setActivo(i)}
                  tabIndex={-1}
                  className={clsx(
                    'flex items-center gap-3 rounded-xl px-2.5 py-2',
                    i === activo && 'bg-white/[0.06]',
                  )}
                >
                  <MiniArte servicio={s} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-semibold">{s.nombre}</span>
                    {s.desde && (
                      <span className="truncate text-xs text-tinta-tenue">
                        Desde {s.desde}
                        {s.duracion && ` · ${s.duracion}`}
                      </span>
                    )}
                  </span>
                  <ArrowRight className="size-4 text-tinta-tenue" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q && (
          <button
            type="submit"
            className="flex w-full items-center justify-between border-t border-borde px-4 py-3 text-sm text-cian hover:bg-white/[0.04]"
          >
            Ver todo en el catálogo <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}

function MiniArte({ servicio }: { servicio: ServicioMenu }) {
  return (
    <span
      className="grid h-11 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_60%,color-mix(in_srgb,var(--c)_40%,transparent),transparent_75%)]"
      style={{ '--c': servicio.color } as CSSProperties}
    >
      {servicio.arte ? (
        <ArteServicio
          arte={servicio.arte}
          nombre={servicio.nombre}
          categoria={servicio.categoria}
          color={servicio.color}
          className="h-10 w-auto"
        />
      ) : (
        <IconoCategoria categoria={servicio.categoria} className="size-4.5 text-white" />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------- monedas */

function hrefMoneda(ruta: string, params: URLSearchParams, moneda: string) {
  const p = new URLSearchParams(params);
  p.set('moneda', moneda);
  return `${ruta}?${p.toString()}`;
}

/**
 * Selector de moneda con banderas. Cada opción es un enlace normal (?moneda=):
 * la página se vuelve a pedir y todos los precios llegan de la API en esa moneda.
 */
export function MenuMonedas({
  monedas,
  actual,
  compacto,
}: {
  monedas: OpcionMoneda[];
  actual: OpcionMoneda;
  compacto?: boolean;
}) {
  const ruta = usePathname();
  const params = useSearchParams();
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  useCerrarFuera(abierto, () => setAbierto(false), caja);
  if (monedas.length <= 1) return null;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={`Moneda: ${actual.nombre}. Cambiar moneda`}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-11 items-center gap-2 rounded-[0.9rem] border border-borde bg-white/[0.02] px-2.5 text-sm transition-colors hover:border-borde-fuerte"
      >
        <Bandera moneda={actual.codigo} decorativa />
        {!compacto && (
          <>
            <b className="font-titulo">{actual.simbolo}</b>
            <span className="text-[0.7rem] font-bold tracking-wider text-tinta-tenue">
              {actual.codigo}
            </span>
          </>
        )}
        <ChevronDown className="size-3.5 text-tinta-tenue" aria-hidden="true" />
      </button>
      <div
        id={id}
        hidden={!abierto}
        className={clsx(
          'flotante aparecer absolute top-[calc(100%+0.5rem)] z-50 grid w-80 max-w-[calc(100vw-2rem)] gap-1 rounded-2xl p-2.5 shadow-nv',
          compacto ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      >
        <p className="px-2 pt-1 pb-1.5 text-[0.7rem] font-bold tracking-[0.16em] text-tinta-tenue uppercase">
          Ver precios en
        </p>
        <nav aria-label="Moneda" className="grid gap-0.5">
          {monedas.map((m) => (
            <a
              key={m.codigo}
              href={hrefMoneda(ruta, params, m.codigo)}
              aria-current={m.codigo === actual.codigo ? 'true' : undefined}
              className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.05] aria-[current=true]:bg-marca-suave"
            >
              <Bandera moneda={m.codigo} grande decorativa />
              <span className="w-11 rounded-md border border-borde-fuerte py-0.5 text-center text-[0.7rem] font-bold">
                {m.codigo}
              </span>
              <span className="grid min-w-0 flex-1">
                <b className="text-sm">{m.nombre}</b>
                {m.detalle && <span className="text-xs text-tinta-tenue">{m.detalle}</span>}
              </span>
              {m.codigo === actual.codigo && (
                <Check className="size-4 text-cian" aria-hidden="true" />
              )}
            </a>
          ))}
        </nav>
        <p className="px-2 pt-1.5 text-xs text-tinta-tenue">
          Tasas del día fijadas por el equipo de NV. El monto exacto queda en tu factura.
        </p>
      </div>
    </div>
  );
}

/** Versión en chips del selector de moneda (menú lateral del teléfono). */
export function ChipsMonedas({ monedas, actual }: { monedas: OpcionMoneda[]; actual: string }) {
  const ruta = usePathname();
  const params = useSearchParams();
  if (monedas.length <= 1) return null;
  return (
    <nav aria-label="Moneda" className="flex flex-wrap gap-2">
      {monedas.map((m) => (
        <a
          key={m.codigo}
          href={hrefMoneda(ruta, params, m.codigo)}
          aria-current={m.codigo === actual ? 'true' : undefined}
          className="chip"
        >
          <Bandera moneda={m.codigo} decorativa />
          {m.codigo}
        </a>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------- carrito */

/** Botón del carrito: abre el carrito lateral y muestra cuántos planes tiene. */
export function IconoCarrito() {
  const { planes } = useCarrito();
  const n = planes.length;
  return (
    <button
      type="button"
      onClick={abrirCarrito}
      aria-haspopup="dialog"
      aria-label={`Carrito, ${n} ${n === 1 ? 'plan' : 'planes'}`}
      className="relative grid size-11 place-items-center rounded-[0.9rem] border border-borde bg-white/[0.02] transition-colors hover:border-borde-fuerte"
    >
      <ShoppingCart className="size-[1.15rem]" aria-hidden="true" />
      {n > 0 && (
        <em className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[linear-gradient(135deg,#8b5cf6,#e879f9)] px-1 text-[0.7rem] font-bold not-italic text-white tabular-nums">
          {n}
        </em>
      )}
    </button>
  );
}

/* --------------------------------------------------------------- megamenú */

/** Franja de universos con megamenú: universo, lista de servicios y el más pedido. */
export function FranjaCategorias({ categorias }: { categorias: CategoriaMenu[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const espera = useRef<number | undefined>(undefined);
  const [abierta, setAbierta] = useState<string | null>(null);
  const id = useId();
  useCerrarFuera(abierta !== null, () => setAbierta(null), caja);
  const actual = categorias.find((c) => c.id === abierta) ?? null;

  function programar(valor: string | null, ms: number) {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setAbierta(valor), ms);
  }

  return (
    <div
      ref={caja}
      className="relative"
      onMouseLeave={() => programar(null, 180)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setAbierta(null);
      }}
    >
      <nav aria-label="Universos" className="flex items-center gap-0.5">
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-expanded={abierta === c.id}
            aria-controls={`${id}-panel`}
            onClick={() => setAbierta((a) => (a === c.id ? null : c.id))}
            onMouseEnter={() => programar(c.id, abierta ? 0 : 120)}
            className={clsx(
              'flex h-12 items-center gap-2 rounded-xl px-3 text-[0.9rem] font-medium whitespace-nowrap transition-colors',
              abierta === c.id ? 'text-tinta' : 'text-tinta-suave hover:text-tinta',
            )}
          >
            <span
              className="grid size-6 place-items-center rounded-md border"
              style={
                {
                  borderColor: `color-mix(in srgb, ${c.color} 45%, transparent)`,
                  background: `color-mix(in srgb, ${c.color} 16%, transparent)`,
                } as CSSProperties
              }
            >
              <IconoCategoria categoria={c.id} className="size-3.5 text-white" />
            </span>
            {c.nombre}
            <ChevronDown
              className={clsx(
                'size-3.5 text-tinta-tenue transition-transform',
                abierta === c.id && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
        ))}
        <Link
          href="/catalogo"
          className="ml-auto flex h-12 items-center gap-1.5 px-3 text-[0.9rem] font-medium text-cian hover:underline"
        >
          Todo el catálogo <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </nav>
      <div
        id={`${id}-panel`}
        hidden={!actual}
        onMouseEnter={() => window.clearTimeout(espera.current)}
        className="flotante aparecer absolute inset-x-0 top-full z-40 mt-1 rounded-3xl p-3"
      >
        {actual && (
          <div className="grid grid-cols-[17rem_1fr] gap-3 xl:grid-cols-[17rem_1fr_15rem]">
            <div
              className="grid content-start justify-items-start gap-3.5 rounded-2xl border border-borde p-6"
              style={
                {
                  background: `radial-gradient(90% 70% at 0% 0%, color-mix(in srgb, ${actual.color} 22%, transparent), transparent 70%)`,
                } as CSSProperties
              }
            >
              <Orbe categoria={actual.id} color={actual.color} tamano="xl" />
              <span className="etiqueta-orbita">Universo {actual.nombre.toLowerCase()}</span>
              <h3 className="text-2xl">{actual.nombre}</h3>
              <p className="text-sm text-tinta-suave">{actual.descripcion}</p>
              <dl className="grid w-full grid-cols-[5rem_1fr] gap-2">
                <div className="rounded-xl border border-borde p-2.5">
                  <dt className="text-xs text-tinta-tenue">
                    {actual.cuenta === 1 ? 'servicio' : 'servicios'}
                  </dt>
                  <dd className="font-titulo text-lg font-extrabold">{actual.cuenta}</dd>
                </div>
                {actual.desde && (
                  <div className="rounded-xl border border-borde p-2.5">
                    <dt className="text-xs text-tinta-tenue">precio desde</dt>
                    <dd className="truncate font-titulo text-lg font-extrabold">{actual.desde}</dd>
                  </div>
                )}
              </dl>
              <Link
                href={`/catalogo?categoria=${actual.id}`}
                className={clasesBoton('primario', 'md')}
                onClick={() => setAbierta(null)}
              >
                Ver todo {actual.nombre}
              </Link>
            </div>
            <ul className="grid content-start gap-1 sm:grid-cols-2">
              {actual.servicios.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/catalogo/${s.slug}`}
                    onClick={() => setAbierta(null)}
                    className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.05]"
                  >
                    <MiniArte servicio={s} />
                    <span className="grid min-w-0 flex-1">
                      <b className="truncate text-sm">{s.nombre}</b>
                      {s.desde && (
                        <span className="truncate text-xs text-tinta-tenue">Desde {s.desde}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {actual.destacado && (
              <Link
                href={`/catalogo/${actual.destacado.slug}`}
                onClick={() => setAbierta(null)}
                className="tarjeta-brillo hidden content-start justify-items-center gap-2 p-5 text-center xl:grid"
                style={{ '--c': actual.destacado.color } as CSSProperties}
              >
                <span className="text-[0.7rem] font-bold tracking-[0.16em] text-tinta-tenue uppercase">
                  El más pedido
                </span>
                <ArteServicio
                  arte={actual.destacado.arte}
                  nombre={actual.destacado.nombre}
                  categoria={actual.destacado.categoria}
                  color={actual.destacado.color}
                  className="h-36 w-auto"
                />
                <b className="text-sm">{actual.destacado.nombre}</b>
                {actual.destacado.desde && (
                  <span className="text-sm text-tinta-suave">Desde {actual.destacado.desde}</span>
                )}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- menú lateral */

/** Menú lateral del teléfono: universos, moneda y acceso a la cuenta. */
export function CajonMovil({
  categorias,
  monedas,
  moneda,
  sesion,
  logo,
}: {
  categorias: CategoriaMenu[];
  monedas: OpcionMoneda[];
  moneda: string;
  sesion: SesionMenu | null;
  logo: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ruta = usePathname();
  useEffect(() => {
    dialogo.current?.close();
  }, [ruta]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="grid size-11 place-items-center rounded-[0.9rem] border border-borde bg-white/[0.02]"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <dialog
        ref={dialogo}
        aria-label="Menú"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none bg-transparent p-0 text-tinta backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-[nv-entrar_.25s_ease]"
      >
        <div className="flex h-full flex-col gap-5 overflow-y-auto border-l border-borde bg-[linear-gradient(180deg,#0b1030,#060818)] p-5">
          <div className="flex items-center justify-between">
            {logo}
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="grid size-10 place-items-center rounded-xl border border-borde"
              aria-label="Cerrar menú"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Universos" className="grid gap-1.5">
            <Link
              href="/catalogo"
              className="flex items-center gap-3 rounded-2xl border border-borde p-3 hover:border-borde-fuerte"
            >
              <Orbe categoria={null} color="#5b98ff" tamano="sm" />
              <span className="grid flex-1">
                <b className="text-sm">Todo el catálogo</b>
                <span className="text-xs text-tinta-tenue">Filtra por precio y duración</span>
              </span>
              <ArrowRight className="size-4 text-tinta-tenue" aria-hidden="true" />
            </Link>
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={`/catalogo?categoria=${c.id}`}
                className="flex items-center gap-3 rounded-2xl border border-borde p-3 hover:border-borde-fuerte"
              >
                <Orbe categoria={c.id} color={c.color} tamano="sm" />
                <span className="grid min-w-0 flex-1">
                  <b className="text-sm">{c.nombre}</b>
                  <span className="truncate text-xs text-tinta-tenue">
                    {c.cuenta} {c.cuenta === 1 ? 'servicio' : 'servicios'}
                    {c.desde && ` · desde ${c.desde}`}
                  </span>
                </span>
                <ArrowRight className="size-4 text-tinta-tenue" aria-hidden="true" />
              </Link>
            ))}
            <Link
              href="/#como-comprar"
              className="flex items-center gap-3 rounded-2xl border border-borde p-3 hover:border-borde-fuerte"
            >
              <span
                className="orbe orbe-sm"
                style={{ '--c': '#22d3ee' } as CSSProperties}
                aria-hidden="true"
              >
                <Zap />
              </span>
              <span className="grid flex-1">
                <b className="text-sm">Cómo comprar</b>
                <span className="text-xs text-tinta-tenue">En 3 pasos</span>
              </span>
              <ArrowRight className="size-4 text-tinta-tenue" aria-hidden="true" />
            </Link>
          </nav>
          <div className="mt-auto grid gap-4 border-t border-borde pt-5">
            {monedas.length > 1 && (
              <div className="grid gap-2">
                <span className="text-[0.7rem] font-bold tracking-[0.16em] text-tinta-tenue uppercase">
                  Moneda
                </span>
                <ChipsMonedas monedas={monedas} actual={moneda} />
              </div>
            )}
            {sesion ? (
              <Link href={sesion.panel} className={clasesBoton('primario', 'lg')}>
                Ir a mi panel
              </Link>
            ) : (
              <>
                <Link href="/ingresar" className={clasesBoton('primario', 'lg')}>
                  Ingresar
                </Link>
                <Link href="/registro" className={clasesBoton('secundario', 'lg')}>
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

/* ---------------------------------------------------------- barra inferior */

/** Barra de pestañas del teléfono: inicio, catálogo, carrito, billetera y cuenta. */
export function BarraInferior({ billetera, cuenta }: { billetera: string; cuenta: string }) {
  const ruta = usePathname();
  const { planes } = useCarrito();
  const n = planes.length;
  const clase = (activa: boolean) =>
    clsx(
      'relative grid justify-items-center gap-0.5 rounded-xl py-1 text-[0.7rem] font-medium',
      activa ? 'text-cian' : 'text-tinta-suave',
    );
  const enlace = (href: string, texto: string, Icono: typeof House, activa: boolean) => (
    <Link href={href} aria-current={activa ? 'page' : undefined} className={clase(activa)}>
      <Icono className="size-5" aria-hidden="true" />
      {texto}
    </Link>
  );
  return (
    <nav
      aria-label="Accesos rápidos"
      className="barra-inferior vidrio fixed inset-x-2.5 bottom-[calc(0.6rem+env(safe-area-inset-bottom,0px))] z-40 grid grid-cols-5 rounded-[1.4rem] px-1 py-1.5 shadow-nv nav:hidden"
    >
      {enlace('/', 'Inicio', House, ruta === '/')}
      {enlace('/catalogo', 'Catálogo', LayoutGrid, ruta.startsWith('/catalogo'))}
      <button type="button" onClick={abrirCarrito} aria-haspopup="dialog" className={clase(false)}>
        <ShoppingCart className="size-5" aria-hidden="true" />
        Carrito
        {n > 0 && (
          <em className="absolute top-0 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-[linear-gradient(135deg,#8b5cf6,#e879f9)] px-1 text-[0.62rem] font-bold not-italic text-white tabular-nums">
            {n}
            <span className="sr-only">{n === 1 ? 'plan' : 'planes'}</span>
          </em>
        )}
      </button>
      {enlace(billetera, 'Billetera', Wallet, false)}
      {enlace(cuenta, 'Cuenta', User, false)}
    </nav>
  );
}

/* ------------------------------------------------------------- aviso tasa */

/** Botón para cerrar la barra de la tasa del día (se recuerda por hoy). */
export function CerrarAviso({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="relative border-b border-borde bg-[linear-gradient(90deg,rgb(34_211_238/0.08),rgb(139_92_246/0.1),rgb(232_121_249/0.08))]">
      <div className="contenedor flex min-h-9 items-center justify-center gap-2 py-1.5 pr-10 text-[0.8rem] text-tinta-suave">
        {children}
      </div>
      <button
        type="button"
        onClick={() => {
          document.cookie = `${COOKIE_AVISO_TASA}=1; path=/; max-age=43200; samesite=lax`;
          setVisible(false);
        }}
        className="absolute inset-y-0 right-2 my-auto grid size-8 place-items-center rounded-lg text-tinta-tenue hover:text-tinta"
        aria-label="Cerrar aviso"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
