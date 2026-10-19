import {
  formatearMonto,
  type MovimientoBilleteraPublico,
  type Pagina,
  paginacionSchema,
  type RecargaBilleteraPublica,
} from '@nv/shared';
import { CircleCheckBig, Paperclip, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AjustarSaldo, ConciliarRecarga } from '@/componentes/admin/revendedores';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { TIPO_MOVIMIENTO_BILLETERA } from '@/lib/estados';
import { formatearFecha, formatearFechaHora, haceCuanto } from '@/lib/formato';
import { montoConSigno } from '@/lib/revendedores';

type Crudo = Record<string, string | string[] | undefined>;

/** Cola de recargas de billetera que reportaron los clientes (quien concilia pagos). */
export async function ColaRecargasBilletera({ crudo, ruta }: { crudo: Crudo; ruta: string }) {
  const { consulta } = leerFiltro(paginacionSchema, crudo, { porPagina: 20 });
  consulta.set('estado', 'en_revision');
  const { datos } = await leerApi<Pagina<RecargaBilleteraPublica>>(
    `/billeteras/recargas?${consulta}`,
  );

  return (
    <Tarjeta>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Recargas de billetera por conciliar</h2>
          <p className="text-sm text-tinta-suave">
            Comprueba cada pago en el banco antes de acreditarlo. Si la recarga es para un pedido,
            el pedido se paga solo al confirmarla.
          </p>
        </div>
        {datos && (
          <Insignia tono={datos.total > 0 ? 'aviso' : 'exito'}>
            {datos.total === 1 ? '1 en revisión' : `${datos.total} en revisión`}
          </Insignia>
        )}
      </header>
      {!datos ? (
        <div className="px-5 py-5 sm:px-6">
          <Alerta tono="peligro">No pudimos cargar las recargas. Recarga la página.</Alerta>
        </div>
      ) : datos.elementos.length === 0 ? (
        <EstadoVacio icono={CircleCheckBig} titulo="No hay recargas pendientes">
          Cuando un cliente reporte una recarga de su billetera aparecerá aquí.
        </EstadoVacio>
      ) : (
        <ol className="divide-y divide-borde">
          {datos.elementos.map((x) => {
            const filas: [string, ReactNode][] = [
              ['Método', x.metodo.nombre],
              [
                'Referencia del banco',
                x.referenciaExterna ? (
                  <span className="font-mono text-[0.8rem] break-all">{x.referenciaExterna}</span>
                ) : (
                  <span className="text-tinta-tenue">Sin referencia</span>
                ),
              ],
              ['Fecha del pago', formatearFecha(x.fechaPago)],
              [
                'Código',
                <span key="codigo" className="font-mono text-[0.8rem]">
                  {x.referencia}
                </span>,
              ],
            ];
            return (
              <li
                key={x.id}
                className="grid grid-cols-1 gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
              >
                <div className="grid content-start gap-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/admin/clientes/${x.cliente.id}`}
                      className="font-medium hover:text-marca hover:underline"
                    >
                      {x.cliente.nombre}
                    </Link>
                    {x.pedido && <Insignia tono="marca">Para el pedido {x.pedido.numero}</Insignia>}
                    <span className="text-xs text-tinta-tenue">
                      Reportada <time dateTime={x.creadoEn}>{haceCuanto(x.creadoEn)}</time>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-borde">
                    <div className="grid gap-0.5 bg-hundida px-4 py-3">
                      <span className="text-xs text-tinta-tenue">Declarado</span>
                      <span className="font-titulo text-lg font-semibold break-words tabular-nums">
                        {formatearMonto(x.montoDeclarado, x.moneda)}
                      </span>
                    </div>
                    <div className="grid gap-0.5 border-l border-borde bg-hundida px-4 py-3">
                      <span className="text-xs text-tinta-tenue">
                        Saldo a acreditar{x.moneda !== 'USD' ? ` (tasa ${x.tasa})` : ''}
                      </span>
                      <span className="font-titulo text-lg font-semibold break-words tabular-nums">
                        {formatearMonto(x.montoUsdEstimado, 'USD')}
                      </span>
                    </div>
                  </div>
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    {filas.map(([k, v]) => (
                      <div key={k} className="grid gap-0.5">
                        <dt className="text-xs text-tinta-tenue">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="grid content-start gap-3">
                  {x.tieneComprobante ? (
                    <a
                      href={`/api/v1/billeteras/recargas/${x.id}/comprobante`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-2 text-sm font-medium text-marca hover:underline"
                    >
                      <Paperclip className="size-4" aria-hidden="true" />
                      Ver comprobante
                      <span className="sr-only">(se abre en una pestaña nueva)</span>
                    </a>
                  ) : (
                    <p className="inline-flex items-center gap-2 text-sm text-tinta-tenue">
                      <Paperclip className="size-4" aria-hidden="true" /> Sin comprobante
                    </p>
                  )}
                  <ConciliarRecarga
                    recarga={x}
                    titular={x.cliente.nombre}
                    base="/billeteras/recargas"
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {datos && (
        <Paginacion
          ruta={ruta}
          parametros={{ vista: 'billeteras' }}
          pagina={datos.pagina}
          porPagina={datos.porPagina}
          total={datos.total}
        />
      )}
    </Tarjeta>
  );
}

/** Saldo de la billetera de un cliente, sus últimos movimientos y el ajuste manual. */
export async function BilleteraDeCliente({
  clienteId,
  puedeAjustar,
}: {
  clienteId: string;
  puedeAjustar: boolean;
}) {
  const { datos } = await leerApi<{
    saldoUsd: string;
    movimientos: Pagina<MovimientoBilleteraPublico>;
  }>(`/billeteras/clientes/${encodeURIComponent(clienteId)}?porPagina=5`);
  if (!datos) return null;
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Billetera"
        descripcion="Saldo en USD para pagar facturas y pedidos."
        accion={<Wallet className="size-5 text-marca" aria-hidden="true" />}
      />
      <div className="grid gap-4 px-5 py-5 sm:px-6">
        <p className="font-titulo text-2xl font-semibold tabular-nums">
          {formatearMonto(datos.saldoUsd, 'USD')}
        </p>
        {datos.movimientos.elementos.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {datos.movimientos.elementos.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block">{TIPO_MOVIMIENTO_BILLETERA[m.tipo]}</span>
                  <span className="block truncate text-xs text-tinta-tenue">
                    {formatearFechaHora(m.creadoEn)}
                    {m.factura ? ` · Factura ${m.factura.numero}` : ''}
                    {m.recarga ? ` · ${m.recarga.referencia}` : ''}
                    {m.motivo ? ` · ${m.motivo}` : ''}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{montoConSigno(m.montoUsd)}</span>
              </li>
            ))}
          </ul>
        )}
        {puedeAjustar && (
          <AjustarSaldo
            saldoUsd={datos.saldoUsd}
            ruta={`/billeteras/clientes/${clienteId}/ajustes`}
            quienVe="el cliente"
          />
        )}
      </div>
    </Tarjeta>
  );
}
