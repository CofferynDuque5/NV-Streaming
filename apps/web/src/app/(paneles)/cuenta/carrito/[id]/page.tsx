import {
  aspectoServicio,
  type BilleteraPublica,
  type FacturaDePedido,
  formatearMonto,
  INFO_CATEGORIA,
  type PedidoPublico,
} from '@nv/shared';
import { ArrowLeft, Check, ReceiptText, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { AccionesPedido } from '@/componentes/cliente/pedido';
import { ArteServicio } from '@/componentes/tienda/arte';
import { PasosCompra } from '@/componentes/tienda/pasos-compra';
import { Alerta } from '@/componentes/ui/alerta';
import { clasesBoton } from '@/componentes/ui/boton';
import { EstadoFacturaInsignia, EstadoPedidoInsignia } from '@/componentes/ui/estado';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pedido' };

/** Una factura del pedido, con la imagen de su servicio (como las líneas del carrito). */
function LineaFactura({ f }: { f: FacturaDePedido }) {
  const servicio = f.plan?.servicio ?? null;
  const aspecto = servicio ? aspectoServicio(servicio.slug, servicio.categoria) : null;
  const categoria = servicio?.categoria ? INFO_CATEGORIA[servicio.categoria] : null;
  const color = aspecto?.color ?? '#5b98ff';
  return (
    <li>
      <Link
        href={`/cuenta/facturas/${f.id}`}
        className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-[1.25rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.86),rgb(8_11_26/0.94))] p-3 transition-colors hover:border-borde-fuerte sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-3.5"
        style={{ '--c': color } as CSSProperties}
      >
        <span
          className="grid min-h-20 place-items-center overflow-hidden rounded-[0.875rem] bg-[radial-gradient(60%_60%_at_50%_55%,color-mix(in_srgb,var(--c)_45%,transparent),transparent_75%),rgb(3_5_14/0.5)]"
          aria-hidden="true"
        >
          {servicio && aspecto ? (
            <ArteServicio
              arte={aspecto.arte}
              nombre={servicio.nombre}
              categoria={servicio.categoria}
              color={color}
              orbe="md"
              className="h-16 w-auto"
            />
          ) : (
            <ReceiptText className="size-6 text-tinta-suave" />
          )}
        </span>
        <span className="grid min-w-0 content-center gap-1.5">
          <span className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <span className="grid min-w-0">
              {categoria && (
                <span className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-[0.1em] text-tinta-suave uppercase">
                  <i
                    className="size-1.5 rounded-full bg-[var(--c)] shadow-[0_0_8px_var(--c)]"
                    aria-hidden="true"
                  />
                  {categoria.nombre}
                </span>
              )}
              <span className="font-semibold sm:truncate">
                {servicio ? `${servicio.nombre} · ${f.plan?.nombre}` : f.descripcion}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-baseline gap-x-2 tabular-nums sm:grid sm:justify-items-end">
              <strong className="font-titulo text-[1.05rem] whitespace-nowrap">
                {formatearMonto(f.total, f.moneda)}
              </strong>
              {f.moneda !== 'USD' && (
                <small className="text-xs text-tinta-suave">
                  {formatearMonto(f.totalUsd, 'USD')}
                </small>
              )}
            </span>
          </span>
          <span className="flex flex-wrap items-center justify-between gap-2 text-[0.8rem] text-tinta-suave">
            <span>Factura {f.numero}</span>
            <EstadoFacturaInsignia estado={f.estado} />
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion({ roles: ['cliente'] });
  const { id } = await params;
  const [{ estado, datos: p }, { datos: billetera }] = await Promise.all([
    leerApi<PedidoPublico>(`/mi/pedidos/${id}`),
    leerApi<BilleteraPublica>('/mi/billetera'),
  ]);
  if (estado === 404 || estado === 400) notFound();
  if (!p) {
    return <Alerta tono="peligro">No pudimos cargar el pedido. Recarga la página.</Alerta>;
  }
  const n = p.facturas.length;

  return (
    <>
      <Link
        href="/cuenta/carrito"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Carrito y pedidos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[clamp(1.75rem,4vw,2.5rem)]">
              Pedido <span className="texto-degradado">{p.numero}</span>
            </h1>
            <EstadoPedidoInsignia estado={p.estado} />
          </div>
          <p className="text-tinta-suave">
            Hecho el {formatearFecha(p.creadoEn)} · {n} {n === 1 ? 'plan' : 'planes'}
          </p>
        </div>
        {p.estado !== 'anulado' && <PasosCompra actual={p.estado === 'pagado' ? 3 : 2} />}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="facturas-pedido" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="facturas-pedido" className="text-lg">
              Facturas del pedido
            </h2>
            <span className="text-sm text-tinta-suave">Una por cada plan</span>
          </div>
          <ul className="grid gap-3">
            {p.facturas.map((f) => (
              <LineaFactura key={f.id} f={f} />
            ))}
          </ul>
        </section>

        <aside
          aria-labelledby="resumen-pedido"
          className="grid gap-4 rounded-3xl border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(8_11_26/0.96))] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] lg:sticky lg:top-24"
        >
          <h2 id="resumen-pedido" className="text-xl">
            Resumen
          </h2>
          <dl className="grid gap-2 text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold">Total</dt>
              <dd className="font-titulo text-[1.65rem] font-extrabold">
                {formatearMonto(p.total, p.moneda)}
              </dd>
            </div>
            {p.moneda !== 'USD' && (
              <div className="flex justify-end text-xs text-tinta-tenue">
                <dd>Equivale a {formatearMonto(p.totalUsd, 'USD')}</dd>
              </div>
            )}
            {p.estado === 'pendiente' && (
              <div className="flex justify-between gap-3 border-t border-borde pt-2.5 text-tinta-suave">
                <dt>Por pagar</dt>
                <dd className="font-semibold text-aviso">
                  {formatearMonto(p.pendienteUsd, 'USD')}
                </dd>
              </div>
            )}
            {p.estado === 'pendiente' && billetera && (
              <div className="flex items-center justify-between gap-3 text-tinta-suave">
                <dt className="flex items-center gap-2">
                  <Wallet className="size-4 text-violeta" aria-hidden="true" /> Tu saldo
                </dt>
                <dd className="text-tinta">{formatearMonto(billetera.saldoUsd, 'USD')}</dd>
              </div>
            )}
          </dl>

          {p.estado === 'pendiente' && p.pagarAlRecargar && (
            <p className="rounded-xl border border-marca/25 bg-marca-suave px-3.5 py-2.5 text-sm text-tinta-suave">
              <b className="block text-tinta">Esperando tu recarga</b>
              Cuando confirmemos tu recarga, pagamos este pedido con ese saldo.
            </p>
          )}
          {p.estado === 'pendiente' && billetera && (
            <AccionesPedido pedido={p} saldoUsd={billetera.saldoUsd} />
          )}
          {p.estado === 'pendiente' && !billetera && (
            <Alerta tono="peligro">No pudimos leer tu saldo. Recarga la página.</Alerta>
          )}
          {p.estado === 'pagado' && (
            <>
              <p
                role="status"
                className="flex gap-2.5 rounded-xl border border-exito/35 bg-exito-suave px-3.5 py-3 text-sm text-tinta-suave"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
                <span>
                  <b className="block text-tinta">Pedido pagado</b>
                  Tus servicios ya están activos. Encuéntralos en Mis servicios y Mis accesos.
                </span>
              </p>
              <Link href="/cuenta" className={clasesBoton('primario', 'lg', 'w-full')}>
                Ir a mis servicios
              </Link>
            </>
          )}
          {p.estado === 'anulado' && (
            <>
              <p role="status" className="text-sm text-tinta-suave">
                Este pedido se canceló y sus facturas quedaron anuladas.
              </p>
              <Link href="/carrito" className={clasesBoton('secundario', 'lg', 'w-full')}>
                Ir al carrito
              </Link>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
