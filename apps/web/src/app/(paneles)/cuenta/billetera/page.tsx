import {
  type BilleteraPublica,
  type CatalogoPublico,
  formatearMonto,
  type MetodoCobroPublico,
  type Moneda,
  type MovimientoBilleteraPublico,
  type Pagina,
  paginacionSchema,
  type PedidoPublico,
  type RecargaBilleteraPublica,
} from '@nv/shared';
import clsx from 'clsx';
import { FileText, ReceiptText, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Paginacion } from '@/componentes/panel/paginacion';
import { FormularioRecarga } from '@/componentes/revendedor/formularios';
import { EstadoRecargaInsignia } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { TIPO_MOVIMIENTO_BILLETERA } from '@/lib/estados';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { montoConSigno } from '@/lib/revendedores';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mi billetera' };

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);
type Crudo = Record<string, string | string[] | undefined>;

export default async function Billetera({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['cliente'] });
  const crudo = await searchParams;
  const { consulta } = leerFiltro(paginacionSchema, crudo, { porPagina: 20 });
  const [{ estado, datos: billetera }, { datos: recargas }, { datos: libro }, metodos, catalogo] =
    await Promise.all([
      leerApi<BilleteraPublica>('/mi/billetera'),
      leerApi<Pagina<RecargaBilleteraPublica>>('/mi/billetera/recargas?porPagina=10'),
      leerApi<Pagina<MovimientoBilleteraPublico>>(`/mi/billetera/movimientos?${consulta}`),
      leerApi<MetodoCobroPublico[]>('/mi/billetera/metodos-cobro').then((r) => r.datos ?? []),
      leerApi<CatalogoPublico>('/catalogo').then((r) => r.datos),
    ]);
  const cabecera = (
    <CabeceraPagina
      titulo="Mi billetera"
      descripcion="Recarga saldo con un pago y úsalo para pagar tus facturas y pedidos al instante."
    />
  );
  if (estado === 403 || !billetera) {
    return (
      <>
        {cabecera}
        <Alerta tono={estado === 403 ? 'info' : 'peligro'}>
          {estado === 403
            ? 'Tu cuenta la gestiona tu revendedor: pídele a él tus servicios y renovaciones.'
            : 'No pudimos cargar tu billetera. Recarga la página.'}
        </Alerta>
      </>
    );
  }
  // El pedido a pagar con esta recarga: el del enlace o el que espera pago.
  const pedidoId = typeof crudo.pedido === 'string' ? crudo.pedido : null;
  const pedido: PedidoPublico | null =
    pedidoId && pedidoId !== billetera.pedidoPendiente?.id
      ? await leerApi<PedidoPublico>(`/mi/pedidos/${pedidoId}`).then((r) => r.datos)
      : billetera.pedidoPendiente;
  const faltante =
    pedido && pedido.estado === 'pendiente'
      ? Math.max(0, Number(pedido.pendienteUsd) - Number(billetera.saldoUsd))
      : 0;
  const tasas: Partial<Record<Moneda, string>> = Object.fromEntries(
    (catalogo?.tasas ?? []).map((t) => [t.moneda, t.valor]),
  );

  return (
    <>
      {cabecera}
      {pedido && pedido.estado === 'pendiente' && (
        <Alerta tono="info" titulo={`Pedido ${pedido.numero} por pagar`}>
          {faltante > 0
            ? `Te faltan ${formatearMonto(faltante.toFixed(2), 'USD')} de saldo. Reporta la recarga abajo y, al confirmarla, pagamos el pedido.`
            : 'Tu saldo ya alcanza para pagarlo.'}{' '}
          <Link href={`/cuenta/carrito/${pedido.id}`} className="font-medium underline">
            Ver el pedido
          </Link>
        </Alerta>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Recargar saldo"
            descripcion="Paga primero y luego envía el comprobante. La tasa de hoy queda fijada al reportar."
          />
          <div className="px-5 py-5 sm:px-6">
            <FormularioRecarga
              metodos={metodos}
              tasas={tasas}
              maxMb={MAX_MB}
              ruta="/mi/billetera/recargas"
              {...(pedido && pedido.estado === 'pendiente' ? { pedidoId: pedido.id } : {})}
              {...(faltante > 0 ? { montoSugeridoUsd: faltante.toFixed(2) } : {})}
              exito={
                pedido && pedido.estado === 'pendiente'
                  ? `Al confirmar el pago acreditamos el saldo y pagamos el pedido ${pedido.numero}.`
                  : 'Te acreditaremos el saldo en cuanto confirmemos el pago.'
              }
            />
          </div>
        </Tarjeta>

        <Tarjeta className="lg:sticky lg:top-24">
          <div className="grid gap-2 px-5 py-5 sm:px-6">
            <p className="inline-flex items-center gap-2 text-sm text-tinta-suave">
              <Wallet className="size-4 text-marca" aria-hidden="true" /> Saldo disponible
            </p>
            <p className="font-titulo text-3xl font-semibold tabular-nums" data-prueba="saldo">
              {formatearMonto(billetera.saldoUsd, 'USD')}
            </p>
            {billetera.recargasEnRevision > 0 && (
              <p className="text-sm text-tinta-suave">
                {billetera.recargasEnRevision === 1
                  ? '1 recarga en revisión.'
                  : `${billetera.recargasEnRevision} recargas en revisión.`}
              </p>
            )}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta>
        <CabeceraTarjeta titulo="Tus recargas" descripcion="Las 10 más recientes." />
        {!recargas || recargas.elementos.length === 0 ? (
          <EstadoVacio icono={ReceiptText} titulo="Todavía no has reportado recargas" />
        ) : (
          <ul className="divide-y divide-borde">
            {recargas.elementos.map((x) => (
              <li key={x.id} className="grid gap-1.5 px-5 py-4 text-sm sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatearMonto(x.montoRecibido ?? x.montoDeclarado, x.moneda)} ·{' '}
                    {x.metodo.nombre}
                  </span>
                  <EstadoRecargaInsignia estado={x.estado} />
                </div>
                <p className="text-tinta-suave">
                  {x.estado === 'confirmada' && x.montoUsd
                    ? `Acreditado: ${formatearMonto(x.montoUsd, 'USD')}`
                    : `Estimado: ${formatearMonto(x.montoUsdEstimado, 'USD')}`}{' '}
                  · pagado el {formatearFecha(x.fechaPago)} · código{' '}
                  <span className="font-mono text-xs">{x.referencia}</span>
                  {x.referenciaExterna ? ` · ref. ${x.referenciaExterna}` : ''}
                  {x.pedido ? ` · para el pedido ${x.pedido.numero}` : ''}
                </p>
                {x.estado === 'rechazada' && x.motivoRechazo && (
                  <p className="text-peligro">Motivo: {x.motivoRechazo}</p>
                )}
                {x.tieneComprobante && (
                  <a
                    href={`/api/v1/mi/billetera/recargas/${x.id}/comprobante`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 justify-self-start font-medium text-marca hover:underline"
                  >
                    <FileText className="size-4" aria-hidden="true" /> Ver comprobante
                    <span className="sr-only">(se abre en una pestaña nueva)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Movimientos"
          descripcion="Cada recarga, pago o ajuste, con el saldo que quedó."
        />
        {!libro || libro.elementos.length === 0 ? (
          <EstadoVacio icono={Wallet} titulo="Sin movimientos todavía" />
        ) : (
          <>
            <Tabla minimo="36rem">
              <Encabezados
                columnas={[
                  'Fecha',
                  'Movimiento',
                  { texto: 'Importe', className: 'text-right' },
                  { texto: 'Saldo', className: 'text-right pr-5 sm:pr-6' },
                ]}
              />
              <Cuerpo>
                {libro.elementos.map((m) => (
                  <tr key={m.id}>
                    <Celda primera className="whitespace-nowrap text-tinta-suave">
                      <time dateTime={m.creadoEn}>{formatearFechaHora(m.creadoEn)}</time>
                    </Celda>
                    <Celda>
                      <span className="block font-medium">{TIPO_MOVIMIENTO_BILLETERA[m.tipo]}</span>
                      <span className="block text-xs text-tinta-tenue">
                        {m.factura ? (
                          <Link
                            href={`/cuenta/facturas/${m.factura.id}`}
                            className="hover:underline"
                          >
                            Factura {m.factura.numero}
                          </Link>
                        ) : m.recarga ? (
                          `Recarga ${m.recarga.referencia}`
                        ) : (
                          m.motivo
                        )}
                      </span>
                    </Celda>
                    <Celda
                      className={clsx(
                        'text-right font-medium whitespace-nowrap tabular-nums',
                        Number(m.montoUsd) < 0 ? 'text-tinta' : 'text-exito',
                      )}
                    >
                      {montoConSigno(m.montoUsd)}
                    </Celda>
                    <Celda className="pr-5 text-right whitespace-nowrap tabular-nums sm:pr-6">
                      {formatearMonto(m.saldoResultanteUsd, 'USD')}
                    </Celda>
                  </tr>
                ))}
              </Cuerpo>
            </Tabla>
            <Paginacion
              ruta="/cuenta/billetera"
              parametros={{}}
              pagina={libro.pagina}
              porPagina={libro.porPagina}
              total={libro.total}
            />
          </>
        )}
      </Tarjeta>
    </>
  );
}
