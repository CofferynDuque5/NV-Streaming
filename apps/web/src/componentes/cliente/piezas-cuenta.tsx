// Sin 'use client': piezas de presentación de la cuenta del cliente que usan
// tanto las páginas (servidor) como los formularios (navegador).
import {
  aspectoServicio,
  type CategoriaServicio,
  type EstadoFactura,
  type EstadoSuscripcion,
  type EstadoTicket,
} from '@nv/shared';
import clsx from 'clsx';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { TonoEstado } from './pago';

/** Enlace de acción secundaria (cian, sin caja). */
export const claseEnlace =
  'inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-cian hover:underline disabled:opacity-60';

/** Lista con filas separadas (facturas, solicitudes). */
export const claseLista =
  'grid overflow-hidden rounded-[1.25rem] border border-borde bg-[rgb(10_14_32/0.6)] [&>*+*]:border-t [&>*+*]:border-borde';

/** Fila de una lista: icono, título y detalle, y a la derecha el importe o el estado. */
export const claseFila =
  'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3.5 py-3 text-tinta transition-colors hover:bg-white/[0.025] sm:grid-cols-[auto_minmax(0,1fr)_auto]';

/** Caja de sección (formularios de perfil, solicitud, respuesta). */
export const claseCaja =
  'grid gap-3.5 rounded-[1.375rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5';

export function CabeceraCuenta({
  titulo,
  descripcion,
  accion,
  pequena,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  pequena?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3.5">
      <div className="grid min-w-0 gap-1">
        <h1
          className={clsx(
            'break-words',
            pequena
              ? 'text-[clamp(1.375rem,3.4vw,1.875rem)]'
              : 'text-[clamp(1.625rem,4.4vw,2.375rem)]',
          )}
        >
          {titulo}
        </h1>
        {descripcion && <p className="max-w-[35rem] text-tinta-suave">{descripcion}</p>}
      </div>
      {accion && <div className="flex shrink-0 flex-wrap gap-2">{accion}</div>}
    </div>
  );
}

export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-tinta-suave hover:text-tinta"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

type TonoAviso = 'aviso' | 'peligro' | 'cian' | 'violeta';
const BORDE_AVISO: Record<TonoAviso, [string, string]> = {
  aviso: ['border-aviso/40', '#f59e0b'],
  peligro: ['border-peligro/45', '#ef4444'],
  cian: ['border-cian/40', '#22d3ee'],
  violeta: ['border-violeta/40', '#8b5cf6'],
};

/** Aviso de «Para revisar»: orbe, qué pasa y una sola acción. */
export function Aviso({
  tono,
  icono,
  titulo,
  children,
  accion,
}: {
  tono: TonoAviso;
  icono: ReactNode;
  titulo: ReactNode;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  const [borde, color] = BORDE_AVISO[tono];
  return (
    <div
      className={clsx(
        'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-[rgb(8_11_26/0.7)] px-3.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
        borde,
      )}
    >
      <span
        className="orbe orbe-sm size-[2.375rem] text-base after:hidden"
        style={{ '--c': color } as CSSProperties}
        aria-hidden="true"
      >
        {icono}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <b className="text-[0.92rem]">{titulo}</b>
        {children && <span className="text-[0.82rem] text-tinta-suave">{children}</span>}
      </div>
      {accion && (
        <div className="col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end">
          {accion}
        </div>
      )}
    </div>
  );
}

/** Cifra del resumen (servicios activos, próximo vencimiento, saldo, solicitudes). */
export function Cifra({
  titulo,
  valor,
  detalle,
  href,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  href?: string;
}) {
  const contenido = (
    <>
      <span className="truncate text-[0.78rem] text-tinta-suave">{titulo}</span>
      <b className="truncate font-titulo text-[1.375rem] font-extrabold tabular-nums">{valor}</b>
      <small className="truncate text-xs text-tinta-tenue">{detalle || ' '}</small>
    </>
  );
  const clase =
    'grid min-w-0 gap-1 rounded-[1.125rem] border border-borde bg-[rgb(10_14_32/0.6)] p-3.5 text-tinta';
  return href ? (
    <Link href={href} className={clsx(clase, 'transition-colors hover:border-borde-fuerte')}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** Estado vacío con orbe, título, texto y una acción principal. */
export function Vacio({
  icono,
  color = '#4f8dff',
  titulo,
  children,
  accion,
}: {
  icono?: ReactNode;
  color?: string;
  titulo?: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2.5 rounded-[1.25rem] border-[1.5px] border-dashed border-borde-fuerte px-4 py-8 text-center text-sm text-tinta-suave">
      {icono && (
        <span className="orbe" style={{ '--c': color } as CSSProperties} aria-hidden="true">
          {icono}
        </span>
      )}
      {titulo && <b className="text-[1.05rem] text-tinta">{titulo}</b>}
      {children && <span className="max-w-md">{children}</span>}
      {accion}
    </div>
  );
}

/** Nota de seguridad de los accesos: nunca usuarios ni contraseñas. */
export function NotaSeguridad({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-borde bg-[rgb(8_11_26/0.6)] px-3.5 py-3 text-[0.82rem] text-tinta-suave">
      <ShieldCheck className="mt-px size-4 shrink-0 text-cian" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Imagen del servicio (la tarjeta de la tienda recortada) o, si no tiene, sus
 * iniciales sobre el color de su universo.
 */
export function MiniaturaServicio({
  slug,
  categoria,
  nombre,
  className = 'size-[3.375rem]',
}: {
  slug: string;
  categoria: CategoriaServicio | null;
  nombre: string;
  className?: string;
}) {
  const { arte, color } = aspectoServicio(slug, categoria);
  if (arte) {
    return (
      <img
        src={`/servicios/${arte}.webp`}
        alt=""
        width={54}
        height={54}
        loading="lazy"
        decoding="async"
        className={clsx(
          'shrink-0 rounded-[0.875rem] border border-borde-fuerte object-cover',
          className,
        )}
      />
    );
  }
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-[0.875rem] border border-borde-fuerte font-titulo text-base font-extrabold text-white',
        className,
      )}
      style={{
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${color} 45%, #0b1030), #080b1c 75%)`,
      }}
    >
      {letras}
    </span>
  );
}

/* ───────────────────────── estados con su tono ───────────────────────── */

export const ESTADO_SERVICIO: Record<EstadoSuscripcion, [string, TonoEstado]> = {
  pendiente_pago: ['Pendiente de pago', 'aviso'],
  activa: ['Activa', 'exito'],
  en_gracia: ['En gracia', 'aviso'],
  pausada: ['Pausada', 'neutro'],
  suspendida: ['Suspendida', 'peligro'],
  vencida: ['Vencida', 'peligro'],
  cancelada: ['Cancelada', 'neutro'],
};

export function estadoFactura(estado: EstadoFactura, vencida: boolean): [string, TonoEstado] {
  if (estado === 'emitida') return vencida ? ['Vencida', 'peligro'] : ['Pendiente', 'aviso'];
  if (estado === 'pagada') return ['Pagada', 'exito'];
  return ['Anulada', 'neutro'];
}

export const ESTADO_SOLICITUD: Record<EstadoTicket, [string, TonoEstado]> = {
  abierto: ['Abierta', 'cian'],
  en_progreso: ['En progreso', 'cian'],
  esperando_cliente: ['Esperando tu respuesta', 'aviso'],
  resuelto: ['Resuelta', 'exito'],
  cerrado: ['Cerrada', 'neutro'],
};

/** Fecha corta («3 oct.») y larga («3 de octubre»). Se forman en el servidor. */
const corta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const larga = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' });
export const fechaCorta = (iso: string) => corta.format(new Date(iso));
export const fechaLarga = (iso: string) => larga.format(new Date(iso));

/** Área de texto con el mismo borde de validación que las entradas (`claseEntrada`). */
export const claseArea = (estado: 'ok' | 'aviso' | 'mal' | '') =>
  clsx(
    'min-h-[4.75rem] w-full min-w-0 resize-y rounded-xl border bg-hundida px-3.5 py-3 text-[0.95rem] text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus-visible:border-cian [color-scheme:dark]',
    estado === 'mal' && 'border-peligro',
    estado === 'aviso' && 'border-aviso/70',
    estado === 'ok' && 'border-exito/70',
    estado === '' && 'border-borde-fuerte',
  );

/** Países que se ofrecen en los formularios de la cuenta (código ISO → nombre). */
export const PAISES: Record<string, string> = {
  VE: 'Venezuela',
  AR: 'Argentina',
  CO: 'Colombia',
  PE: 'Perú',
  ES: 'España',
  CL: 'Chile',
  EC: 'Ecuador',
  MX: 'México',
  PA: 'Panamá',
  DO: 'República Dominicana',
  US: 'Estados Unidos',
};
