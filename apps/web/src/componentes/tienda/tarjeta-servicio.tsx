import type { Moneda, PlanPublico, ServicioTienda } from '@nv/shared';
import clsx from 'clsx';
import { ShoppingCart, Store } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { ArteServicio } from './arte';
import { BotonCarrito } from './boton-carrito';
import { lineaCategoria, type MayoristaTienda, precioDeTarjeta } from './precio-tarjeta';

export interface PropsTarjeta {
  item: ServicioTienda;
  /** Plan que representa al servicio (el más barato con los filtros). */
  plan: PlanPublico;
  moneda: Moneda;
  mayorista?: MayoristaTienda | null | undefined;
  prioridad?: boolean;
}

function Precio({ plan, moneda, mayorista }: Omit<PropsTarjeta, 'item'>) {
  const p = precioDeTarjeta(plan, moneda, mayorista);
  if (!p.principal) return <p className="text-sm text-tinta-tenue">No disponible en {moneda}</p>;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
      {p.etiqueta && (
        <span className="inline-flex items-center gap-1 rounded-full bg-acento-suave px-2 py-0.5 text-[0.7rem] font-bold text-acento">
          <Store className="size-3" aria-hidden="true" />
          {p.etiqueta}
        </span>
      )}
      <strong className="font-titulo text-[1.05rem] font-bold tracking-tight">
        {!p.etiqueta && <span className="sr-only">Desde </span>}
        {p.principal}
      </strong>
      {p.referencia && <span className="text-xs text-tinta-tenue">{p.referencia}</span>}
    </p>
  );
}

function Accion({ item, plan, moneda, mayorista }: PropsTarjeta) {
  const p = precioDeTarjeta(plan, moneda, mayorista);
  const nombre = item.servicio.nombre;
  // Sin stock: la tarjeta se ve igual; el carrito lleva a la ficha, donde se pide por WhatsApp.
  if (plan.agotado) {
    return (
      <Link
        href={`/catalogo/${item.servicio.slug}?plan=${plan.id}`}
        aria-label={`${nombre} está agotado: pedirlo por WhatsApp`}
        title="Agotado por ahora: pídelo por WhatsApp"
        className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] border border-borde-fuerte bg-white/[0.03] text-tinta transition-colors hover:border-cian"
      >
        <ShoppingCart className="size-[1.1rem]" aria-hidden="true" />
      </Link>
    );
  }
  if (mayorista) {
    return p.compraMayorista ? (
      <Link
        href={`/revendedor/catalogo?plan=${plan.id}`}
        className={clasesBoton('secundario', 'md', 'px-3')}
        aria-label={`Comprar ${nombre} con saldo`}
      >
        Con saldo
      </Link>
    ) : null;
  }
  if (!p.principal) return null;
  return <BotonCarrito planId={plan.id} nombre={`${nombre} (${plan.nombre})`} />;
}

/**
 * Tarjeta de servicio: la tarjeta de regalo del servicio en grande, sobre una
 * vitrina con haces de luz de su color; al pasar el mouse se levanta, se inclina
 * y le cruza un destello. Debajo, nombre, precio desde y botones.
 */
export function TarjetaServicio(props: PropsTarjeta) {
  const { item, plan, prioridad } = props;
  const { servicio } = item;
  const href = `/catalogo/${servicio.slug}`;
  return (
    <article
      className="tarjeta-brillo tarjeta-vitrina group/t @container/t grid min-w-0 content-start overflow-hidden"
      style={{ '--c': item.color } as CSSProperties}
      aria-labelledby={`srv-${servicio.id}`}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="vitrina-escena relative grid h-72 place-items-center rounded-t-[1.3rem] pt-3 @max-[13rem]/t:h-56"
      >
        <span className="vitrina-tarjeta relative h-60 @max-[13rem]/t:h-44">
          <ArteServicio
            arte={item.arte}
            nombre={servicio.nombre}
            categoria={servicio.categoria}
            color={item.color}
            prioridad={prioridad}
            className={clsx(
              'relative h-full w-auto',
              servicio.vitrina?.invertirLogo && servicio.imagen && '[&_img]:invert',
            )}
          />
        </span>
        {(servicio.vitrina?.destacado || servicio.vitrina?.nuevo) && (
          <span className="absolute top-3 left-3 z-10 flex gap-1.5">
            {servicio.vitrina.destacado && (
              <span className="rounded-full bg-[linear-gradient(90deg,#ef4444,#f97316)] px-2 py-0.5 text-[0.66rem] font-extrabold tracking-wide text-white shadow-[0_0_14px_rgb(249_115_22/0.6)]">
                🔥 HOT
              </span>
            )}
            {servicio.vitrina.nuevo && (
              <span className="rounded-full bg-[linear-gradient(90deg,#8b5cf6,#d946ef)] px-2 py-0.5 text-[0.66rem] font-extrabold tracking-wide text-white shadow-[0_0_14px_rgb(168_85_247/0.6)]">
                NUEVO
              </span>
            )}
          </span>
        )}
      </Link>
      <div className="relative grid gap-2 p-4 pt-1 text-center @max-[13rem]/t:p-3 @max-[13rem]/t:pt-1">
        <p className="mx-auto flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[0.66rem] font-bold tracking-[0.12em] text-tinta-suave uppercase">
          <i
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
            aria-hidden="true"
          />
          <span className="truncate">{lineaCategoria(plan, servicio.categoria)}</span>
        </p>
        <h3
          id={`srv-${servicio.id}`}
          className="truncate font-titulo text-lg leading-tight font-bold @max-[13rem]/t:text-base"
          title={servicio.nombre}
        >
          {servicio.nombre}
        </h3>
        <div className="flex justify-center">
          <Precio plan={plan} moneda={props.moneda} mayorista={props.mayorista} />
        </div>
        <div className="mt-1 flex gap-2 @max-[13rem]/t:gap-1.5">
          <Link
            href={href}
            className={clasesBoton(
              'primario',
              'md',
              'min-w-0 flex-1 @max-[13rem]/t:px-2 @max-[13rem]/t:text-[0.8125rem]',
            )}
          >
            Elegir plan
            <span className="sr-only"> de {servicio.nombre}</span>
          </Link>
          <Accion {...props} />
        </div>
      </div>
    </article>
  );
}

/** La misma tarjeta en forma de fila (vista de lista del catálogo). */
export function FilaServicio(props: PropsTarjeta) {
  const { item, plan } = props;
  const { servicio } = item;
  const href = `/catalogo/${servicio.slug}`;
  return (
    <article
      className="tarjeta-brillo flex min-w-0 items-center gap-4 p-3 pr-4"
      style={{ '--c': item.color } as CSSProperties}
      aria-labelledby={`fila-${servicio.id}`}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="escenario h-24 w-20 shrink-0 rounded-2xl"
      >
        <ArteServicio
          arte={item.arte}
          nombre={servicio.nombre}
          categoria={servicio.categoria}
          color={item.color}
          className="relative h-20 w-auto"
        />
      </Link>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="truncate text-[0.68rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
          {lineaCategoria(plan, servicio.categoria)}
        </p>
        <h3 id={`fila-${servicio.id}`} className="truncate font-titulo text-base font-bold">
          <Link href={href} className="hover:underline">
            {servicio.nombre}
          </Link>
        </h3>
        <Precio plan={plan} moneda={props.moneda} mayorista={props.mayorista} />
      </div>
      <div className={clsx('flex shrink-0 gap-2')}>
        <Accion {...props} />
      </div>
    </article>
  );
}
