import { formatearMonto, type PlanMayorista, type PlanPublico } from '@nv/shared';
import clsx from 'clsx';
import { ArrowRight, Check, Store, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { VistaMayorista } from '@/lib/revendedor-publico';
import { formatearDuracion } from '@/lib/formato';
import { SelectorMoneda } from './planes';

/*
 * Vista del catálogo para un revendedor con sesión: precios mayoristas de su
 * nivel en USD o bolívares, con el precio público como referencia y su margen.
 * Sin estado ni APIs del servidor: la usan la página /planes y el bloque de
 * planes del sitio, que reciben la vista por propiedades en cada petición.
 */

export type MonedaMayorista = 'USD' | 'VES';

/** USD o VES: la pedida, la del visitante o, si no, USD. VES solo si hay tasa. */
export function monedaMayorista(
  vista: VistaMayorista | null | undefined,
  ...candidatas: (string | null | undefined)[]
): MonedaMayorista {
  const hayVes = vista?.estado === 'ok' && vista.catalogo.tasaVes !== null;
  for (const c of candidatas) {
    if (c === 'USD') return 'USD';
    if (c === 'VES' && hayVes) return 'VES';
  }
  return 'USD';
}

const redondear = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/** Precio mayorista, público y margen en la moneda elegida. */
function importes(
  p: PlanMayorista,
  publico: PlanPublico | undefined,
  moneda: MonedaMayorista,
  tasaVes: string | null,
) {
  if (moneda === 'VES' && p.precioVes && tasaVes) {
    const publicoVes =
      publico?.precios.VES?.precio ?? redondear(Number(p.precioPublicoUsd) * Number(tasaVes));
    return {
      precio: p.precioVes,
      publico: publicoVes,
      margen: redondear(Number(publicoVes) - Number(p.precioVes)),
      moneda: 'VES' as const,
    };
  }
  return {
    precio: p.precioUsd,
    publico: p.precioPublicoUsd,
    margen: redondear(Number(p.precioPublicoUsd) - Number(p.precioUsd)),
    moneda: 'USD' as const,
  };
}

function TarjetaMayorista({
  plan: p,
  publico,
  moneda,
  tasaVes,
}: {
  plan: PlanMayorista;
  publico: PlanPublico | undefined;
  moneda: MonedaMayorista;
  tasaVes: string | null;
}) {
  const x = importes(p, publico, moneda, tasaVes);
  const conMargen = Number(x.margen) > 0;
  return (
    <article
      aria-labelledby={`mayorista-${p.id}`}
      className="relative flex min-w-0 flex-col gap-5 rounded-nv border border-acento/40 bg-superficie p-6 shadow-nv ring-1 ring-acento/15"
    >
      <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-acento px-2.5 py-0.5 text-xs font-semibold text-fondo">
        <Store className="size-3" aria-hidden="true" /> Precio mayorista
      </span>
      <header className="grid gap-1">
        <h3 id={`mayorista-${p.id}`} className="text-lg font-semibold break-words">
          {p.nombre}
        </h3>
        {p.descripcion && <p className="text-sm text-tinta-suave">{p.descripcion}</p>}
      </header>
      <div className="grid gap-3">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-titulo text-3xl font-semibold break-all text-acento tabular-nums">
            {formatearMonto(x.precio, x.moneda)}
          </span>
          <span className="text-sm text-tinta-tenue">
            / {formatearDuracion(p.duracionCantidad, p.duracionUnidad)}
          </span>
        </p>
        <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-borde text-sm">
          <div className="grid min-w-0 gap-0.5 bg-hundida px-3 py-2.5">
            <dt className="text-xs text-tinta-tenue">Precio público</dt>
            <dd className="break-words text-tinta-suave tabular-nums">
              {formatearMonto(x.publico, x.moneda)}
            </dd>
          </div>
          <div className="grid min-w-0 gap-0.5 border-l border-borde bg-acento-suave px-3 py-2.5">
            <dt className="text-xs text-tinta-tenue">Tu margen</dt>
            <dd className="font-semibold break-words tabular-nums">
              {conMargen ? formatearMonto(x.margen, x.moneda) : 'Sin margen'}
            </dd>
          </div>
        </dl>
      </div>
      {p.beneficios.length > 0 && (
        <ul className="grid gap-2 text-sm">
          {p.beneficios.map((b) => (
            <li key={b} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
              <span className="min-w-0">{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-1">
        <Link
          href={`/revendedor/catalogo?plan=${p.id}`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 text-sm font-medium whitespace-nowrap text-fondo transition-opacity hover:opacity-90"
        >
          Comprar con saldo <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

const MENSAJES: Record<Exclude<VistaMayorista['estado'], 'ok'>, string> = {
  sin_nivel:
    'Todavía no tienes un nivel de revendedor asignado, así que no hay precios mayoristas para ti. El equipo de NV te lo asignará pronto.',
  no_disponible:
    'Tu cuenta de revendedor no está activa ahora mismo. Revisa su estado en tu panel.',
  error: 'No pudimos cargar tus precios de revendedor. Recarga la página en unos segundos.',
};

/**
 * Catálogo con los precios del revendedor. `publicos` son los planes al
 * público (referencia de precio y aviso de los que no se revenden); `servicio`
 * limita la vista a un servicio (por su slug), como el bloque de planes.
 */
export function PlanesMayoristas({
  vista,
  publicos,
  servicio,
  moneda,
  ruta,
  conServicios = true,
  claseRejilla = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3',
}: {
  vista: VistaMayorista;
  publicos: PlanPublico[] | null;
  servicio?: string | null;
  moneda: MonedaMayorista;
  ruta: string;
  conServicios?: boolean;
  claseRejilla?: string;
}) {
  if (vista.estado !== 'ok') {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-nv border border-aviso/40 bg-aviso-suave px-5 py-4 text-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-aviso" aria-hidden="true" />
        <div className="grid gap-1.5">
          <p className="font-semibold">No podemos mostrarte tus precios de revendedor</p>
          <p className="text-tinta-suave">{MENSAJES[vista.estado]}</p>
          <Link href="/revendedor" className="w-fit font-medium text-marca hover:underline">
            Ir a mi panel de revendedor
          </Link>
        </div>
      </div>
    );
  }

  const { catalogo } = vista;
  const publicoDe = new Map((publicos ?? []).map((p) => [p.id, p]));
  // Con un servicio elegido, solo sus planes (su id sale del catálogo público).
  const enAlcance = (publicos ?? []).filter((p) => !servicio || p.servicio.slug === servicio);
  const servicios = new Set(enAlcance.map((p) => p.servicio.id));
  const planes = servicio
    ? catalogo.planes.filter((p) => servicios.has(p.servicio.id))
    : catalogo.planes;
  const noRevendibles = enAlcance.filter((p) => !planes.some((m) => m.id === p.id));
  const grupos = new Map<
    string,
    { servicio: PlanMayorista['servicio']; planes: PlanMayorista[] }
  >();
  for (const p of planes) {
    const g = grupos.get(p.servicio.id) ?? { servicio: p.servicio, planes: [] };
    g.planes.push(p);
    grupos.set(p.servicio.id, g);
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 rounded-nv border border-acento/40 bg-acento-suave px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-acento text-fondo"
            aria-hidden="true"
          >
            <Store className="size-5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <p className="text-base font-semibold break-words">
              Tus precios de revendedor · Nivel {catalogo.nivel.nombre}
            </p>
            <p className="text-sm text-tinta-suave">
              Entraste como revendedor: estos son los precios mayoristas de tu nivel, no los del
              público. Las compras se cobran de tu saldo en USD
              {catalogo.tasaVes
                ? '; el precio en bolívares es el equivalente con la tasa de hoy.'
                : '.'}
            </p>
          </div>
        </div>
        {catalogo.tasaVes && (
          <SelectorMoneda monedas={['USD', 'VES']} actual={moneda} ruta={ruta} />
        )}
      </div>

      {grupos.size === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-nv border border-borde bg-superficie px-6 py-12 text-center shadow-nv">
          <Store className="size-5 text-acento" aria-hidden="true" />
          <p className="font-semibold">No hay precios mayoristas aquí para tu nivel</p>
          <p className="text-sm text-tinta-suave">
            Estos planes no están disponibles para reventa.{' '}
            <Link href="/revendedor/catalogo" className="font-medium text-marca hover:underline">
              Ver tu catálogo mayorista
            </Link>
          </p>
        </div>
      ) : (
        [...grupos.values()].map((g) => (
          <div key={g.servicio.id} className="grid gap-5">
            {conServicios && <h3 className="text-2xl font-semibold">{g.servicio.nombre}</h3>}
            <div className={clsx(claseRejilla, 'pt-2')}>
              {g.planes.map((p) => (
                <TarjetaMayorista
                  key={p.id}
                  plan={p}
                  publico={publicoDe.get(p.id)}
                  moneda={moneda}
                  tasaVes={catalogo.tasaVes}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {grupos.size > 0 && noRevendibles.length > 0 && (
        <p className="text-sm text-tinta-tenue">
          Algunos planes no están disponibles para reventa y no aparecen aquí.
        </p>
      )}
    </div>
  );
}
