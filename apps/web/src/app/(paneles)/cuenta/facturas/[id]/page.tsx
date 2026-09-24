import {
  type CatalogoPublico,
  type FacturaDetalle,
  formatearMonto,
  type MetodoCobroPublico,
} from '@nv/shared';
import { ArrowLeft, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CambiarMoneda, FormularioPago } from '@/componentes/cliente/pago';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoFacturaInsignia, EstadoPagoInsignia } from '@/componentes/ui/estado';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Factura' };

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={fuerte ? 'font-semibold' : 'text-tinta-suave'}>{etiqueta}</dt>
      <dd className={fuerte ? 'text-base font-semibold tabular-nums' : 'tabular-nums'}>{valor}</dd>
    </div>
  );
}

export default async function Factura({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion({ roles: ['cliente'] });
  const { id } = await params;
  const { estado, datos: f } = await leerApi<FacturaDetalle>(`/mi/facturas/${id}`);
  if (estado === 404 || estado === 400) notFound();
  if (!f) {
    return (
      <Alerta tono="peligro">No pudimos cargar la factura. Recarga la página en un momento.</Alerta>
    );
  }

  const porPagar = f.estado === 'emitida' && !f.pagoEnRevision;
  const [{ datos: metodos }, { datos: catalogo }] = porPagar
    ? await Promise.all([
        leerApi<MetodoCobroPublico[]>(`/mi/metodos-cobro?moneda=${f.moneda}`),
        leerApi<CatalogoPublico>('/catalogo'),
      ])
    : [{ datos: null }, { datos: null }];

  return (
    <>
      <Link
        href="/cuenta/facturas"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Facturas y pagos
      </Link>
      <CabeceraPagina
        titulo={`Factura ${f.numero}`}
        descripcion={`Emitida el ${formatearFecha(f.creadoEn)}. ${f.concepto === 'alta' ? 'Alta de servicio' : 'Renovación'}.`}
        acciones={<EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />}
      />

      {f.estado === 'pagada' && (
        <Alerta tono="exito" titulo="Factura pagada">
          Confirmamos tu pago{f.pagadaEn ? ` el ${formatearFecha(f.pagadaEn)}` : ''}. ¡Gracias!
        </Alerta>
      )}
      {f.estado === 'anulada' && (
        <Alerta tono="aviso" titulo="Factura anulada">
          {f.motivoAnulacion ?? 'Esta factura ya no es válida.'} No hace falta que la pagues.
        </Alerta>
      )}
      {f.estado === 'emitida' && f.pagoEnRevision && (
        <Alerta tono="info" titulo="Recibimos tu comprobante">
          Lo estamos revisando. Te avisaremos por correo cuando lo confirmemos.
        </Alerta>
      )}
      {f.vencida && porPagar && (
        <Alerta tono="aviso">
          El plazo para pagar venció el {formatearFecha(f.venceEn)}. Aún puedes pagarla: si pagas en
          otra moneda o cambió la tasa, actualiza el importe antes de pagar.
        </Alerta>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          {porPagar && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Pagar esta factura"
                descripcion={`Paga ${formatearMonto(f.total, f.moneda)} antes del ${formatearFecha(f.venceEn)} y envíanos el comprobante.`}
              />
              <div className="grid gap-6 px-5 py-5 sm:px-6">
                {catalogo && catalogo.monedas.length > 1 && (
                  <CambiarMoneda facturaId={f.id} actual={f.moneda} monedas={catalogo.monedas} />
                )}
                {metodos && metodos.length > 0 ? (
                  <FormularioPago
                    facturaId={f.id}
                    total={f.total}
                    metodos={metodos}
                    maxMb={MAX_MB}
                  />
                ) : (
                  <Alerta tono="aviso">
                    Por ahora no tenemos formas de pago en {f.moneda}. Elige otra moneda arriba o
                    escríbenos desde Soporte.
                  </Alerta>
                )}
              </div>
            </Tarjeta>
          )}

          <Tarjeta>
            <CabeceraTarjeta titulo="Pagos enviados" />
            {f.pagos.length === 0 ? (
              <p className="px-5 py-5 text-sm text-tinta-suave sm:px-6">
                Todavía no has enviado ningún pago para esta factura.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {f.pagos.map((p) => (
                  <li key={p.id} className="grid gap-1.5 px-5 py-4 text-sm sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">
                        {formatearMonto(p.montoRecibido ?? p.montoDeclarado, p.moneda)} ·{' '}
                        {p.metodo.nombre}
                      </span>
                      <EstadoPagoInsignia estado={p.estado} />
                    </div>
                    <p className="text-tinta-suave">
                      Pagado el {formatearFecha(p.fechaPago)} · enviado{' '}
                      {formatearFechaHora(p.creadoEn)} · código {p.referencia}
                      {p.referenciaExterna ? ` · ref. ${p.referenciaExterna}` : ''}
                    </p>
                    {p.estado === 'rechazado' && p.motivoRechazo && (
                      <p className="text-peligro">Motivo: {p.motivoRechazo}</p>
                    )}
                    {p.tieneComprobante && (
                      <a
                        href={`/api/v1/mi/pagos/${p.id}/comprobante`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 justify-self-start font-medium text-marca hover:underline"
                      >
                        <FileText className="size-4" aria-hidden="true" /> Ver comprobante
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <Tarjeta>
          <CabeceraTarjeta titulo="Detalle" />
          <div className="grid gap-4 px-5 py-5 text-sm sm:px-6">
            <ul className="grid gap-2">
              {f.lineas.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-4">
                  <span>
                    {l.descripcion}
                    {l.cantidad > 1 ? ` × ${l.cantidad}` : ''}
                  </span>
                  <span className="tabular-nums">{formatearMonto(l.total, f.moneda)}</span>
                </li>
              ))}
            </ul>
            <dl className="grid gap-2 border-t border-borde pt-3">
              <Linea etiqueta="Subtotal" valor={formatearMonto(f.subtotal, f.moneda)} />
              {Number(f.descuento) > 0 && (
                <Linea
                  etiqueta={f.cupon ? `Cupón ${f.cupon}` : 'Descuento'}
                  valor={`−${formatearMonto(f.descuento, f.moneda)}`}
                />
              )}
              <Linea etiqueta="Total" valor={formatearMonto(f.total, f.moneda)} fuerte />
            </dl>
            {f.moneda !== 'USD' && (
              <p className="text-xs text-tinta-tenue">
                Tasa aplicada: 1 USD = {formatearMonto(f.tasa, f.moneda)}. Equivale a{' '}
                {formatearMonto(f.totalUsd, 'USD')}.
              </p>
            )}
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
