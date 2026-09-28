'use client';

import { etiquetaDuracion, formatearMonto, type Moneda, type PlanPublico } from '@nv/shared';
import clsx from 'clsx';
import { Check, Link2, ShieldCheck, Store, Wallet } from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { BotonCarrito } from './boton-carrito';
import { type MayoristaTienda, precioDeTarjeta } from './precio-tarjeta';

export interface SaldoDetalle {
  /** Saldo en USD de la billetera (cliente) o de la cuenta (revendedor). */
  usd: string;
  enlace: string;
}

/** Copia el enlace de la página y lo confirma con un aviso. */
export function CopiarEnlace() {
  const notificar = useNotificar();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          notificar('Copiamos el enlace de este servicio.', 'exito');
        } catch {
          notificar('No pudimos copiar el enlace. Cópialo desde la barra del navegador.', 'error');
        }
      }}
      className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] border border-borde-fuerte bg-white/[0.03] hover:border-cian"
      aria-label="Copiar enlace del servicio"
      title="Copiar enlace"
    >
      <Link2 className="size-4" aria-hidden="true" />
    </button>
  );
}

/** Precio que se paga por el plan en USD (el del revendedor si lo tiene). */
function precioUsd(plan: PlanPublico, mayorista: MayoristaTienda | null): number {
  if (mayorista?.vista.estado === 'ok') {
    const suyo = mayorista.vista.catalogo.planes.find((p) => p.id === plan.id);
    if (suyo) return Number(suyo.precioUsd);
  }
  return Number(plan.precioUsd);
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
 * Ficha de compra del servicio: elige uno de sus planes reales (sin multiplicar
 * precios), lo agrega al carrito o lo compra; y las pestañas con lo que
 * incluye el plan elegido. Los precios son los que calculó la API.
 */
export function DetalleServicio({
  nombre,
  planes,
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
  nombre: string;
  planes: PlanPublico[];
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
  const acciones = useRef<HTMLDivElement>(null);
  const [barra, setBarra] = useState(false);
  const idGrupo = useId();
  const primera = useRef(true);

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
  const repetidas = new Set<string>();
  const duraciones = new Map<string, number>();
  for (const p of planes) {
    const d = etiquetaDuracion(p.duracionCantidad, p.duracionUnidad);
    duraciones.set(d, (duraciones.get(d) ?? 0) + 1);
  }
  for (const [d, n] of duraciones) if (n > 1) repetidas.add(d);
  const alcanza = saldo ? Number(saldo.usd) >= precioUsd(plan, mayorista) : false;

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
    <BotonCarrito planId={plan.id} nombre={nombrePlan} variante="principal" className="flex-1" />
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
            {nombre}, plan {plan.nombre}, por{' '}
            {etiquetaDuracion(plan.duracionCantidad, plan.duracionUnidad)}
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
        <h3 className="font-titulo text-lg font-bold">Tu cuenta es tuya</h3>
        <p className="flex gap-2.5 rounded-xl border border-exito/30 bg-exito-suave p-3.5 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
          Solo vendemos servicios autorizados: no vendemos cuentas compartidas ni te pedimos la
          contraseña de nadie.
        </p>
      </div>
    </div>
  );

  return (
    <div className="grid gap-x-10 gap-y-7 @5xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
      <div className="@5xl:sticky @5xl:top-40 @5xl:self-start">{arte}</div>
      <div className="grid min-w-0 content-start gap-5">
        {cabecera}
        <div className="grid gap-1 rounded-[1.3rem] border border-borde bg-[linear-gradient(180deg,rgb(255_255_255/0.03),transparent)] px-5 py-4">
          {precio.principal ? (
            <p
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums"
              aria-live="polite"
            >
              {precio.etiqueta && (
                <span className="inline-flex items-center gap-1 self-center rounded-full bg-acento-suave px-2.5 py-0.5 text-xs font-bold text-acento">
                  <Store className="size-3.5" aria-hidden="true" />
                  {precio.etiqueta}
                </span>
              )}
              <strong className="font-titulo text-[clamp(2rem,5vw,2.6rem)] leading-none font-extrabold">
                {precio.principal}
              </strong>
              {precio.referencia && (
                <span className="text-sm text-tinta-tenue">{precio.referencia}</span>
              )}
            </p>
          ) : (
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
        </div>

        {planes.length > 1 && (
          <fieldset className="grid gap-2.5">
            <legend className="mb-2.5 font-titulo font-bold">Elige la duración</legend>
            <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
              {planes.map((p) => {
                const pr = precioDeTarjeta(p, moneda, mayorista);
                const d = etiquetaDuracion(p.duracionCantidad, p.duracionUnidad);
                const elegido = p.id === plan.id;
                return (
                  <label
                    key={p.id}
                    className={clsx(
                      'relative grid cursor-pointer gap-0.5 rounded-2xl border p-3.5 transition-colors',
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
                      className="absolute top-3 right-3 size-4 accent-cian"
                    />
                    <span className="pr-6 font-titulo text-[0.95rem] font-bold">{d}</span>
                    {repetidas.has(d) && (
                      <span className="text-xs text-tinta-suave">{p.nombre}</span>
                    )}
                    <span className="font-semibold tabular-nums">
                      {pr.principal ?? 'Sin precio'}
                    </span>
                    {pr.referencia && (
                      <span className="text-xs text-tinta-tenue tabular-nums">{pr.referencia}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div ref={acciones} className="grid gap-3">
          <div className="flex flex-wrap gap-2.5">
            {botonPrincipal}
            {!esRevendedor && precio.principal && (
              <Link
                href={`/cuenta/planes?plan=${plan.id}&moneda=${moneda}`}
                className={clasesBoton('secundario', 'lg', 'flex-1')}
              >
                Comprar ahora
              </Link>
            )}
          </div>
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
              {nombre} · {etiquetaDuracion(plan.duracionCantidad, plan.duracionUnidad)}
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
            <BotonCarrito planId={plan.id} nombre={nombrePlan} variante="principal" tamano="md" />
          )}
        </div>
      )}
    </div>
  );
}
