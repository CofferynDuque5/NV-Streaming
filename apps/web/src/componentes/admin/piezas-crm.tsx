import clsx from 'clsx';
import { ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { diasHasta, formatearFecha } from '@/lib/formato';

/*
 * Piezas compartidas por las pantallas de clientes, suscripciones y soporte.
 * Sin 'use client': sirven tanto en páginas de servidor como en formularios.
 */

/** Misma apariencia que `clasesEntrada`, utilizable en formularios de servidor. */
export const clasesFiltro =
  'h-11 w-full rounded-xl border border-borde-fuerte bg-hundida px-3.5 text-[0.95rem] text-tinta placeholder:text-tinta-tenue transition-colors hover:border-tinta-tenue focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca-suave';

/** Enlace de vuelta a la lista, encima del título de un detalle. */
export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2 text-sm text-tinta-suave transition-colors hover:text-tinta"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  );
}

const TONOS_INICIALES = {
  marca: 'border-marca/20 bg-marca-suave text-marca',
  neutro: 'border-borde bg-hundida text-tinta-suave',
  aviso: 'border-aviso/30 bg-aviso-suave text-aviso',
};

const TAMANOS_INICIALES = {
  sm: 'size-8 text-[0.6875rem]',
  md: 'size-9 text-xs',
  lg: 'size-14 text-lg',
};

/** Círculo con las iniciales de una persona o cliente (decorativo). */
export function Iniciales({
  nombre,
  tono = 'marca',
  tamano = 'md',
  className,
}: {
  nombre: string;
  tono?: keyof typeof TONOS_INICIALES;
  tamano?: keyof typeof TAMANOS_INICIALES;
  className?: string;
}) {
  const letras = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-full border font-semibold',
        TONOS_INICIALES[tono],
        TAMANOS_INICIALES[tamano],
        className,
      )}
    >
      {letras || '·'}
    </span>
  );
}

const COLUMNAS_DATOS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

/** Lista de pares etiqueta/valor en rejilla. */
export function ListaDatos({
  datos,
  columnas = 2,
  className,
}: {
  datos: [string, ReactNode][];
  columnas?: keyof typeof COLUMNAS_DATOS;
  className?: string;
}) {
  return (
    <dl
      className={clsx(
        'grid gap-x-8 gap-y-4 px-5 py-5 sm:px-6',
        COLUMNAS_DATOS[columnas],
        className,
      )}
    >
      {datos.map(([k, v]) => (
        <div key={k} className="grid min-w-0 content-start gap-0.5">
          <dt className="text-xs text-tinta-tenue">{k}</dt>
          <dd className="text-sm break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Texto discreto para listas vacías dentro de una tarjeta. */
export function VacioCompacto({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm text-tinta-tenue sm:px-6">{children}</p>;
}

/** Selector con etiqueta oculta para las barras de filtros (formularios GET). */
export function FiltroSelector({
  id,
  etiqueta,
  name,
  defaultValue,
  children,
}: {
  id: string;
  etiqueta: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={clsx(clasesFiltro, 'w-full sm:w-auto')}
      >
        {children}
      </select>
    </>
  );
}

/** Contenedor del formulario de alta que se despliega bajo la cabecera de una lista. */
export function PanelAlta({
  titulo,
  descripcion,
  cerrarHref,
  children,
}: {
  titulo: string;
  descripcion?: ReactNode;
  cerrarHref: string;
  children: ReactNode;
}) {
  return (
    <section className="relative rounded-nv border border-marca/25 bg-elevada shadow-nv before:pointer-events-none before:absolute before:inset-x-6 before:-top-px before:h-px before:bg-linear-to-r before:from-transparent before:via-marca/60 before:to-transparent">
      <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {descripcion && <p className="text-sm text-tinta-suave">{descripcion}</p>}
        </div>
        <Link
          href={cerrarHref}
          scroll={false}
          className="rounded-lg p-1.5 text-tinta-tenue hover:bg-hundida hover:text-tinta"
          aria-label="Cerrar el formulario"
        >
          <X className="size-4" aria-hidden="true" />
        </Link>
      </header>
      <div className="px-5 pt-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

/** "hoy", "mañana", "en 5 días", "hace 3 días" y un tono según la urgencia. */
export function relativoDias(iso: string): { texto: string; tono: string } {
  const d = diasHasta(iso);
  const texto =
    d === 0
      ? 'hoy'
      : d === 1
        ? 'mañana'
        : d === -1
          ? 'ayer'
          : d > 0
            ? `en ${d} días`
            : `hace ${-d} días`;
  const tono = d < 0 ? 'text-peligro' : d <= 7 ? 'text-aviso' : 'text-tinta-tenue';
  return { texto, tono };
}

/** Fecha de vencimiento con la distancia en días debajo. */
export function Vencimiento({ iso, vacio = 'Sin fecha' }: { iso: string | null; vacio?: string }) {
  if (!iso) return <span className="text-tinta-tenue">{vacio}</span>;
  const r = relativoDias(iso);
  return (
    <span className="grid">
      <time dateTime={iso}>{formatearFecha(iso)}</time>
      <span className={clsx('text-xs', r.tono)}>{r.texto}</span>
    </span>
  );
}

const regiones = new Intl.DisplayNames(['es'], { type: 'region' });

/** Nombre del país a partir de su código ISO de 2 letras. */
export function nombrePais(codigo: string | null): string | null {
  if (!codigo) return null;
  try {
    return regiones.of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

/** Países más habituales, para sugerirlos al escribir el código. */
export const PAISES_FRECUENTES = [
  'VE',
  'CO',
  'AR',
  'PE',
  'CL',
  'EC',
  'MX',
  'PA',
  'DO',
  'UY',
  'BO',
  'PY',
  'CR',
  'GT',
  'ES',
  'US',
] as const;

export const ORIGEN_CLIENTE: Record<string, string> = {
  equipo: 'Alta hecha por el equipo',
  registro_web: 'Se registró en la web',
};
