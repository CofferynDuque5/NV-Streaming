import {
  aspectoServicio,
  type BilleteraPublica,
  type EstadoFactura,
  type EstadoPago,
  type FacturaDetalle,
  formatearMonto,
  type MetodoCobroPublico,
  type Moneda,
  type OpcionesPagoEnLinea,
  type PagoPublico,
  type PedidoPublico,
  type PlanDeFactura,
} from '@nv/shared';
import clsx from 'clsx';
import { ArrowLeft, Check, Clock, Eye, FileText, ReceiptText, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArteServicio } from '@/componentes/tienda/arte';
import { PasosCompra } from '@/componentes/tienda/pasos-compra';
import { clasesBoton } from '@/componentes/ui/boton';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import {
  ActualizarImporte,
  BloquePago,
  CancelarPedido,
  ElegirPago,
  PagarPedidoConSaldo,
} from './pago';

/** Datos que la página de pago ya leyó de la API. */
export interface DatosPago {
  factura: FacturaDetalle;
  pedido: PedidoPublico | null;
  /** null: la billetera no está disponible (cuenta gestionada) o no se pudo leer. */
  billetera: BilleteraPublica | null;
  /** Solo si la factura se puede pagar ahora. */
  manuales: MetodoCobroPublico[];
  enLinea: OpcionesPagoEnLinea | null;
  monedas: readonly Moneda[];
  maxMb: number;
  /** Desde qué página se mira: cambia a dónde lleva el selector de facturas. */
  desde: 'pedido' | 'factura';
  /** Hora de la lectura, para el plazo que queda. */
  ahora: number;
}

type Tono = 'aviso' | 'cian' | 'exito' | 'peligro' | 'neutro';

const TONOS: Record<Tono, string> = {
  aviso: 'border-aviso/40 text-aviso',
  cian: 'border-cian/40 text-cian',
  exito: 'border-exito/40 text-exito',
  peligro: 'border-peligro/45 text-peligro',
  neutro: 'border-borde-fuerte text-tinta-suave',
};

/** Estado de una factura tal como lo ve quien paga. */
function estadoVisible(
  estado: EstadoFactura,
  vencida: boolean,
  ultimoPago: EstadoPago | null,
): [string, Tono] {
  if (estado === 'pagada') return ['Pagada', 'exito'];
  if (estado === 'anulada') return ['Anulada', 'neutro'];
  if (ultimoPago === 'en_revision') return ['En revisión', 'cian'];
  if (ultimoPago === 'rechazado') return ['Rechazado', 'peligro'];
  if (vencida) return ['Vencida', 'peligro'];
  return ['Por pagar', 'aviso'];
}

const ESTADO_PAGO_VISIBLE: Record<EstadoPago, [string, Tono]> = {
  en_revision: ['En revisión', 'cian'],
  confirmado: ['Confirmado', 'exito'],
  rechazado: ['Rechazado', 'peligro'],
  reembolsado: ['Devuelto', 'neutro'],
};

function Estado({ texto, tono }: { texto: string; tono: Tono }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 justify-self-start rounded-full border px-2 py-0.5 text-[0.64rem] font-bold tracking-[0.06em] whitespace-nowrap uppercase before:size-1.5 before:rounded-full before:bg-current',
        TONOS[tono],
      )}
    >
      {texto}
    </span>
  );
}

const Titulillo = ({ children }: { children: ReactNode }) => (
  <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
    {children}
  </span>
);

function nombreDe(plan: PlanDeFactura | null, respaldo: string) {
  return plan ? plan.servicio.nombre : respaldo;
}

function Arte({ plan, alto = 'h-14' }: { plan: PlanDeFactura | null; alto?: string }) {
  if (!plan) {
    return (
      <span className="grid size-12 place-items-center rounded-xl bg-hundida" aria-hidden="true">
        <ReceiptText className="size-5 text-tinta-suave" />
      </span>
    );
  }
  const { servicio } = plan;
  const aspecto = aspectoServicio(servicio.slug, servicio.categoria);
  return (
    <ArteServicio
      arte={aspecto.arte}
      nombre={servicio.nombre}
      categoria={servicio.categoria}
      color={aspecto.color}
      orbe="sm"
      className={clsx(alto, 'w-auto drop-shadow-[0_6px_10px_rgb(0_0_0/0.6)]')}
    />
  );
}

function plazo(venceEn: string, ahora: number) {
  const falta = new Date(venceEn).getTime() - ahora;
  const d = Math.floor(falta / 86_400_000);
  const h = Math.floor((falta % 86_400_000) / 3_600_000);
  if (d <= 0 && h <= 0) return 'queda menos de 1 h';
  return d > 0 ? `quedan ${d} d ${h} h` : `quedan ${h} h`;
}

/* ──────────────────────────── resumen lateral ──────────────────────────── */

function Historial({ pagos }: { pagos: PagoPublico[] }) {
  return (
    <div className="grid gap-2">
      <Titulillo>Pagos enviados</Titulillo>
      {pagos.length === 0 ? (
        <p className="text-xs text-tinta-tenue">Todavía no has enviado pagos para esta factura.</p>
      ) : (
        <ul className="grid gap-2">
          {pagos.map((p) => {
            const [texto, tono] = ESTADO_PAGO_VISIBLE[p.estado];
            const via =
              p.origen === 'pasarela'
                ? `Pago en línea (${nombrePasarela(p.pasarela)})`
                : p.origen === 'billetera'
                  ? 'Saldo NV'
                  : p.metodo.nombre;
            return (
              <li
                key={p.id}
                className="grid gap-1 rounded-xl border border-borde bg-hundida/50 px-3 py-2.5 text-[0.8rem]"
              >
                <span className="flex items-center justify-between gap-2">
                  <b className="truncate font-semibold tabular-nums">
                    {formatearMonto(p.montoRecibido ?? p.montoDeclarado, p.moneda)} · {via}
                  </b>
                  <Estado texto={texto} tono={tono} />
                </span>
                <span className="text-tinta-suave">
                  {formatearFecha(p.fechaPago)} · código {p.referencia}
                  {p.referenciaExterna ? ` · ref. ${p.referenciaExterna}` : ''}
                </span>
                {p.montoReembolsado && Number(p.montoReembolsado) > 0 && (
                  <span className="text-tinta-suave">
                    Te devolvimos {formatearMonto(p.montoReembolsado, p.moneda)}.
                  </span>
                )}
                {p.estado === 'rechazado' && p.motivoRechazo && (
                  <span className="text-peligro">Motivo: {p.motivoRechazo}</span>
                )}
                {p.tieneComprobante && (
                  <a
                    href={`/api/v1/mi/pagos/${p.id}/comprobante`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 justify-self-start font-medium text-cian hover:underline"
                  >
                    <FileText className="size-3.5" aria-hidden="true" /> Ver comprobante
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Resumen({ datos, ahora }: { datos: DatosPago; ahora: number }) {
  const { factura: f, pedido } = datos;
  return (
    <aside
      aria-label="Resumen de la factura"
      className="grid gap-4 rounded-3xl border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(8_11_26/0.96))] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] lg:sticky lg:top-24"
    >
      <div className="grid gap-2.5">
        <div className="flex items-center gap-3">
          <Arte plan={f.plan} />
          <span className="grid min-w-0">
            <span className="text-xs text-tinta-suave">Factura {f.numero}</span>
            <b className="truncate">{nombreDe(f.plan, f.lineas[0]?.descripcion ?? '')}</b>
            <span className="text-xs text-tinta-suave">
              {f.plan ? `${f.plan.nombre} · ` : ''}
              {f.concepto === 'alta' ? 'alta de servicio' : 'renovación'}
            </span>
          </span>
        </div>
        {f.estado === 'emitida' && (
          <p
            className={clsx(
              'flex items-center gap-2 text-[0.8rem] text-tinta-suave',
              f.vencida && 'text-peligro',
            )}
          >
            <Clock
              className={clsx('size-4 shrink-0', f.vencida ? 'text-peligro' : 'text-aviso')}
              aria-hidden="true"
            />
            {f.vencida ? (
              <span>
                Venció el <b>{formatearFecha(f.venceEn)}</b>
              </span>
            ) : (
              <span>
                Págala antes del <b className="text-tinta">{formatearFecha(f.venceEn)}</b> ·{' '}
                {plazo(f.venceEn, ahora)}
              </span>
            )}
          </p>
        )}
        {f.estado === 'pagada' && f.pagadaEn && (
          <p className="flex items-center gap-2 text-[0.8rem] text-exito">
            <Check className="size-4 shrink-0" aria-hidden="true" /> Pagada el{' '}
            {formatearFecha(f.pagadaEn)}
          </p>
        )}
      </div>

      <dl className="grid gap-2 border-t border-borde pt-3 text-sm tabular-nums">
        <div className="flex justify-between gap-3 text-tinta-suave">
          <dt>Subtotal</dt>
          <dd>{formatearMonto(f.subtotal, f.moneda)}</dd>
        </div>
        {Number(f.descuento) > 0 && (
          <div className="flex justify-between gap-3 text-exito">
            <dt>{f.cupon ? `Cupón ${f.cupon}` : 'Descuento'}</dt>
            <dd>−{formatearMonto(f.descuento, f.moneda)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold">Total</dt>
          <dd className="font-titulo text-[1.65rem] font-extrabold">
            {formatearMonto(f.total, f.moneda)}
          </dd>
        </div>
        {f.moneda !== 'USD' && (
          <p className="text-right text-xs text-tinta-tenue">
            Tasa: 1 USD = {formatearMonto(f.tasa, f.moneda)} · equivale a{' '}
            {formatearMonto(f.totalUsd, 'USD')}
          </p>
        )}
      </dl>

      {pedido && (
        <div className="grid gap-1.5 text-[0.8rem]">
          <Titulillo>Pedido {pedido.numero}</Titulillo>
          <ul className="grid gap-1.5">
            {pedido.facturas.map((x) => {
              const [texto, tono] = estadoVisible(x.estado, x.vencida, x.ultimoPago);
              return (
                <li key={x.id} className="flex items-center justify-between gap-2 text-tinta-suave">
                  <span className="truncate">{nombreDe(x.plan, x.descripcion)}</span>
                  <Estado texto={texto} tono={tono} />
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between gap-2 border-t border-borde pt-2 font-semibold">
            <span>Por pagar</span>
            <span className="tabular-nums">{formatearMonto(pedido.pendienteUsd, 'USD')}</span>
          </div>
          {pedido.estado === 'pendiente' && (
            <CancelarPedido pedidoId={pedido.id} numero={pedido.numero} />
          )}
        </div>
      )}

      <Historial pagos={f.pagos} />
    </aside>
  );
}

/* ─────────────────────────────── bloques ─────────────────────────────── */

function Selector({ datos }: { datos: DatosPago }) {
  const { pedido, factura } = datos;
  if (!pedido || pedido.facturas.length < 2) return null;
  return (
    <nav aria-label="Facturas del pedido" className="grid gap-2">
      <Titulillo>Elige la factura que vas a pagar</Titulillo>
      <ul className="-mx-1 grid snap-x snap-mandatory auto-cols-[minmax(14rem,78%)] grid-flow-col gap-2.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible">
        {pedido.facturas.map((x) => {
          const [texto, tono] = estadoVisible(x.estado, x.vencida, x.ultimoPago);
          const actual = x.id === factura.id;
          const color = x.plan
            ? aspectoServicio(x.plan.servicio.slug, x.plan.servicio.categoria).color
            : '#5b98ff';
          return (
            <li key={x.id} className="snap-start">
              <Link
                href={enlaceFactura(datos, x.id)}
                scroll={false}
                aria-current={actual ? 'true' : undefined}
                style={{ '--c': color } as CSSProperties}
                className={clsx(
                  'grid h-full grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-[1.125rem] border px-3 py-2.5 transition-colors',
                  actual
                    ? 'border-marca bg-marca-suave shadow-[inset_0_0_0_1px_var(--nv-marca)]'
                    : 'border-borde bg-hundida/55 hover:border-borde-fuerte',
                )}
              >
                <span className="grid place-items-center">
                  <Arte plan={x.plan} />
                </span>
                <span className="grid min-w-0 gap-1">
                  <b className="truncate text-[0.85rem] font-semibold">
                    {nombreDe(x.plan, x.descripcion)}
                  </b>
                  <small className="truncate text-xs text-tinta-suave tabular-nums">
                    {x.plan ? `${x.plan.nombre} · ` : ''}
                    {formatearMonto(x.total, x.moneda)}
                  </small>
                  <Estado texto={texto} tono={tono} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Dirección de una factura en la página desde la que se mira. */
function enlaceFactura(datos: DatosPago, id: string) {
  return datos.desde === 'pedido' && datos.pedido
    ? `/cuenta/carrito/${datos.pedido.id}?factura=${id}`
    : `/cuenta/facturas/${id}`;
}

/** La siguiente factura del pedido que se puede pagar ahora. */
function siguiente(datos: DatosPago) {
  const { pedido, factura } = datos;
  return (
    pedido?.facturas.find(
      (x) => x.id !== factura.id && x.estado === 'emitida' && x.ultimoPago !== 'en_revision',
    ) ?? null
  );
}

function PagarSiguiente({ datos }: { datos: DatosPago }) {
  const sig = siguiente(datos);
  if (!sig || !datos.pedido) return null;
  return (
    <div className="grid gap-2">
      <Link
        href={enlaceFactura(datos, sig.id)}
        scroll={false}
        className={clsx(clasesBoton('primario', 'lg', 'w-full'))}
      >
        Pagar {nombreDe(sig.plan, sig.descripcion)}
      </Link>
      <p className="text-center text-xs text-tinta-tenue">
        Es la siguiente factura por pagar de este pedido.
      </p>
    </div>
  );
}

function EnRevision({ datos }: { datos: DatosPago }) {
  const p = datos.factura.pagos.find((x) => x.estado === 'en_revision');
  const via = p ? (p.origen === 'manual' || !p.origen ? p.metodo.nombre : 'Pago en línea') : '';
  return (
    <section
      aria-labelledby="titulo-revision"
      aria-live="polite"
      className="grid gap-4 rounded-3xl border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5 sm:p-5.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-revision" className="text-[1.15rem]">
          Recibimos tu comprobante
        </h2>
        {p && (
          <span
            aria-label={`Código del pago ${p.referencia}`}
            className="rounded-[0.625rem] border border-dashed border-borde-fuerte bg-hundida px-3 py-1.5 font-titulo text-[0.95rem] font-bold tracking-[0.06em]"
          >
            {p.referencia}
          </span>
        )}
      </div>
      <p className="text-sm text-tinta-suave">
        Guarda este código por si necesitas escribirnos. Te avisamos por correo apenas lo revisemos.
      </p>
      <ol className="grid" aria-label="Estado del pago">
        {[
          {
            estado: 'hecho',
            titulo: 'Comprobante enviado',
            texto: p
              ? `${via} · ${formatearMonto(p.montoDeclarado, p.moneda)} · ${formatearFechaHora(p.creadoEn)}`
              : '',
          },
          {
            estado: 'ahora',
            titulo: 'El equipo lo está revisando',
            texto: 'Compara el monto y la referencia con lo recibido',
          },
          {
            estado: 'luego',
            titulo: 'Factura pagada',
            texto: 'Tu plan se activa y lo ves en Mis servicios',
          },
        ].map((paso, i) => (
          <li
            key={paso.titulo}
            aria-current={paso.estado === 'ahora' ? 'step' : undefined}
            className={clsx(
              'relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0',
              i < 2 &&
                'before:absolute before:top-7 before:bottom-0.5 before:left-[13px] before:w-0.5 before:bg-borde-fuerte',
            )}
          >
            <em
              className={clsx(
                'relative grid size-7 place-items-center rounded-full border-[1.5px] not-italic',
                paso.estado === 'hecho' && 'border-exito bg-exito text-fondo',
                paso.estado === 'ahora' &&
                  'border-cian bg-fondo text-cian shadow-[0_0_16px_-4px_var(--nv-cian)]',
                paso.estado === 'luego' && 'border-borde-fuerte bg-fondo text-tinta-tenue',
              )}
            >
              {paso.estado === 'ahora' ? (
                <Eye className="size-3.5" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
            </em>
            <span className="grid gap-0.5">
              <b className="text-[0.92rem]">{paso.titulo}</b>
              <span className="text-[0.8rem] text-tinta-suave">{paso.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      {siguiente(datos) ? (
        <PagarSiguiente datos={datos} />
      ) : (
        <Link href="/cuenta" className={clasesBoton('secundario', 'lg', 'w-full')}>
          Ir a mis servicios
        </Link>
      )}
    </section>
  );
}

function Aviso({
  tono,
  titulo,
  children,
}: {
  tono: 'exito' | 'peligro' | 'aviso' | 'marca';
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={clsx(
        'grid gap-1.5 rounded-[1.25rem] border px-4.5 py-4 text-sm',
        tono === 'exito' && 'border-exito/40 bg-exito-suave',
        tono === 'peligro' && 'border-peligro/40 bg-peligro-suave',
        tono === 'aviso' && 'border-aviso/40 bg-aviso-suave',
        tono === 'marca' && 'border-marca/30 bg-marca-suave',
      )}
    >
      <b className="flex items-center gap-2 text-[0.95rem] text-tinta">
        {tono === 'exito' && <Check className="size-4 text-exito" aria-hidden="true" />}
        {titulo}
      </b>
      {children && <div className="text-tinta-suave">{children}</div>}
    </div>
  );
}

function Listo({ datos }: { datos: DatosPago }) {
  const { pedido, factura } = datos;
  const n = pedido?.facturas.filter((x) => x.estado === 'pagada').length ?? 1;
  return (
    <section
      aria-labelledby="titulo-listo"
      className="grid justify-items-center gap-3 rounded-3xl border border-exito/35 bg-[radial-gradient(70%_90%_at_50%_0%,rgb(34_197_94/0.14),transparent_70%),rgb(8_11_26/0.85)] px-5 py-9 text-center"
    >
      <span
        className="grid size-14 place-items-center rounded-full border border-exito/50 bg-exito/15 text-exito shadow-[0_0_30px_-8px_var(--nv-exito)]"
        aria-hidden="true"
      >
        <Check className="size-7" />
      </span>
      <h2 id="titulo-listo" className="text-[1.5rem]">
        {pedido ? `¡Pedido ${pedido.numero} pagado!` : `¡Factura ${factura.numero} pagada!`}
      </h2>
      <p className="max-w-md text-tinta-suave">
        {n === 1 ? 'Tu plan ya está activo.' : `Tus ${n} planes ya están activos.`} Los encuentras
        en Mis servicios y sus accesos en Mis accesos.
      </p>
      <Link href="/cuenta" className={clasesBoton('primario', 'lg', 'mt-1')}>
        Ir a mis servicios
      </Link>
    </section>
  );
}

/* ─────────────────────────────── página ─────────────────────────────── */

/** Página «Paga tu pedido» (o tu factura): selector, moneda, método y resumen. */
export function VistaPago({ datos }: { datos: DatosPago }) {
  const { factura: f, pedido, billetera } = datos;
  const saldo = billetera?.saldoUsd ?? null;
  const anulado = pedido ? pedido.estado === 'anulado' : f.estado === 'anulada';
  const pagado = pedido ? pedido.estado === 'pagado' : f.estado === 'pagada';
  const nombre = nombreDe(f.plan, f.lineas[0]?.descripcion ?? `Factura ${f.numero}`);
  const n = pedido?.facturas.length ?? 1;

  const subtitulo = pedido
    ? anulado
      ? `Pedido ${pedido.numero} cancelado.`
      : pagado
        ? `Pedido ${pedido.numero} pagado.`
        : `Pedido ${pedido.numero} · ${n === 1 ? '1 plan' : `${n} planes, una factura por cada uno`}. Paga ${n === 1 ? 'con' : 'cada una con'} el método que prefieras.`
    : `Factura ${f.numero} · ${f.concepto === 'alta' ? 'Alta' : 'Renovación'} de ${nombre}.`;

  const pendientes = pedido?.facturas.filter((x) => x.estado === 'emitida') ?? [];
  const puedeTodo =
    pedido?.estado === 'pendiente' &&
    saldo !== null &&
    pendientes.length > 1 &&
    pendientes.every((x) => x.ultimoPago !== 'en_revision') &&
    Number(saldo) >= Number(pedido.pendienteUsd);
  const rechazado = f.pagos[0]?.estado === 'rechazado' ? f.pagos[0] : null;

  let cuerpo: ReactNode;
  if (anulado) {
    cuerpo = pedido ? (
      <Aviso tono="aviso" titulo="Pedido cancelado">
        <p>Este pedido se canceló y sus facturas quedaron anuladas.</p>
        <Link href="/carrito" className={clasesBoton('secundario', 'md', 'mt-2')}>
          Ir al carrito
        </Link>
      </Aviso>
    ) : (
      <Aviso tono="aviso" titulo="Factura anulada">
        {f.motivoAnulacion ?? 'Esta factura ya no es válida.'} No hace falta que la pagues.
      </Aviso>
    );
  } else if (pagado) {
    cuerpo = <Listo datos={datos} />;
  } else if (f.estado === 'pagada') {
    cuerpo = (
      <section className="grid gap-4 rounded-3xl border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5 sm:p-5.5">
        <Aviso tono="exito" titulo="Factura pagada">
          {nombre} ya está activo. Lo encuentras en Mis servicios.
        </Aviso>
        <PagarSiguiente datos={datos} />
      </section>
    );
  } else if (f.estado === 'anulada') {
    cuerpo = (
      <section className="grid gap-4">
        <Aviso tono="aviso" titulo="Factura anulada">
          {f.motivoAnulacion ?? 'Esta factura ya no es válida.'} No hace falta que la pagues.
        </Aviso>
        <PagarSiguiente datos={datos} />
      </section>
    );
  } else if (f.pagoEnRevision) {
    cuerpo = <EnRevision datos={datos} />;
  } else if (f.vencida && f.plan) {
    cuerpo = (
      <BloquePago titulo="El plazo de esta factura venció">
        <p className="text-sm text-tinta-suave">
          Venció el {formatearFecha(f.venceEn)}. Aún puedes pagarla: antes actualizamos el importe
          con la tasa de hoy para que pagues el monto correcto, y te damos un plazo nuevo.
        </p>
        <ActualizarImporte facturaId={f.id} moneda={f.moneda} volver={enlaceFactura(datos, f.id)} />
      </BloquePago>
    );
  } else {
    cuerpo = (
      <>
        {rechazado && (
          <Aviso tono="peligro" titulo="Rechazamos tu comprobante anterior">
            {rechazado.motivoRechazo ? `Motivo: ${rechazado.motivoRechazo} ` : ''}Revisa el motivo y
            envía uno nuevo, o paga con otro método.
          </Aviso>
        )}
        <ElegirPago
          key={`${f.moneda}-${f.total}`}
          factura={{
            id: f.id,
            numero: f.numero,
            moneda: f.moneda,
            total: f.total,
            totalUsd: f.totalUsd,
            nombre: f.plan ? `${nombre} · ${f.plan.nombre}` : nombre,
          }}
          monedas={f.plan ? datos.monedas : null}
          saldoUsd={saldo}
          enLinea={datos.enLinea}
          manuales={datos.manuales}
          maxMb={datos.maxMb}
          volver={enlaceFactura(datos, f.id)}
        />
      </>
    );
  }

  return (
    <>
      <Link
        href={pedido ? '/cuenta/carrito' : '/cuenta/facturas'}
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />{' '}
        {pedido ? 'Carrito y pedidos' : 'Facturas y pagos'}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-[clamp(1.9rem,4.5vw,2.9rem)]">
            Paga tu <span className="texto-degradado">{pedido ? 'pedido' : 'factura'}</span>
          </h1>
          <p className="text-tinta-suave">{subtitulo}</p>
        </div>
        {pedido && !anulado && <PasosCompra actual={pagado ? 3 : 2} />}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {!anulado && !pagado && pedido?.pagarAlRecargar && (
            <Aviso tono="marca" titulo="Esperando tu recarga">
              <p>
                Cuando confirmemos tu recarga, pagamos este pedido con ese saldo. También puedes
                pagar cada factura aquí.
              </p>
              <Link
                href={`/cuenta/billetera?pedido=${pedido.id}`}
                className={clasesBoton('secundario', 'sm', 'mt-2')}
              >
                <Wallet className="size-4" aria-hidden="true" /> Reportar mi recarga
              </Link>
            </Aviso>
          )}
          {puedeTodo && pedido && saldo !== null && (
            <PagarPedidoConSaldo
              pedidoId={pedido.id}
              pendientes={pendientes.length}
              pendienteUsd={pedido.pendienteUsd}
              saldoUsd={saldo}
            />
          )}
          {!anulado && !pagado && <Selector datos={datos} />}
          {cuerpo}
        </div>
        <Resumen datos={datos} ahora={datos.ahora} />
      </div>
    </>
  );
}
