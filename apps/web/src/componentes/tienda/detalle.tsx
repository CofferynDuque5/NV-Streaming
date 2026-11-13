'use client';

import {
  type DatoRequerido,
  datosDelPlan,
  esCompraUnica,
  etiquetaPlan,
  formatearMonto,
  GRUPO_TIPO_PLAN,
  NOMBRE_TIPO_PLAN,
  type Moneda,
  type PlanPublico,
  preciosVigentes,
  revisarDatos,
  TIPOS_PLAN,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Check,
  CircleCheck,
  Flame,
  Lock,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { RUTA_CARRITO, useCarrito } from '@/lib/carrito';
import { useAgregarAlCarrito } from './boton-carrito';
import { CampoDato, recordarDatos } from './datos-compra';
import { CuentaRegresiva } from './cuenta-regresiva';
import { type MayoristaTienda, precioDeTarjeta } from './precio-tarjeta';

export interface SaldoDetalle {
  /** Saldo en USD de la billetera (cliente) o de la cuenta (revendedor). */
  usd: string;
  enlace: string;
}

/**
 * Comparte el enlace del servicio (con el plan elegido): en el teléfono abre el
 * menú de compartir del sistema; en la computadora lo copia y lo confirma.
 */
export function CompartirEnlace({ nombre }: { nombre: string }) {
  const notificar = useNotificar();
  const [copiado, setCopiado] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);

  async function compartir() {
    const url = window.location.href;
    const tactil = window.matchMedia('(pointer: coarse)').matches;
    if (tactil && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: nombre, text: `${nombre} en NV Streaming`, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      clearTimeout(espera.current);
      espera.current = setTimeout(() => setCopiado(false), 2500);
      notificar('Enlace copiado. Pégalo donde quieras compartirlo.', 'exito');
    } catch {
      notificar('No pudimos copiar el enlace. Cópialo desde la barra del navegador.', 'error');
    }
  }

  return (
    <button
      type="button"
      onClick={() => void compartir()}
      className={clsx(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
        copiado
          ? 'border-exito/50 bg-exito-suave text-exito'
          : 'border-borde-fuerte bg-white/[0.03] hover:border-cian hover:text-cian',
      )}
    >
      {copiado ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Share2 className="size-4" aria-hidden="true" />
      )}
      <span aria-live="polite">{copiado ? 'Copiado' : 'Compartir'}</span>
    </button>
  );
}

/** Grupo de un plan en las pestañas de la ficha. */
function grupoDe(p: PlanPublico): string {
  if (esCompraUnica(p.tipo)) return GRUPO_TIPO_PLAN[p.tipo];
  return p.entrega === 'activacion' ? 'Activar en tu correo' : 'Alquiler de cuenta';
}

function ordenGrupo(p: PlanPublico): number {
  return TIPOS_PLAN.indexOf(p.tipo) * 2 + (p.entrega === 'activacion' ? 1 : 0);
}

/** Lo que el cliente escribió antes para este servicio (sin hidratar distinto). */
function useDatosRecordados(servicioId: string): string {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener('storage', avisar);
      return () => window.removeEventListener('storage', avisar);
    },
    () => {
      try {
        return localStorage.getItem(`nv:datos-jugador:${servicioId}`) ?? '{}';
      } catch {
        return '{}';
      }
    },
    () => '{}',
  );
}

function leerJson(texto: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(texto);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full bg-[image:var(--nv-degradado)] font-titulo text-sm font-extrabold text-white"
        aria-hidden="true"
      >
        {n}
      </span>
      <h2 className="font-titulo text-lg font-bold">
        <span className="sr-only">Paso {n}: </span>
        {titulo}
      </h2>
      {children}
    </div>
  );
}

/** Precio que se paga por el plan en USD (el del revendedor si lo tiene). */
function precioUsd(plan: PlanPublico, mayorista: MayoristaTienda | null): number {
  if (mayorista?.vista.estado === 'ok') {
    const suyo = mayorista.vista.catalogo.planes.find((p) => p.id === plan.id);
    if (suyo) return Number(suyo.precioUsd);
  }
  return Number(preciosVigentes(plan).USD?.precio ?? plan.precioUsd);
}

function Pestanas({
  pestanas,
}: {
  pestanas: { id: string; titulo: string; contenido: ReactNode }[];
}) {
  const [activa, setActiva] = useState(pestanas[0]?.id);
  const base = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  function teclado(e: KeyboardEvent, i: number) {
    const n = pestanas.length;
    const destino =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (destino === null) return;
    e.preventDefault();
    setActiva(pestanas[destino]?.id);
    botones.current[destino]?.focus();
  }
  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label="Detalles del servicio"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-borde px-4 [scrollbar-width:none]"
      >
        {pestanas.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-t-${p.id}`}
            aria-selected={activa === p.id}
            aria-controls={`${base}-p-${p.id}`}
            tabIndex={activa === p.id ? 0 : -1}
            onClick={() => setActiva(p.id)}
            onKeyDown={(e) => teclado(e, i)}
            className="relative h-12 shrink-0 px-3.5 font-titulo text-[0.95rem] font-bold whitespace-nowrap text-tinta-tenue hover:text-tinta aria-selected:text-tinta aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:-bottom-px aria-selected:after:h-0.5 aria-selected:after:rounded-full aria-selected:after:bg-[image:var(--nv-degradado)]"
          >
            {p.titulo}
          </button>
        ))}
      </div>
      {pestanas.map((p) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${base}-p-${p.id}`}
          aria-labelledby={`${base}-t-${p.id}`}
          hidden={activa !== p.id}
          tabIndex={0}
        >
          {p.contenido}
        </div>
      ))}
    </div>
  );
}

/**
 * Ficha de compra del servicio en tres pasos: 1) elige el plan o paquete
 * (agrupados en pestañas: Monedas, Suministros, Paquetes, Pases…), 2) escribe
 * los datos que pide el servicio (ID de jugador, zona…) y 3) agrégalo o
 * cómpralo. Los precios son los que calculó la API.
 */
export function DetalleServicio({
  servicioId,
  nombre,
  planes,
  datos,
  inicial,
  moneda,
  mayorista,
  saldo,
  arte,
  cabecera,
  confianza,
  pagos,
  comoSeActiva,
  preguntas,
}: {
  servicioId: string;
  nombre: string;
  planes: PlanPublico[];
  /** Lo que el servicio pide al comprar (ID de jugador, zona…). */
  datos: DatoRequerido[];
  inicial: string;
  moneda: Moneda;
  mayorista: MayoristaTienda | null;
  saldo: SaldoDetalle | null;
  /** Imagen del servicio en su escenario. */
  arte: ReactNode;
  /** Título, descripción y enlace para compartir. */
  cabecera: ReactNode;
  confianza: ReactNode;
  pagos: ReactNode;
  comoSeActiva: ReactNode;
  preguntas: ReactNode;
}) {
  const [planId, setPlanId] = useState(inicial);
  const plan = planes.find((p) => p.id === planId) ?? planes[0];
  const grupos = [
    ...new Set([...planes].sort((x, y) => ordenGrupo(x) - ordenGrupo(y)).map(grupoDe)),
  ];
  const [grupoElegido, setGrupo] = useState<string | null>(null);
  const grupo = grupoElegido ?? (plan ? grupoDe(plan) : grupos[0]);
  const visibles = grupos.length > 1 ? planes.filter((p) => grupoDe(p) === grupo) : planes;
  const acciones = useRef<HTMLDivElement>(null);
  const formDatos = useRef<HTMLFieldSetElement>(null);
  const [barra, setBarra] = useState(false);
  const idGrupo = useId();
  const idCampos = useId();
  const primera = useRef(true);
  const router = useRouter();
  const carrito = useCarrito();
  const agregarAlCarrito = useAgregarAlCarrito();
  const recordados = leerJson(useDatosRecordados(servicioId));
  const [escritos, setEscritos] = useState<Record<string, string>>({});
  const [mostrarErrores, setMostrarErrores] = useState(false);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const u = new URL(window.location.href);
    u.searchParams.set('plan', planId);
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}`);
  }, [planId]);

  // Barra de compra fija en el teléfono cuando los botones quedan fuera de la vista.
  useEffect(() => {
    const el = acciones.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) =>
      setBarra(Boolean(e && !e.isIntersecting && e.boundingClientRect.top < 0)),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (!plan) return null;
  const precio = precioDeTarjeta(plan, moneda, mayorista);
  const esRevendedor = Boolean(mayorista);
  const nombrePlan = `${nombre} (${plan.nombre})`;
  const unica = esCompraUnica(plan.tipo);
  const juego = planes.some((p) => esCompraUnica(p.tipo));
  const activacion = !unica && plan.entrega === 'activacion';
  const repetidas = new Set<string>();
  const duraciones = new Map<string, number>();
  for (const p of visibles) {
    const d = etiquetaPlan(p);
    duraciones.set(d, (duraciones.get(d) ?? 0) + 1);
  }
  for (const [d, n] of duraciones) if (n > 1) repetidas.add(d);
  const alcanza = saldo ? Number(saldo.usd) >= precioUsd(plan, mayorista) : false;

  // Datos del paso 2. La contraseña (activación en su correo) se pide al pagar, no aquí.
  const todosLosDatos = datosDelPlan(datos, plan);
  const pedidos = todosLosDatos.filter((d) => d.tipo !== 'clave');
  const pideClave = todosLosDatos.length > pedidos.length;
  const valores: Record<string, string> = Object.fromEntries(
    pedidos.map((d) => [d.clave, escritos[d.clave] ?? recordados[d.clave] ?? '']),
  );
  const { errores } = revisarDatos(pedidos, valores);
  const datosListos = Object.keys(errores).length === 0;
  const resumenDatos = pedidos
    .filter((d) => valores[d.clave])
    .map((d) => `${d.etiqueta}: ${valores[d.clave]}`)
    .join(' · ');
  const dentro = carrito.tiene(plan.id);
  const hayPasoDatos = !esRevendedor && (pedidos.length > 0 || pideClave);

  function cambiarDato(clave: string, valor: string) {
    const siguiente = { ...valores, [clave]: valor };
    setEscritos((e) => ({ ...e, [clave]: valor }));
    recordarDatos(servicioId, pedidos, siguiente);
  }

  /** Revisa los datos antes de agregar; si falta algo, lleva al primer campo. */
  function revisar(): boolean {
    if (datosListos) return true;
    setMostrarErrores(true);
    formDatos.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(
      () => formDatos.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      250,
    );
    return false;
  }

  function agregar() {
    if (!revisar()) return;
    agregarAlCarrito(plan!.id, nombrePlan);
  }

  function comprarAhora() {
    if (!revisar()) return;
    if (!carrito.tiene(plan!.id) && !agregarAlCarrito(plan!.id, nombrePlan)) return;
    router.push(RUTA_CARRITO);
  }

  const botonAgregar = (tamano: 'md' | 'lg', clase?: string) => (
    <button
      type="button"
      onClick={agregar}
      className={clasesBoton(
        dentro ? 'secundario' : 'primario',
        tamano,
        clsx(dentro && 'border-exito/50 bg-exito-suave', clase),
      )}
    >
      {dentro ? (
        <Check className="size-4 text-exito" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-4" aria-hidden="true" />
      )}
      {dentro ? 'En el carrito' : 'Agregar al carrito'}
    </button>
  );

  const botonPrincipal = esRevendedor ? (
    precio.compraMayorista ? (
      <Link
        href={`/revendedor/catalogo?plan=${plan.id}`}
        className={clasesBoton('primario', 'lg', 'flex-1')}
      >
        <Store className="size-4" aria-hidden="true" />
        Comprar con saldo
      </Link>
    ) : null
  ) : precio.principal ? (
    botonAgregar('lg', 'flex-1')
  ) : null;

  const incluye = (
    <div className="grid gap-4 @4xl:grid-cols-[1.3fr_1fr]">
      <div
        className="tarjeta-brillo grid content-start gap-3 p-5"
        style={{ '--c': '#5b98ff' } as CSSProperties}
      >
        <h3 className="font-titulo text-lg font-bold">Tu compra incluye</h3>
        {plan.descripcion && <p className="text-sm text-tinta-suave">{plan.descripcion}</p>}
        <ul className="grid gap-2 text-sm">
          <li className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
            {unica
              ? `${nombre}: ${plan.nombre} (${NOMBRE_TIPO_PLAN[plan.tipo].toLowerCase()}, pago único)`
              : `${nombre}, plan ${plan.nombre}, por ${etiquetaPlan(plan)}`}
          </li>
          {plan.beneficios.map((b) => (
            <li key={b} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
              {b}
            </li>
          ))}
          {plan.renovable && (
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
              Lo renuevas desde tu panel cuando se acerque el vencimiento
            </li>
          )}
        </ul>
      </div>
      <div
        className="tarjeta-brillo grid content-start gap-3 p-5"
        style={{ '--c': '#22c55e' } as CSSProperties}
      >
        <h3 className="font-titulo text-lg font-bold">Servicio autorizado</h3>
        <p className="flex gap-2.5 rounded-xl border border-exito/30 bg-exito-suave p-3.5 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
          {unica
            ? 'Solo vendemos servicios autorizados para reventa. La recarga llega a la cuenta del ID que escribas: revísalo bien antes de pagar.'
            : activacion
              ? 'Solo vendemos servicios autorizados para reventa. Lo activamos en tu propia cuenta: tu contraseña se guarda cifrada y solo la ve quien hace la activación. Puedes cambiarla después.'
              : 'Solo vendemos servicios autorizados para reventa. Ves los datos de tu cuenta o perfil en «Mis accesos»; nunca te pediremos la contraseña de tu propia cuenta.'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="grid gap-x-10 gap-y-7 @5xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
      <div className="@5xl:sticky @5xl:top-40 @5xl:self-start">{arte}</div>
      <div className="grid min-w-0 content-start gap-6">
        {cabecera}

        {planes.length > 0 && (
          <section className="grid gap-3" aria-labelledby={`${idGrupo}-p1`}>
            <div id={`${idGrupo}-p1`}>
              <Paso n={1} titulo={juego ? 'Elige tu paquete' : 'Elige tu plan'} />
            </div>
            {grupos.length > 1 && (
              <div
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
                role="group"
                aria-label="Tipo de producto"
              >
                {grupos.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={g === grupo}
                    onClick={() => {
                      setGrupo(g);
                      const primero = planes.find((p) => grupoDe(p) === g);
                      if (primero && grupoDe(plan) !== g) setPlanId(primero.id);
                    }}
                    className={clsx(
                      'min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                      g === grupo
                        ? 'border-cian bg-marca-suave text-tinta'
                        : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
                    )}
                  >
                    {g}
                    <span className="ml-1.5 text-xs font-normal text-tinta-tenue">
                      {planes.filter((p) => grupoDe(p) === g).length}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <fieldset>
              <legend className="sr-only">
                {grupos.length > 1 ? grupo : juego ? 'Paquetes' : 'Planes'}
              </legend>
              <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3">
                {visibles.map((p) => {
                  const pr = precioDeTarjeta(p, moneda, mayorista);
                  const compraUnica = esCompraUnica(p.tipo);
                  const d = etiquetaPlan(p);
                  const elegido = p.id === plan.id;
                  return (
                    <label
                      key={p.id}
                      className={clsx(
                        'relative grid cursor-pointer content-start gap-1 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cian',
                        elegido
                          ? 'border-cian bg-marca-suave shadow-[0_0_24px_-10px_var(--nv-cian)]'
                          : 'border-borde bg-white/[0.02] hover:border-borde-fuerte',
                      )}
                    >
                      <input
                        type="radio"
                        name={idGrupo}
                        value={p.id}
                        checked={elegido}
                        onChange={() => setPlanId(p.id)}
                        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-2xl opacity-0"
                      />
                      {elegido && (
                        <CircleCheck
                          className="absolute top-3 right-3 size-4 text-cian"
                          aria-hidden="true"
                        />
                      )}
                      <span className="pr-6 font-titulo text-[0.95rem] leading-tight font-bold">
                        {d}
                      </span>
                      {!compraUnica && repetidas.has(d) && (
                        <span className="text-xs text-tinta-suave">{p.nombre}</span>
                      )}
                      {compraUnica && p.descripcion && (
                        <span className="line-clamp-2 text-xs text-tinta-suave">
                          {p.descripcion}
                        </span>
                      )}
                      <span className="mt-1 font-semibold tabular-nums">
                        {pr.principal ?? 'Sin precio'}
                      </span>
                      {pr.antes && (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                          <s className="text-tinta-tenue">
                            <span className="sr-only">Antes </span>
                            {pr.antes}
                          </s>
                          <span className="font-bold text-[#fb923c]">−{pr.oferta} %</span>
                        </span>
                      )}
                      {!pr.antes && pr.referencia && (
                        <span className="text-xs text-tinta-tenue tabular-nums">
                          {pr.referencia}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>
        )}

        {hayPasoDatos && (
          <section className="grid gap-3" aria-labelledby={`${idGrupo}-p2`}>
            <div id={`${idGrupo}-p2`}>
              <Paso n={2} titulo={juego ? 'Datos del jugador' : 'Datos de tu cuenta'} />
            </div>
            <fieldset
              ref={formDatos}
              className="grid gap-3 rounded-2xl border border-borde bg-white/[0.02] p-4"
            >
              <legend className="sr-only">
                {juego ? 'Datos del jugador' : 'Datos de tu cuenta'}
              </legend>
              {pedidos.length > 0 && (
                <div className="grid gap-3 @xl:grid-cols-2">
                  {pedidos.map((d) => (
                    <CampoDato
                      key={d.clave}
                      dato={d}
                      campo={`${idCampos}-${d.clave}`}
                      valor={valores[d.clave] ?? ''}
                      error={mostrarErrores ? errores[d.clave] : undefined}
                      alCambiar={(v) => cambiarDato(d.clave, v)}
                    />
                  ))}
                </div>
              )}
              {pedidos.length > 0 && datosListos && (
                <p className="flex items-center gap-2 text-sm text-exito" role="status">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  {juego
                    ? 'Datos completos. Revisa que el ID sea el de tu cuenta: no lo podemos comprobar con el juego.'
                    : 'Datos completos.'}
                </p>
              )}
              {pideClave && (
                <p className="flex gap-2 text-sm text-tinta-suave">
                  <Lock className="mt-0.5 size-4 shrink-0 text-cian" aria-hidden="true" />
                  Al pagar te pediremos la contraseña de tu cuenta para activarlo. Se guarda cifrada
                  y solo la ve quien hace la activación.
                </p>
              )}
            </fieldset>
          </section>
        )}

        <section className="grid gap-3" aria-labelledby={`${idGrupo}-p3`}>
          <div id={`${idGrupo}-p3`}>
            <Paso n={hayPasoDatos ? 3 : 2} titulo="Paga" />
          </div>
          <div className="grid gap-3 rounded-[1.3rem] border border-borde bg-[linear-gradient(180deg,rgb(255_255_255/0.03),transparent)] px-5 py-4">
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-suave">Producto</dt>
                <dd className="text-right font-medium">
                  {unica ? plan.nombre : `${plan.nombre} · ${etiquetaPlan(plan)}`}
                </dd>
              </div>
              {resumenDatos && (
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta-suave">Para</dt>
                  <dd className="min-w-0 text-right font-medium break-words">{resumenDatos}</dd>
                </div>
              )}
            </dl>
            {precio.principal ? (
              <p
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-borde pt-3 tabular-nums"
                aria-live="polite"
              >
                <span className="text-sm text-tinta-suave">Total</span>
                {precio.etiqueta && (
                  <span className="inline-flex items-center gap-1 self-center rounded-full bg-acento-suave px-2.5 py-0.5 text-xs font-bold text-acento">
                    <Store className="size-3.5" aria-hidden="true" />
                    {precio.etiqueta}
                  </span>
                )}
                <strong className="font-titulo text-[clamp(2rem,5vw,2.6rem)] leading-none font-extrabold">
                  {precio.principal}
                </strong>
                {precio.antes && (
                  <s className="text-base text-tinta-tenue">
                    <span className="sr-only">Antes </span>
                    {precio.antes}
                  </s>
                )}
                {precio.referencia && (
                  <span className="text-sm text-tinta-tenue">{precio.referencia}</span>
                )}
              </p>
            ) : null}
            {precio.principal && precio.oferta && precio.ofertaHasta ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#f97316] to-[#e11d48] px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-white">
                  <Flame className="size-3.5" aria-hidden="true" />
                  HOT −{precio.oferta} %
                </span>
                <CuentaRegresiva
                  hasta={precio.ofertaHasta}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#fdba74]"
                />
              </p>
            ) : null}
            {precio.principal ? null : (
              <p className="text-sm text-tinta-suave">
                Este plan no tiene precio en {moneda}. Elige otra moneda arriba.
              </p>
            )}
            <p className="text-xs text-tinta-tenue">
              {esRevendedor
                ? precio.compraMayorista
                  ? 'Precio mayorista de tu nivel. Se cobra de tu saldo en USD.'
                  : 'Este plan no está disponible para reventa.'
                : moneda === 'USD'
                  ? 'Un solo pago. El importe queda fijado en tu factura.'
                  : 'Un solo pago con la tasa de hoy. El importe exacto queda fijado en tu factura.'}
            </p>
            <div ref={acciones} className="grid gap-3">
              <div className="flex flex-wrap gap-2.5">
                {botonPrincipal}
                {!esRevendedor && precio.principal && (
                  <button
                    type="button"
                    onClick={comprarAhora}
                    className={clasesBoton('secundario', 'lg', 'flex-1')}
                  >
                    Comprar ahora
                  </button>
                )}
              </div>
              {hayPasoDatos && !datosListos && !mostrarErrores && (
                <p className="text-xs text-tinta-tenue">
                  Completa el paso 2 para agregarlo al carrito.
                </p>
              )}
              {saldo && precio.principal && (!esRevendedor || precio.compraMayorista) && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Wallet className="size-4 text-violeta" aria-hidden="true" />
                  <span className="text-tinta-suave">
                    Tu saldo:{' '}
                    <b className="text-tinta tabular-nums">{formatearMonto(saldo.usd, 'USD')}</b>
                  </span>
                  {alcanza ? (
                    <span className="text-exito">· te alcanza para este plan</span>
                  ) : (
                    <span className="text-tinta-suave">
                      · no te alcanza para este plan.{' '}
                      <Link href={saldo.enlace} className="font-medium text-cian hover:underline">
                        Recargar saldo
                      </Link>
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
        {confianza}
        {pagos}
      </div>

      <div className="mt-8 grid min-w-0 gap-5 @5xl:col-span-2">
        <Pestanas
          pestanas={[
            { id: 'incluye', titulo: 'Qué incluye', contenido: incluye },
            { id: 'activa', titulo: 'Cómo se activa', contenido: comoSeActiva },
            { id: 'preguntas', titulo: 'Preguntas', contenido: preguntas },
          ]}
        />
      </div>

      {botonPrincipal && precio.principal && (
        <div
          className={clsx(
            'flotante fixed inset-x-3 bottom-[calc(var(--nv-barra-inferior,0px)+0.75rem+env(safe-area-inset-bottom,0px))] z-30 flex items-center gap-3 rounded-2xl p-2.5 pl-4 transition-[opacity,translate] nav:hidden',
            barra ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
          )}
          aria-hidden={!barra}
          inert={!barra}
        >
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-xs text-tinta-suave">
              {nombre} · {unica ? plan.nombre : etiquetaPlan(plan)}
            </span>
            <b className="font-titulo tabular-nums">{precio.principal}</b>
          </div>
          {esRevendedor ? (
            <Link
              href={`/revendedor/catalogo?plan=${plan.id}`}
              className={clasesBoton('primario', 'md')}
            >
              Comprar con saldo
            </Link>
          ) : (
            botonAgregar('md')
          )}
        </div>
      )}
    </div>
  );
}
