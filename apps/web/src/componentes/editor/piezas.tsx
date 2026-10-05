'use client';

// Piezas comunes de Sitio y páginas y del editor: estado de la página, «hace X»,
// campos con contador y validación en vivo, y la nota de lo que solo hace administración.
import type { PaginaSitioResumen } from '@nv/shared';
import clsx from 'clsx';
import { Check, ShieldCheck } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { PildoraEstado, type TonoEstado } from '@/componentes/cliente/pago';
import { clasesEntrada } from '@/componentes/ui/clases';
import { haceCuanto } from '@/lib/formato';

/** Estado de publicación de una página: texto y tono de su pastilla. */
export function estadoPagina(p: PaginaSitioResumen): { texto: string; tono: TonoEstado } {
  if (p.archivada) return { texto: 'Archivada', tono: 'neutro' };
  if (!p.versionPublicada) return { texto: 'Sin publicar', tono: 'cian' };
  if (p.cambiosSinPublicar) return { texto: 'Cambios sin publicar', tono: 'aviso' };
  return { texto: `Publicada v${p.versionPublicada.numero}`, tono: 'exito' };
}

export function EstadoPagina({ p }: { p: PaginaSitioResumen }) {
  const e = estadoPagina(p);
  return <PildoraEstado texto={e.texto} tono={e.tono} />;
}

/** «hace 3 días»: el servidor y el navegador pueden diferir por segundos. */
export function Hace({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {haceCuanto(iso)}
    </time>
  );
}

/** Nota de lo que solo puede hacer administración. */
export function NotaRol({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[0.82rem] text-tinta-suave">
      <ShieldCheck className="size-4 shrink-0 text-cian" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Contador «12/120» (rojo si se pasa). */
export function Contador({ n, max }: { n: number; max: number }) {
  return (
    <span
      className={clsx(
        'text-[0.72rem] font-semibold whitespace-nowrap tabular-nums',
        n > max ? 'text-peligro' : 'text-tinta-tenue',
      )}
      aria-hidden="true"
    >
      {n}/{max}
    </span>
  );
}

type PropsBase = {
  etiqueta: string;
  /** Muestra «opcional» junto a la etiqueta. */
  opcional?: boolean;
  /** Máximo de caracteres: muestra el contador. */
  max?: number;
  error?: string | undefined;
  ayuda?: ReactNode;
  /** Validación en vivo: ya cumple lo pedido (borde verde y «Listo»). */
  ok?: boolean;
  /** Texto del estado correcto (por defecto «Listo»). */
  textoOk?: string;
  className?: string;
};

function Mensaje({
  id,
  error,
  ok,
  textoOk,
  ayuda,
}: {
  id: string;
  error?: string | undefined;
  ok?: boolean | undefined;
  textoOk?: string | undefined;
  ayuda?: ReactNode;
}) {
  if (error) {
    return (
      <p id={id} className="text-xs font-medium text-peligro">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p id={id} className="inline-flex items-center gap-1 text-xs font-medium text-exito">
        <Check className="size-3.5" aria-hidden="true" />
        {textoOk ?? 'Listo'}
      </p>
    );
  }
  if (!ayuda) return null;
  return (
    <p id={id} className="text-xs text-tinta-tenue">
      {ayuda}
    </p>
  );
}

function Etiqueta({
  id,
  etiqueta,
  opcional,
  max,
  n,
}: {
  id: string;
  etiqueta: string;
  opcional?: boolean | undefined;
  max?: number | undefined;
  n: number;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-[0.82rem] font-semibold text-tinta">
        {etiqueta}
        {opcional && (
          <i className="ml-1 text-xs font-medium text-tinta-tenue not-italic">opcional</i>
        )}
      </label>
      {max ? <Contador n={n} max={max} /> : null}
    </div>
  );
}

/** Campo de una línea con contador, ayuda y validación en vivo. */
export function CampoTexto({
  etiqueta,
  opcional,
  max,
  error,
  ayuda,
  ok,
  textoOk,
  className,
  value,
  id: idDado,
  ...resto
}: PropsBase & Omit<ComponentProps<'input'>, 'className'>) {
  const generado = useId();
  const id = idDado ?? generado;
  const n = String(value ?? '').length;
  return (
    <div className={clsx('grid min-w-0 gap-1.5', className)}>
      <Etiqueta id={id} etiqueta={etiqueta} opcional={opcional} max={max} n={n} />
      <input
        id={id}
        value={value}
        maxLength={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-m`}
        data-valido={ok && !error ? true : undefined}
        className={clsx(clasesEntrada, 'min-w-0')}
        {...resto}
      />
      <Mensaje id={`${id}-m`} error={error} ok={ok} textoOk={textoOk} ayuda={ayuda} />
    </div>
  );
}

/** Área de texto con contador, ayuda y validación en vivo. */
export function CampoArea({
  etiqueta,
  opcional,
  max,
  error,
  ayuda,
  ok,
  textoOk,
  className,
  value,
  rows = 3,
  extra,
  id: idDado,
  ...resto
}: PropsBase & { extra?: ReactNode } & Omit<ComponentProps<'textarea'>, 'className'>) {
  const generado = useId();
  const id = idDado ?? generado;
  const n = String(value ?? '').length;
  return (
    <div className={clsx('grid min-w-0 gap-1.5', className)}>
      <Etiqueta id={id} etiqueta={etiqueta} opcional={opcional} max={max} n={n} />
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-m`}
        data-valido={ok && !error ? true : undefined}
        className={clsx(clasesEntrada, 'h-auto min-w-0 py-2.5 leading-relaxed')}
        {...resto}
      />
      <Mensaje id={`${id}-m`} error={error} ok={ok} textoOk={textoOk} ayuda={ayuda} />
      {extra}
    </div>
  );
}

/** Lista desplegable con la misma forma que los campos del editor. */
export function CampoLista({
  etiqueta,
  error,
  ayuda,
  className,
  children,
  ...resto
}: Pick<PropsBase, 'etiqueta' | 'error' | 'ayuda' | 'className'> &
  Omit<ComponentProps<'select'>, 'id' | 'className'>) {
  const id = useId();
  return (
    <div className={clsx('grid min-w-0 gap-1.5', className)}>
      <Etiqueta id={id} etiqueta={etiqueta} n={0} />
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-m`}
        className={clsx(clasesEntrada, 'min-w-0')}
        {...resto}
      >
        {children}
      </select>
      <Mensaje id={`${id}-m`} error={error} ayuda={ayuda} />
    </div>
  );
}

/** Aviso informativo en línea (cian) o de cuidado (ámbar). */
export function Info({
  tono = 'cian',
  icono,
  children,
}: {
  tono?: 'cian' | 'ambar';
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 rounded-[0.9rem] border px-3 py-2.5 text-[0.82rem] [&_b]:text-tinta',
        tono === 'cian'
          ? 'border-cian/30 bg-cian/5 text-tinta-suave [&>svg]:text-cian'
          : 'border-aviso/40 bg-aviso/6 text-[#fde68a] [&>svg]:text-aviso',
      )}
    >
      {icono}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Enlace de una acción que borra (rojo, sin caja). */
export const claseEnlacePeligro =
  'inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-peligro hover:underline';
