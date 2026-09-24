import { formatearMonto, INFO_MONEDA, type Moneda, type PlanPublico } from '@nv/shared';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatearDuracion } from '@/lib/formato';

/** Agrupa los planes por servicio, conservando el orden del catálogo. */
export function agruparPorServicio(planes: PlanPublico[]) {
  const grupos = new Map<string, { servicio: PlanPublico['servicio']; planes: PlanPublico[] }>();
  for (const p of planes) {
    const g = grupos.get(p.servicio.id) ?? { servicio: p.servicio, planes: [] };
    g.planes.push(p);
    grupos.set(p.servicio.id, g);
  }
  return [...grupos.values()];
}

/** Selector de moneda con enlaces: funciona sin JavaScript y no retrasa la carga. */
export function SelectorMoneda({
  monedas,
  actual,
  ruta,
}: {
  monedas: readonly Moneda[];
  actual: Moneda;
  ruta: string;
}) {
  if (monedas.length <= 1) return null;
  return (
    <nav aria-label="Moneda" className="flex flex-wrap gap-1.5">
      {monedas.map((m) => (
        <Link
          key={m}
          href={`${ruta}?moneda=${m}`}
          scroll={false}
          aria-current={m === actual ? 'true' : undefined}
          title={INFO_MONEDA[m].nombre}
          className={clsx(
            'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
            m === actual
              ? 'border-marca bg-marca-suave text-marca'
              : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
          )}
        >
          {m}
        </Link>
      ))}
    </nav>
  );
}

/** Precio por periodo, p. ej. "Bs 898,50 / 1 mes". */
export function PrecioPlan({ plan, moneda }: { plan: PlanPublico; moneda: Moneda }) {
  const precio = plan.precios[moneda];
  if (!precio) {
    return <p className="text-sm text-tinta-tenue">No disponible en {moneda} por ahora.</p>;
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-titulo text-3xl font-semibold tabular-nums">
        {Number(precio.precio) === 0 ? 'Gratis' : formatearMonto(precio.precio, moneda)}
      </span>
      <span className="text-sm text-tinta-tenue">
        / {formatearDuracion(plan.duracionCantidad, plan.duracionUnidad)}
      </span>
    </p>
  );
}

export function TarjetaPlan({
  plan,
  moneda,
  destacado,
  accion,
}: {
  plan: PlanPublico;
  moneda: Moneda;
  /** Texto de la cinta que resalta el plan. */
  destacado?: string | undefined;
  accion: ReactNode;
}) {
  return (
    <article
      className={clsx(
        'relative flex flex-col gap-5 rounded-nv border bg-superficie p-6 shadow-nv',
        destacado ? 'border-marca/50 ring-1 ring-marca/25' : 'border-borde',
      )}
    >
      {destacado && (
        <span className="absolute -top-3 left-6 rounded-full bg-marca px-2.5 py-0.5 text-xs font-semibold text-marca-tinta">
          {destacado}
        </span>
      )}
      <header className="grid gap-1">
        <h3 className="text-lg font-semibold">{plan.nombre}</h3>
        {plan.descripcion && <p className="text-sm text-tinta-suave">{plan.descripcion}</p>}
      </header>
      <PrecioPlan plan={plan} moneda={moneda} />
      {plan.beneficios.length > 0 && (
        <ul className="grid gap-2 text-sm">
          {plan.beneficios.map((b) => (
            <li key={b} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-1">{accion}</div>
    </article>
  );
}

/** Elige la moneda pedida si está disponible; si no, la primera disponible. */
export function monedaValida(
  pedida: string | undefined,
  disponibles: readonly Moneda[],
  preferida?: Moneda,
): Moneda {
  const candidatas = [pedida, preferida, 'USD'];
  for (const c of candidatas)
    if (c && (disponibles as readonly string[]).includes(c)) return c as Moneda;
  return disponibles[0] ?? 'USD';
}
