// Sin 'use client': piezas del panel del revendedor que usan las páginas
// (servidor) y sus partes interactivas.
import {
  type CategoriaServicio,
  formatearMonto,
  type OrdenCartera,
  type RecargaPublica,
  type RevendedorDetalle,
  type SuscripcionPublica,
} from '@nv/shared';
import clsx from 'clsx';
import { Clock, Star, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PildoraEstado } from '@/componentes/cliente/pago';
import { Aviso, claseEnlace, MiniaturaServicio } from '@/componentes/cliente/piezas-cuenta';
import { BotonEnlace } from '@/componentes/ui/boton';

export const usd = (v: string | number) => formatearMonto(Number(v).toFixed(2), 'USD');

/** Saldo por debajo del cual se avisa que recargue. */
export const SALDO_BAJO_USD = 5;

const DIA_MS = 86_400_000;
/** Fechas en hora de Venezuela (igual en el servidor y en el navegador). */
const ZONA = 'America/Caracas';
const corta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: ZONA });
const larga = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: ZONA });
const hora = new Intl.DateTimeFormat('es', {
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONA,
});
export const fechaCorta = (iso: string) => corta.format(new Date(iso));
export const fechaLarga = (iso: string) => larga.format(new Date(iso));
/**
 * «2:41 p. m.». Se arma a mano: el espacio que pone Intl antes de «p. m.»
 * cambia entre Node y el navegador y la hidratación no coincidiría.
 */
export function horaCorta(iso: string) {
  const [h, m] = hora.format(new Date(iso)).split(':').map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
/** «3 oct.» de un día AAAA-MM-DD de la serie de ventas. */
export const diaCorto = (fecha: string) => corta.format(new Date(`${fecha}T12:00:00-04:00`));

/** Días que faltan hasta una fecha (negativo si ya pasó). */
export const diasHasta = (iso: string, ahora = Date.now()) =>
  Math.ceil((new Date(iso).getTime() - ahora) / DIA_MS);

/** Nivel del revendedor («Nivel Plata») o «Nivel por asignar» si aún no tiene. */
export function NivelChip({ nivel }: { nivel: { nombre: string } | null }) {
  const nombre = nivel?.nombre.toLowerCase() ?? '';
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-self-start rounded-full border px-2.5 py-0.5 font-mono text-[0.68rem] font-bold tracking-[0.08em] whitespace-nowrap uppercase',
        !nivel
          ? 'border-dashed border-borde-fuerte text-tinta-suave'
          : nombre.includes('oro')
            ? 'border-[rgb(251_191_36/0.5)] bg-[linear-gradient(135deg,rgb(245_158_11/0.35),rgb(253_230_138/0.12))] text-[#fde68a]'
            : nombre.includes('bronce')
              ? 'border-[rgb(251_146_60/0.5)] bg-[linear-gradient(135deg,rgb(194_65_12/0.35),rgb(253_186_116/0.12))] text-[#fdba74]'
              : 'border-[rgb(226_232_240/0.4)] bg-[linear-gradient(135deg,rgb(148_163_184/0.35),rgb(226_232_240/0.15))] text-[#e2e8f0]',
      )}
    >
      {nivel ? `Nivel ${nivel.nombre}` : 'Nivel por asignar'}
    </span>
  );
}

/** Bajo el nombre del negocio: su nivel o, si está suspendido, ese estado. */
export function EstadoCuenta({ revendedor: r }: { revendedor: RevendedorDetalle }) {
  if (r.estado === 'suspendido') return <PildoraEstado texto="Suspendido" tono="peligro" />;
  return <NivelChip nivel={r.nivel} />;
}

/** Sello «Revendedor» junto al logo de la cabecera. */
export function SelloRevendedor() {
  return (
    <span className="inline-flex items-center rounded-full border border-cian/40 bg-cian/[0.08] px-2.5 py-1 text-[0.68rem] font-bold tracking-[0.12em] whitespace-nowrap text-cian uppercase max-sm:px-1.5 max-sm:py-0.5 max-sm:text-[0.6rem] max-sm:tracking-[0.08em]">
      Revendedor
    </span>
  );
}

/**
 * Cabecera de cada pantalla: título, una línea de explicación y sus acciones
 * (en el teléfono, a todo el ancho y en dos columnas si son dos).
 */
export function CabeceraPanel({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3.5">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)] break-words">{titulo}</h1>
        {descripcion && <p className="max-w-[40rem] text-tinta-suave">{descripcion}</p>}
      </div>
      {accion && (
        <div className="grid w-full auto-cols-fr grid-flow-col gap-2.5 min-[43.75rem]:flex min-[43.75rem]:w-auto">
          {accion}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── cifras y cajas ───────────────────────── */

/** Cifra del panel: título, valor grande, detalle y, si hace falta, un enlace. */
export function Kpi({
  titulo,
  valor,
  detalle,
  accion,
  tono,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  accion?: ReactNode;
  /** `ok`: valor en verde (ganancia); `aviso`: borde y valor ámbar (saldo bajo). */
  tono?: 'ok' | 'aviso';
}) {
  return (
    <div
      className={clsx(
        'grid min-w-0 content-start gap-0.5 rounded-[1.125rem] border bg-[rgb(8_11_26/0.7)] px-4 py-3.5',
        tono === 'aviso' ? 'border-aviso/45' : 'border-borde-fuerte',
      )}
    >
      <span className="text-[0.78rem] font-semibold text-tinta-suave">{titulo}</span>
      <b
        className={clsx(
          'font-titulo text-[1.55rem] leading-tight font-extrabold [overflow-wrap:anywhere] tabular-nums',
          tono === 'ok' && 'text-[#4ade80]',
          tono === 'aviso' && 'text-aviso',
        )}
      >
        {valor}
      </b>
      {detalle && <small className="text-[0.78rem] text-tinta-tenue">{detalle}</small>}
      {accion && <div className="mt-1 justify-self-start">{accion}</div>}
    </div>
  );
}

/** Fila de cifras: dos columnas en el teléfono y cuatro (o dos) en pantallas anchas. */
export function Kpis({ children, dos }: { children: ReactNode; dos?: boolean }) {
  return (
    <div className={clsx('grid grid-cols-2 gap-3', !dos && 'min-[47.5rem]:grid-cols-4')}>
      {children}
    </div>
  );
}

/** Caja con cabecera (título, nota y una acción) y una tabla o gráfica dentro. */
export function Caja({
  id,
  titulo,
  nota,
  accion,
  children,
}: {
  id: string;
  titulo: string;
  nota?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-[1.25rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 px-4 pt-4 pb-2">
        <div className="grid gap-0.5">
          <h2 id={id} className="font-titulo text-[1.06rem] font-bold">
            {titulo}
          </h2>
          {nota && <p className="text-[0.82rem] text-tinta-tenue">{nota}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

/** Contenedor de una tabla suelta: borde redondeado y desplazamiento lateral si no cabe. */
export const claseTabla =
  'min-w-0 overflow-x-auto rounded-[1.125rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] max-[43.75rem]:overflow-visible';

/** Celda con la imagen del servicio, un título y un detalle debajo. */
export function CeldaPlan({
  servicio,
  titulo,
  detalle,
}: {
  servicio: { slug: string; categoria: CategoriaServicio | null; nombre: string };
  titulo: ReactNode;
  detalle?: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <MiniaturaServicio
        slug={servicio.slug}
        categoria={servicio.categoria}
        nombre={servicio.nombre}
        className="size-7 rounded-lg"
      />
      <span className="grid min-w-0">
        <b className="font-semibold">{titulo}</b>
        {detalle && <small>{detalle}</small>}
      </span>
    </span>
  );
}

/** Nota al pie de una pantalla. */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="text-xs text-tinta-tenue">{children}</p>;
}

/** Sin `dir`, la API ordena la cartera por totales y fechas de venta de mayor a menor. */
export const dirPorDefecto = (o: OrdenCartera) =>
  o === 'total' || o === 'ultima' || o === 'servicios' ? 'desc' : 'asc';

/* ───────────────────────── vencimientos ───────────────────────── */

export type TonoVence = 'am' | 'ro' | '';
export const claseVence = (t: TonoVence) =>
  t === 'am' ? 'text-aviso' : t === 'ro' ? 'text-peligro' : '';

/** Vencimiento corto para las tablas: «Mañana», «En 3 días», «Venció 2 oct. · gracia». */
export function venceCorto(s: SuscripcionPublica, ahora = Date.now()): [string, TonoVence] {
  if (!s.venceEn) return ['Sin fecha', ''];
  const d = diasHasta(s.venceEn, ahora);
  const f = fechaCorta(s.venceEn);
  if (s.estado === 'en_gracia') {
    return [
      d === 0 ? 'Venció hoy · gracia' : d === -1 ? 'Venció ayer · gracia' : `Venció ${f} · gracia`,
      'ro',
    ];
  }
  if (s.estado === 'vencida' || s.estado === 'suspendida') return [`Venció ${f}`, 'ro'];
  if (s.estado !== 'activa') return [f, ''];
  return [d <= 0 ? 'Hoy' : d === 1 ? 'Mañana' : d <= 7 ? `En ${d} días` : f, d <= 7 ? 'am' : ''];
}

/** Vencimiento largo para la ficha del cliente: «Vence el 10 de noviembre». */
export function venceLargo(s: SuscripcionPublica, ahora = Date.now()): [string, TonoVence] {
  if (s.estado === 'cancelada') return ['Cancelado', ''];
  if (s.estado === 'pausada') return ['Pausado por el equipo', ''];
  if (s.estado === 'pendiente_pago') return ['Pendiente de activación', ''];
  if (!s.venceEn) return ['Sin fecha de vencimiento', ''];
  const d = diasHasta(s.venceEn, ahora);
  const fecha = fechaLarga(s.venceEn);
  if (s.estado === 'en_gracia') {
    return [`Venció ${d === 0 ? 'hoy' : d === -1 ? 'ayer' : `el ${fecha}`} · en gracia`, 'ro'];
  }
  if (s.estado === 'vencida' || s.estado === 'suspendida') return [`Venció el ${fecha}`, 'ro'];
  if (s.cancelarAlVencer) return [`Termina el ${fecha} y no se renovará`, ''];
  const cuando = d <= 0 ? 'hoy' : d === 1 ? 'mañana' : d <= 7 ? `en ${d} días` : `el ${fecha}`;
  return [`Vence ${cuando}`, d <= 7 ? 'am' : ''];
}

/* ───────────────────────── avisos y estados ───────────────────────── */

/**
 * «Para revisar» del revendedor: cuenta suspendida, nivel por asignar,
 * recarga rechazada, recargas en revisión y saldo bajo. Con `soloEstado` solo
 * se muestran los de la cuenta (las demás pantallas).
 */
export function AvisosRevendedor({
  revendedor: r,
  ultimaRecarga = null,
  soloEstado = false,
}: {
  revendedor: RevendedorDetalle;
  ultimaRecarga?: RecargaPublica | null;
  soloEstado?: boolean;
}) {
  const avisos: ReactNode[] = [];
  const icono = (I: typeof X) => <I className="size-4" aria-hidden="true" />;
  if (r.estado === 'suspendido') {
    avisos.push(
      <Aviso
        key="suspendido"
        tono="peligro"
        icono={icono(X)}
        titulo="Tu cuenta de revendedor está suspendida"
      >
        {r.motivoEstado ? `Motivo: ${r.motivoEstado}. ` : ''}Puedes ver tus clientes y accesos, pero
        no vender, renovar ni recargar.
      </Aviso>,
    );
  } else if (r.estado === 'aprobado' && !r.nivel) {
    avisos.push(
      <Aviso key="nivel" tono="aviso" icono={icono(Star)} titulo="Nivel por asignar">
        El equipo te asigna tu nivel y ahí verás tus precios mayoristas.
      </Aviso>,
    );
  }
  if (!soloEstado) {
    if (ultimaRecarga?.estado === 'rechazada') {
      avisos.push(
        <Aviso
          key="rechazada"
          tono="peligro"
          icono={icono(X)}
          titulo={`Rechazamos tu recarga ${ultimaRecarga.referencia}`}
          accion={
            <Link href="/revendedor/saldo" className={claseEnlace}>
              Ver recarga
            </Link>
          }
        >
          {ultimaRecarga.motivoRechazo ?? 'Revisa los datos del pago y envíala de nuevo.'}
        </Aviso>,
      );
    }
    const n = r.recargasEnRevision;
    if (n > 0) {
      avisos.push(
        <Aviso
          key="revision"
          tono="cian"
          icono={icono(Clock)}
          titulo={n === 1 ? '1 recarga en revisión' : `${n} recargas en revisión`}
          accion={
            <Link href="/revendedor/saldo" className={claseEnlace}>
              Ver
            </Link>
          }
        >
          El saldo aparece cuando el equipo confirma el pago.
        </Aviso>,
      );
    }
    if (saldoBajo(r)) {
      avisos.push(
        <Aviso
          key="bajo"
          tono="aviso"
          icono={icono(Wallet)}
          titulo={`Saldo bajo: ${usd(r.saldoUsd)}`}
          accion={
            <BotonEnlace href="/revendedor/saldo" tamano="sm">
              Recargar
            </BotonEnlace>
          }
        >
          Recarga para no quedarte sin poder renovar a tus clientes.
        </Aviso>,
      );
    }
  }
  if (avisos.length === 0) return null;
  return (
    <section aria-label="Para revisar" className="grid gap-2">
      {avisos}
    </section>
  );
}

/** Saldo bajo: menos de 5 USD con la cuenta en uso (no recién aprobada ni suspendida). */
export const saldoBajo = (r: RevendedorDetalle) =>
  r.estado === 'aprobado' && r.compras > 0 && Number(r.saldoUsd) < SALDO_BAJO_USD;

/** Los tres pasos para empezar (revendedor recién aprobado, sin ventas). */
export function PasosInicio() {
  const pasos = [
    ['Recarga tu saldo', 'Paga con uno de los métodos de NV y envía el comprobante.'],
    [
      'Vende a tu cliente',
      'Elige el plan en Nueva venta y lo pagas con tu saldo, al precio de tu nivel.',
    ],
    [
      'Entrégale su acceso',
      'El código o enlace aparece en Accesos de clientes. Tú le cobras y le avisas.',
    ],
  ];
  return (
    <section aria-labelledby="titulo-pasos" className="grid gap-3">
      <h2 id="titulo-pasos" className="text-[clamp(1.2rem,2.4vw,1.45rem)]">
        Empieza en 3 pasos
      </h2>
      <ol className="grid gap-2.5 min-[47.5rem]:grid-cols-3">
        {pasos.map(([t, d], i) => (
          <li
            key={t}
            className="flex items-start gap-3 rounded-[1.125rem] border border-borde bg-[rgb(10_14_32/0.5)] p-3.5"
          >
            <em
              className="grid size-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)] font-titulo text-[0.8rem] font-extrabold text-white not-italic"
              aria-hidden="true"
            >
              {i + 1}
            </em>
            <div className="grid gap-0.5">
              <b className="text-sm">{t}</b>
              <span className="text-[0.82rem] text-tinta-suave">{d}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Barra de ventas de hoy frente al límite diario. */
export function LimiteDiario({ hoy, limite }: { hoy: number; limite: number | null }) {
  if (limite === null) {
    return (
      <p className="text-[0.8rem] text-tinta-suave">Ventas de hoy: {hoy} · sin límite diario</p>
    );
  }
  const pct = Math.min(100, Math.round((hoy / limite) * 100));
  return (
    <div className="grid gap-1.5">
      <div
        role="progressbar"
        aria-label="Ventas de hoy"
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={hoy}
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
      >
        <i
          className={clsx(
            'block h-full rounded-full',
            pct >= 80
              ? 'bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]'
              : 'bg-[linear-gradient(90deg,#22d3ee,#4f8dff)]',
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-[0.78rem] text-tinta-suave">
        <span>
          Ventas de hoy: {hoy} de {limite}
        </span>
        <span>Se reinicia a medianoche</span>
      </div>
    </div>
  );
}

/** La cuenta tiene el rol pero no su ficha, o la API no respondió. */
export function SinResumen({ estado }: { estado: number }) {
  return estado === 404 ? (
    <Aviso
      tono="aviso"
      icono={<Star className="size-4" aria-hidden="true" />}
      titulo="Tu cuenta de revendedor no está configurada"
    >
      Escribe al equipo de NV para que la revise.
    </Aviso>
  ) : (
    <Aviso
      tono="peligro"
      icono={<X className="size-4" aria-hidden="true" />}
      titulo="No pudimos cargar tu panel"
    >
      Recarga la página en unos segundos.
    </Aviso>
  );
}
