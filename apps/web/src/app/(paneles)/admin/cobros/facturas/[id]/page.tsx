import type { FacturaDetalle, MetodoCobroPublico, PagoPublico, ReembolsoResumen } from '@nv/shared';
import { ArrowLeft, ArrowUpRight, Globe, Paperclip, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AnularFactura, ConciliarPago, Recotizar, RegistrarPago } from '@/componentes/admin/cobros';
import { formatearTasa, mismoImporte } from '@/componentes/admin/formato-admin';
import { DevolverPago } from '@/componentes/admin/pagos-en-linea';
import { Isotipo } from '@/componentes/logo';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoFacturaInsignia, EstadoPagoInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha, formatearFechaHora, formatearMonto, haceCuanto } from '@/lib/formato';
import { ESTADO_REEMBOLSO, nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Detalle de la factura' };

function Accion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:px-6">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-sm text-tinta-suave">{descripcion}</p>
      </div>
      {children}
    </div>
  );
}

export default async function DetalleFactura({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'facturas.ver' });
  const { id } = await params;
  const { estado, datos: f } = await leerApi<FacturaDetalle>(`/facturas/${encodeURIComponent(id)}`);
  if (estado === 404 || estado === 400 || !f) notFound();

  const puedeConciliar = sesion.permisos.includes('pagos.gestionar');
  const puedeAnular = sesion.permisos.includes('facturas.anular');
  const emitida = f.estado === 'emitida';
  const metodos =
    puedeConciliar && emitida && !f.pagoEnRevision
      ? ((await leerApi<MetodoCobroPublico[]>(`/pagos/metodos?moneda=${f.moneda}`)).datos ?? [])
      : [];
  const puedeReembolsar = sesion.permisos.includes('pagos.reembolsar');
  // Devoluciones de los pagos en línea (los manuales no se devuelven por la pasarela).
  const reembolsos = new Map(
    await Promise.all(
      f.pagos
        .filter((p) => p.origen === 'pasarela')
        .map(
          async (p) =>
            [p.id, (await leerApi<ReembolsoResumen[]>(`/pagos/${p.id}/reembolsos`)).datos] as const,
        ),
    ),
  );
  const hayDescuento = !mismoImporte(f.descuento, '0');
  const acciones = emitida && (puedeConciliar || puedeAnular);

  const fechas: [string, ReactNode][] = [
    ['Emitida', formatearFecha(f.creadoEn)],
    f.estado === 'pagada' && f.pagadaEn
      ? ['Pagada', formatearFecha(f.pagadaEn)]
      : f.estado === 'anulada' && f.anuladaEn
        ? ['Anulada', formatearFecha(f.anuladaEn)]
        : [
            'Vence',
            <span key="vence" className={f.vencida ? 'text-peligro' : undefined}>
              {formatearFecha(f.venceEn)}
              <span className="block text-xs text-tinta-tenue">{haceCuanto(f.venceEn)}</span>
            </span>,
          ],
  ];

  return (
    <>
      <Link
        href="/admin/cobros?vista=facturas"
        className="inline-flex w-fit items-center gap-2 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Cobros
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">
          Factura <span className="font-mono tracking-normal">{f.numero}</span>
        </h1>
        <EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />
        {f.pagoEnRevision && <Insignia tono="aviso">Pago en revisión</Insignia>}
      </div>

      {f.estado === 'anulada' && (
        <Alerta tono="info" titulo="Factura anulada">
          {f.motivoAnulacion ?? 'Sin motivo registrado.'}
        </Alerta>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          {/* Documento */}
          <Tarjeta className="overflow-hidden">
            <div className="relative border-b border-borde bg-linear-to-br from-marca-suave via-transparent to-acento-suave px-5 py-6 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Isotipo />
                  <div className="grid">
                    <span className="font-titulo font-semibold">NV Streaming</span>
                    <span className="text-xs text-tinta-tenue">
                      Factura de {f.concepto === 'alta' ? 'alta' : 'renovación'}
                    </span>
                  </div>
                </div>
                <div className="grid text-right">
                  <span className="text-xs text-tinta-tenue">Número</span>
                  <span className="font-mono text-lg font-semibold">{f.numero}</span>
                </div>
              </div>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Cliente</dt>
                  <dd>
                    <Link
                      href={`/admin/clientes/${f.cliente.id}`}
                      className="font-medium hover:text-marca hover:underline"
                    >
                      {f.cliente.nombre}
                    </Link>
                  </dd>
                </div>
                {fechas.map(([k, v]) => (
                  <div key={k} className="grid gap-0.5">
                    <dt className="text-xs text-tinta-tenue">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Tabla minimo="32rem">
              <Encabezados
                columnas={[
                  'Descripción',
                  { texto: 'Cant.', className: 'text-right' },
                  { texto: 'Precio', className: 'text-right' },
                  { texto: 'Importe', className: 'pr-5 text-right sm:pr-8' },
                ]}
              />
              <Cuerpo>
                {f.lineas.map((l) => (
                  <tr key={l.id}>
                    <Celda primera>{l.descripcion}</Celda>
                    <Celda className="text-right tabular-nums">{l.cantidad}</Celda>
                    <Celda className="text-right tabular-nums">
                      {formatearMonto(l.precioUnitario, f.moneda)}
                    </Celda>
                    <Celda className="pr-5 text-right font-medium tabular-nums sm:pr-8">
                      {formatearMonto(l.total, f.moneda)}
                    </Celda>
                  </tr>
                ))}
              </Cuerpo>
            </Tabla>

            <div className="grid gap-6 border-t border-borde px-5 py-5 sm:grid-cols-[1fr_auto] sm:px-8">
              <div className="grid content-end gap-2 text-sm">
                {f.suscripcionId && (
                  <Link
                    href={`/admin/suscripciones/${f.suscripcionId}`}
                    className="inline-flex w-fit items-center gap-1 font-medium text-marca hover:underline"
                  >
                    Ver suscripción <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
                {f.moneda !== 'USD' && (
                  <p className="text-tinta-tenue">
                    Tasa aplicada:{' '}
                    <span className="text-tinta-suave tabular-nums">
                      1 USD = {formatearTasa(f.tasa, f.moneda)}
                    </span>
                  </p>
                )}
              </div>
              <dl className="grid min-w-64 gap-2 text-sm">
                <div className="flex justify-between gap-8">
                  <dt className="text-tinta-suave">Subtotal</dt>
                  <dd className="tabular-nums">{formatearMonto(f.subtotal, f.moneda)}</dd>
                </div>
                {hayDescuento && (
                  <div className="flex justify-between gap-8">
                    <dt className="text-tinta-suave">
                      Descuento
                      {f.cupon && (
                        <span className="ml-2 rounded border border-borde bg-hundida px-1.5 py-0.5 font-mono text-xs">
                          {f.cupon}
                        </span>
                      )}
                    </dt>
                    <dd className="text-exito tabular-nums">
                      − {formatearMonto(f.descuento, f.moneda)}
                    </dd>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between gap-8 border-t border-borde pt-3">
                  <dt className="font-medium">Total</dt>
                  <dd className="font-titulo text-2xl font-semibold tabular-nums">
                    {formatearMonto(f.total, f.moneda)}
                  </dd>
                </div>
                {f.moneda !== 'USD' && (
                  <div className="flex justify-between gap-8 text-xs text-tinta-tenue">
                    <dt>Equivalente en USD</dt>
                    <dd className="tabular-nums">{formatearMonto(f.totalUsd, 'USD')}</dd>
                  </div>
                )}
              </dl>
            </div>
          </Tarjeta>

          {/* Pagos */}
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Pagos"
              descripcion="Pagados en línea, reportados por el cliente o registrados por el equipo."
            />
            {f.pagos.length === 0 ? (
              <EstadoVacio icono={Wallet} titulo="Todavía no hay pagos">
                {emitida
                  ? 'Cuando el cliente reporte su pago aparecerá aquí para conciliarlo.'
                  : 'Esta factura no tiene pagos asociados.'}
              </EstadoVacio>
            ) : (
              <ul className="divide-y divide-borde">
                {f.pagos.map((p) => (
                  <PagoDeFactura
                    key={p.id}
                    pago={p}
                    total={f.total}
                    puedeConciliar={puedeConciliar}
                    puedeReembolsar={puedeReembolsar}
                    reembolsos={reembolsos.get(p.id)}
                  />
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        {/* Acciones */}
        <aside className="grid gap-6">
          {acciones ? (
            <Tarjeta>
              <CabeceraTarjeta titulo="Acciones" />
              <div className="divide-y divide-borde">
                {puedeConciliar && f.pagoEnRevision && (
                  <div className="p-5 sm:p-6">
                    <Alerta tono="aviso">
                      Hay un pago en revisión. Confírmalo o recházalo antes de registrar otro pago o
                      recalcular la factura.
                    </Alerta>
                  </div>
                )}
                {puedeConciliar && !f.pagoEnRevision && (
                  <Accion
                    titulo="Registrar pago recibido"
                    descripcion={`Para pagos que ya llegaron a la cuenta. Solo se muestran métodos que cobran en ${f.moneda}.`}
                  >
                    <RegistrarPago
                      facturaId={f.id}
                      moneda={f.moneda}
                      total={f.total}
                      metodos={metodos}
                    />
                  </Accion>
                )}
                {puedeConciliar && !f.pagoEnRevision && (
                  <Accion
                    titulo="Recalcular con la tasa de hoy"
                    descripcion="Actualiza el total con la tasa vigente. También puedes cambiar la moneda si el cliente prefiere pagar en otra."
                  >
                    <Recotizar facturaId={f.id} moneda={f.moneda} />
                  </Accion>
                )}
                {puedeAnular && (
                  <Accion
                    titulo="Anular factura"
                    descripcion="La factura deja de poder pagarse. El motivo queda registrado."
                  >
                    <AnularFactura facturaId={f.id} numero={f.numero} />
                  </Accion>
                )}
              </div>
            </Tarjeta>
          ) : (
            <Tarjeta className="p-5 sm:p-6">
              <p className="text-sm text-tinta-suave">
                {f.estado === 'pagada'
                  ? 'Factura pagada. No admite más cambios.'
                  : f.estado === 'anulada'
                    ? 'Factura anulada. No admite más cambios.'
                    : 'No tienes acciones disponibles sobre esta factura.'}
              </p>
            </Tarjeta>
          )}
        </aside>
      </div>
    </>
  );
}

/** Resta de importes decimales en centésimas, para no arrastrar errores de coma flotante. */
function restar(a: string, b: string): string {
  const c = (v: string) => Math.round(Number(v) * 100);
  return (Math.max(0, c(a) - c(b)) / 100).toFixed(2);
}

function PagoDeFactura({
  pago: p,
  total,
  puedeConciliar,
  puedeReembolsar,
  reembolsos,
}: {
  pago: PagoPublico;
  total: string;
  puedeConciliar: boolean;
  puedeReembolsar: boolean;
  /** undefined: pago manual; null: no se pudieron cargar. */
  reembolsos: ReembolsoResumen[] | null | undefined;
}) {
  const enLinea = p.origen === 'pasarela';
  const devuelto = p.montoReembolsado ?? '0';
  const disponible = restar(p.montoRecibido ?? p.montoDeclarado, devuelto);
  const enCurso = reembolsos?.some((r) => r.estado === 'solicitado') ?? false;
  const datos: [string, ReactNode][] = [
    ['Método', p.metodo.nombre],
    ...(enLinea ? [['Pasarela', nombrePasarela(p.pasarela)] as [string, ReactNode]] : []),
    ['Declarado', formatearMonto(p.montoDeclarado, p.moneda)],
    ...(p.montoRecibido !== null
      ? [['Recibido', formatearMonto(p.montoRecibido, p.moneda)] as [string, ReactNode]]
      : []),
    [
      enLinea ? 'Id en la pasarela' : 'Referencia del banco',
      p.referenciaExterna ? (
        <span className="font-mono text-[0.8rem] break-all">{p.referenciaExterna}</span>
      ) : (
        '—'
      ),
    ],
    ['Fecha del pago', formatearFecha(p.fechaPago)],
    ...(enLinea && Number(devuelto) > 0
      ? [['Devuelto', formatearMonto(devuelto, p.moneda)] as [string, ReactNode]]
      : []),
  ];

  return (
    <li className="grid gap-4 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-medium">{p.referencia}</span>
        <EstadoPagoInsignia estado={p.estado} />
        {enLinea ? (
          <Insignia tono="acento">
            <Globe className="size-3" aria-hidden="true" /> Pago en línea
          </Insignia>
        ) : (
          <Insignia>Manual</Insignia>
        )}
        <span className="text-xs text-tinta-tenue">
          <time dateTime={p.creadoEn}>{formatearFechaHora(p.creadoEn)}</time>
        </span>
        {p.tieneComprobante && (
          <a
            href={`/api/v1/pagos/${p.id}/comprobante`}
            target="_blank"
            rel="noopener"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-marca hover:underline"
          >
            <Paperclip className="size-4" aria-hidden="true" />
            Ver comprobante
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {datos.map(([k, v]) => (
          <div key={k} className="grid gap-0.5">
            <dt className="text-xs text-tinta-tenue">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {p.estado === 'rechazado' && p.motivoRechazo && (
        <div className="grid gap-0.5 rounded-xl border border-peligro/25 bg-peligro-suave px-4 py-3 text-sm">
          <p className="font-medium text-peligro">Motivo del rechazo (lo ve el cliente)</p>
          <p className="text-tinta-suave">{p.motivoRechazo}</p>
        </div>
      )}
      {(p.revisadoPor || p.notasConciliacion) && (
        <div className="grid gap-1 rounded-xl bg-hundida px-4 py-3 text-sm">
          {p.revisadoPor && (
            <p className="text-tinta-suave">
              Revisado por <span className="text-tinta">{p.revisadoPor.nombre}</span>
              {p.revisadoEn && <> · {formatearFechaHora(p.revisadoEn)}</>}
            </p>
          )}
          {p.notasConciliacion && <p className="text-tinta-suave">{p.notasConciliacion}</p>}
        </div>
      )}
      {p.estado === 'en_revision' && puedeConciliar && (
        <ConciliarPago pago={p} totalFactura={total} />
      )}
      {enLinea && (
        <section aria-label={`Devoluciones del pago ${p.referencia}`} className="grid gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
            Devoluciones
          </h4>
          {reembolsos === null ? (
            <p className="text-sm text-peligro">No pudimos cargar las devoluciones.</p>
          ) : !reembolsos || reembolsos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin devoluciones.</p>
          ) : (
            <ul className="grid gap-2">
              {reembolsos.map((r) => (
                <li
                  key={r.id}
                  className="grid gap-1 rounded-xl border border-borde bg-hundida px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tabular-nums">
                      {formatearMonto(r.monto, r.moneda)}
                    </span>
                    <Insignia tono={ESTADO_REEMBOLSO[r.estado].tono}>
                      {ESTADO_REEMBOLSO[r.estado].texto}
                    </Insignia>
                    <span className="text-xs text-tinta-tenue">
                      {r.solicitadoPor.nombre} · {formatearFechaHora(r.creadoEn)}
                    </span>
                  </div>
                  <p className="break-words text-tinta-suave">{r.motivo}</p>
                  {r.error && <p className="text-peligro">{r.error}</p>}
                </li>
              ))}
            </ul>
          )}
          {puedeReembolsar &&
            (p.estado === 'confirmado' || p.estado === 'reembolsado') &&
            Number(disponible) > 0 &&
            (enCurso ? (
              <p className="text-sm text-tinta-suave">
                Hay una devolución en curso. Espera a que termine para pedir otra.
              </p>
            ) : (
              <DevolverPago pagoId={p.id} moneda={p.moneda} disponible={disponible} />
            ))}
        </section>
      )}
    </li>
  );
}
