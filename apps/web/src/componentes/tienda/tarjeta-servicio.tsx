import type { Moneda, PlanPublico, ServicioTienda } from '@nv/shared';
import clsx from 'clsx';
import { Store } from 'lucide-react';
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

/** Tarjeta de servicio con brillo de su color, imagen, precio desde y carrito. */
export function TarjetaServicio(props: PropsTarjeta) {
  const { item, plan, prioridad } = props;
  const { servicio } = item;
  const href = `/catalogo/${servicio.slug}`;
  return (
    <article
      className="tarjeta-brillo @container/t grid min-w-0 content-start overflow-hidden"
      style={{ '--c': item.color } as CSSProperties}
      aria-labelledby={`srv-${servicio.id}`}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="escenario h-48 rounded-t-[1.3rem] @max-[13rem]/t:h-40"
      >
        <ArteServicio
          arte={item.arte}
          nombre={servicio.nombre}
          categoria={servicio.categoria}
          color={item.color}
          prioridad={prioridad}
          className="relative h-40 w-auto @max-[13rem]/t:h-32"
        />
      </Link>
      <div className="grid gap-2.5 p-4 pt-3.5 @max-[13rem]/t:p-3">
        <p className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
          <i
            className="size-1.5 rounded-full"
            style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
            aria-hidden="true"
          />
          <span className="truncate">{lineaCategoria(plan, servicio.categoria)}</span>
        </p>
        <h3
          id={`srv-${servicio.id}`}
          className="truncate font-titulo text-base font-bold"
          title={servicio.nombre}
        >
          {servicio.nombre}
        </h3>
        <Precio plan={plan} moneda={props.moneda} mayorista={props.mayorista} />
        <div className="mt-1 flex gap-2 @max-[13rem]/t:gap-1.5">
          <Link
            href={href}
            className={clasesBoton(
              'secundario',
              'md',
              'min-w-0 flex-1 @max-[13rem]/t:px-2 @max-[13rem]/t:text-[0.8125rem]',
            )}
          >
            Ver detalles
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
