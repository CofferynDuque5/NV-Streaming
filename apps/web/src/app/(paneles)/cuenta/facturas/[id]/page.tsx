import {
  type CatalogoPublico,
  type FacturaDetalle,
  formatearMonto,
  type MetodoCobroPublico,
  type OpcionesPagoEnLinea,
} from '@nv/shared';
import { ArrowLeft, FileText, Globe } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CambiarMoneda, FormularioPago } from '@/componentes/cliente/pago';
import { PagarEnLinea } from '@/componentes/cliente/pago-en-linea';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoFacturaInsignia, EstadoPagoInsignia } from '@/componentes/ui/estado';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { monedaAdmitePagoEnLinea, nombrePasarela } from '@/lib/pagos-en-linea';
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
  const enLinea = porPagar && monedaAdmitePagoEnLinea(f.moneda);
  const [{ datos: todos }, { datos: catalogo }, { datos: opcionesEnLinea }] = porPagar
    ? await Promise.all([
        leerApi<MetodoCobroPublico[]>(`/mi/metodos-cobro?moneda=${f.moneda}`),
        leerApi<CatalogoPublico>('/catalogo'),
        enLinea
          ? leerApi<OpcionesPagoEnLinea>(`/mi/facturas/${f.id}/pago-en-linea`)
          : Promise.resolve({ datos: null }),
      ])
    : [{ datos: null }, { datos: null }, { datos: null }];
  // Los métodos en línea se ofrecen arriba; aquí solo los manuales (con comprobante).
  const metodos = todos?.filter((m) => (m.tipo ?? 'manual') === 'manual') ?? null;
  const opciones = opcionesEnLinea?.opciones.length ? opcionesEnLinea : null;

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

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {porPagar && catalogo && catalogo.monedas.length > 1 && (
            <Tarjeta className="px-5 py-5 sm:px-6">
              <CambiarMoneda facturaId={f.id} actual={f.moneda} monedas={catalogo.monedas} />
            </Tarjeta>
          )}

          {opciones && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Pagar en línea"
                descripcion="Pagas en la pasarela y la factura queda pagada al momento, sin enviar comprobante."
                accion={<Globe className="size-5 text-marca" aria-hidden="true" />}
              />
              <div className="px-5 py-5 sm:px-6">
                <PagarEnLinea datos={opciones} />
              </div>
            </Tarjeta>
          )}

          {porPagar && (!opciones || (metodos && metodos.length > 0)) && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo={opciones ? 'O paga por transferencia' : 'Pagar esta factura'}
                descripcion={`Paga ${formatearMonto(f.total, f.moneda)} antes del ${formatearFecha(f.venceEn)} y envíanos el comprobante.`}
              />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-5 py-5 sm:px-6">
                {f.moneda === 'VES' && (
                  <Alerta tono="info" titulo="Pagos en bolívares">
                    Los pagos en bolívares se hacen por Pago Móvil o transferencia y se confirman
                    con el comprobante. El pago en línea está disponible para facturas en dólares,
                    euros y pesos o soles; si lo prefieres, cambia la moneda de la factura.
                  </Alerta>
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
                        {p.origen === 'pasarela'
                          ? `Pago en línea (${nombrePasarela(p.pasarela)})`
                          : p.metodo.nombre}
                      </span>
                      <EstadoPagoInsignia estado={p.estado} />
                    </div>
                    <p className="text-tinta-suave">
                      Pagado el {formatearFecha(p.fechaPago)} · enviado{' '}
                      {formatearFechaHora(p.creadoEn)} · código {p.referencia}
                      {p.referenciaExterna ? ` · ref. ${p.referenciaExterna}` : ''}
                    </p>
                    {p.montoReembolsado && Number(p.montoReembolsado) > 0 && (
                      <p className="text-tinta-suave">
                        Te devolvimos {formatearMonto(p.montoReembolsado, p.moneda)} a través de{' '}
                        {nombrePasarela(p.pasarela)}.
                      </p>
                    )}
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
