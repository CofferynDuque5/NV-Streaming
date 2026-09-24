import {
  type CompraPublica,
  formatearMonto,
  type MovimientoSaldoPublico,
  type NivelPublico,
  type Pagina,
  paginacionSchema,
  type RecargaPublica,
  type RevendedorDetalle,
} from '@nv/shared';
import clsx from 'clsx';
import { Paperclip } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { nombrePais, VacioCompacto, Volver } from '@/componentes/admin/piezas-crm';
import {
  AccionConMotivo,
  AjustarSaldo,
  EditarCondiciones,
  RevisarSolicitud,
} from '@/componentes/admin/revendedores';
import { Paginacion } from '@/componentes/panel/paginacion';
import {
  EstadoCompraInsignia,
  EstadoRecargaInsignia,
  EstadoRevendedorInsignia,
} from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { montoConSigno, TIPO_COMPRA, TIPO_MOVIMIENTO } from '@/lib/revendedores';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ficha del revendedor' };

type Crudo = Record<string, string | string[] | undefined>;

export default async function FichaRevendedor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Crudo>;
}) {
  const sesion = await requerirSesion({ permiso: 'revendedores.ver' });
  const puedeGestionar = sesion.permisos.includes('revendedores.gestionar');
  const { id } = await params;
  const ruta = encodeURIComponent(id);
  const { consulta } = leerFiltro(paginacionSchema, await searchParams, { porPagina: 20 });

  const [revendedorR, movimientosR, comprasR, recargasR, niveles] = await Promise.all([
    leerApi<RevendedorDetalle>(`/revendedores/${ruta}`),
    leerApi<Pagina<MovimientoSaldoPublico>>(`/revendedores/${ruta}/movimientos?${consulta}`),
    leerApi<Pagina<CompraPublica>>(`/revendedores/${ruta}/compras?porPagina=20`),
    leerApi<Pagina<RecargaPublica>>(`/revendedores/${ruta}/recargas?porPagina=10`),
    leerApi<NivelPublico[]>('/revendedores/niveles').then((r) => r.datos ?? []),
  ]);
  const r = revendedorR.datos;
  if (revendedorR.estado === 404 || revendedorR.estado === 400 || !r) notFound();
  const libro = movimientosR.datos;
  const compras = comprasR.datos;
  const recargas = recargasR.datos;
  const operativo = r.estado === 'aprobado' || r.estado === 'suspendido';

  const datos: [string, ReactNode][] = [
    ['Titular', `${r.usuario.nombre}`],
    [
      'Correo',
      <span key="correo" className="break-all">
        {r.usuario.correo}
      </span>,
    ],
    ['Documento', r.documento ?? '—'],
    ['Teléfono', r.telefono ?? '—'],
    ['País', nombrePais(r.pais) || '—'],
    ['Solicitud', formatearFecha(r.creadoEn)],
    [
      'Revisada',
      r.revisadoEn
        ? `${formatearFecha(r.revisadoEn)}${r.revisadoPor ? ` por ${r.revisadoPor.nombre}` : ''}`
        : '—',
    ],
  ];

  return (
    <>
      <Volver href="/admin/revendedores?vista=revendedores">Revendedores</Volver>

      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold break-words sm:text-[1.75rem]">
            {r.nombreComercial}
          </h1>
          <EstadoRevendedorInsignia estado={r.estado} />
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-tinta-suave">
          <span>{r.usuario.nombre}</span>
          {r.nivel && <span>Nivel {r.nivel.nombre}</span>}
          <span>
            {r.clientes === 1 ? '1 cliente' : `${r.clientes} clientes`} · {r.suscripcionesActivas}{' '}
            activos
          </span>
          <span>{r.compras === 1 ? '1 compra' : `${r.compras} compras`}</span>
        </p>
      </header>

      {r.motivoEstado && (r.estado === 'suspendido' || r.estado === 'rechazado') && (
        <Alerta tono={r.estado === 'suspendido' ? 'peligro' : 'aviso'} titulo="Motivo">
          {r.motivoEstado}
        </Alerta>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Movimientos del saldo"
              descripcion="Historial inmutable: cada recarga, compra, reembolso y ajuste."
            />
            {!libro || libro.elementos.length === 0 ? (
              <VacioCompacto>Sin movimientos.</VacioCompacto>
            ) : (
              <>
                <Tabla minimo="42rem">
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
                          <span className="block font-medium">{TIPO_MOVIMIENTO[m.tipo]}</span>
                          <span className="block text-xs text-tinta-tenue">
                            {[
                              m.compra ? `${m.compra.plan} · ${m.compra.cliente}` : null,
                              m.recarga ? `Recarga ${m.recarga.referencia}` : null,
                              m.motivo,
                              m.autor ? `por ${m.autor.nombre}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </Celda>
                        <Celda
                          className={clsx(
                            'text-right font-medium whitespace-nowrap tabular-nums',
                            Number(m.montoUsd) > 0 && 'text-exito',
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
                  ruta={`/admin/revendedores/${ruta}`}
                  parametros={{}}
                  pagina={libro.pagina}
                  porPagina={libro.porPagina}
                  total={libro.total}
                />
              </>
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              titulo="Compras"
              descripcion={
                compras && compras.total > compras.elementos.length
                  ? `Las ${compras.elementos.length} más recientes de ${compras.total}.`
                  : 'Un reembolso devuelve el saldo y cancela el servicio del cliente.'
              }
            />
            {!compras || compras.elementos.length === 0 ? (
              <VacioCompacto>Sin compras.</VacioCompacto>
            ) : (
              <ul className="divide-y divide-borde">
                {compras.elementos.map((c) => (
                  <li key={c.id} className="grid gap-3 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-0.5">
                        <span className="text-sm font-medium">
                          {TIPO_COMPRA[c.tipo]} · {c.plan.servicio} · {c.plan.nombre}
                        </span>
                        <span className="text-xs text-tinta-tenue">
                          <Link
                            href={`/admin/suscripciones/${c.suscripcion.id}`}
                            className="hover:text-marca hover:underline"
                          >
                            {c.cliente.nombre}
                          </Link>{' '}
                          · {formatearFechaHora(c.creadoEn)}
                          {c.motivoReembolso ? ` · Reembolso: ${c.motivoReembolso}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">
                          {formatearMonto(c.precioUsd, 'USD')}
                        </span>
                        <EstadoCompraInsignia estado={c.estado} />
                      </div>
                    </div>
                    {puedeGestionar && c.estado === 'completada' && (
                      <AccionConMotivo
                        ruta={`/revendedores/compras/${c.id}/reembolsar`}
                        boton="Reembolsar"
                        confirmar="Reembolsar compra"
                        etiqueta="Motivo del reembolso"
                        ayuda={`Se devuelven ${formatearMonto(c.precioUsd, 'USD')} al saldo y se cancela la suscripción de ${c.cliente.nombre}. Solo se puede hacer una vez.`}
                        peligro
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Recargas" descripcion="Las 10 más recientes." />
            {!recargas || recargas.elementos.length === 0 ? (
              <VacioCompacto>Sin recargas.</VacioCompacto>
            ) : (
              <ul className="divide-y divide-borde">
                {recargas.elementos.map((x) => (
                  <li
                    key={x.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm sm:px-6"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-medium tabular-nums">
                        {formatearMonto(x.montoRecibido ?? x.montoDeclarado, x.moneda)}
                        {x.montoUsd ? ` → ${formatearMonto(x.montoUsd, 'USD')}` : ''}
                      </span>
                      <span className="text-xs text-tinta-tenue">
                        <span className="font-mono">{x.referencia}</span> · {x.metodo.nombre} ·{' '}
                        {formatearFecha(x.fechaPago)}
                        {x.motivoRechazo ? ` · ${x.motivoRechazo}` : ''}
                        {x.notas ? ` · Nota: ${x.notas}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {x.tieneComprobante && sesion.permisos.includes('pagos.gestionar') && (
                        <a
                          href={`/api/v1/recargas-saldo/${x.id}/comprobante`}
                          target="_blank"
                          rel="noopener"
                          className="text-marca hover:underline"
                          aria-label={`Ver comprobante de ${x.referencia} (se abre en una pestaña nueva)`}
                        >
                          <Paperclip className="size-4" aria-hidden="true" />
                        </a>
                      )}
                      <EstadoRecargaInsignia estado={x.estado} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.recargasEnRevision > 0 && sesion.permisos.includes('pagos.gestionar') && (
              <p className="border-t border-borde px-5 py-3 text-sm sm:px-6">
                <Link
                  href="/admin/revendedores?vista=recargas"
                  className="font-medium text-marca hover:underline"
                >
                  Conciliar recargas en revisión ({r.recargasEnRevision})
                </Link>
              </p>
            )}
          </Tarjeta>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Tarjeta>
            <div className="grid gap-3 px-5 py-5 sm:px-6">
              <p className="text-sm text-tinta-suave">Saldo disponible</p>
              <p className="font-titulo text-3xl font-semibold tabular-nums">
                {formatearMonto(r.saldoUsd, 'USD')}
              </p>
              {puedeGestionar && operativo && (
                <AjustarSaldo revendedorId={r.id} saldoUsd={r.saldoUsd} />
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Condiciones" />
            <div className="grid gap-4 px-5 py-5 sm:px-6">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Nivel</dt>
                  <dd>{r.nivel?.nombre ?? 'Sin asignar'}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Compras por día</dt>
                  <dd>{r.limiteDiarioCompras ?? 'Sin límite'}</dd>
                </div>
              </dl>
              {puedeGestionar && operativo && (
                <EditarCondiciones
                  revendedorId={r.id}
                  nivelId={r.nivel?.id ?? null}
                  limiteDiarioCompras={r.limiteDiarioCompras}
                  niveles={niveles}
                />
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Datos" />
            <dl className="grid gap-3 px-5 py-5 text-sm sm:px-6">
              {datos.map(([k, v]) => (
                <div key={k} className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
              {r.mensaje && (
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Mensaje de la solicitud</dt>
                  <dd className="break-words whitespace-pre-line">{r.mensaje}</dd>
                </div>
              )}
            </dl>
          </Tarjeta>

          {puedeGestionar && (
            <Tarjeta>
              <CabeceraTarjeta titulo="Estado de la cuenta" />
              <div className="grid gap-3 px-5 py-5 text-sm sm:px-6">
                {r.estado === 'solicitud' && (
                  <RevisarSolicitud
                    revendedorId={r.id}
                    nombre={r.usuario.nombre}
                    niveles={niveles}
                  />
                )}
                {r.estado === 'aprobado' && (
                  <>
                    <p className="text-tinta-suave">
                      Suspender bloquea recargas y compras. El revendedor sigue viendo su panel.
                    </p>
                    <AccionConMotivo
                      ruta={`/revendedores/${r.id}/suspender`}
                      boton="Suspender"
                      confirmar="Suspender revendedor"
                      etiqueta="Motivo de la suspensión"
                      ayuda="El revendedor verá este motivo en su panel."
                      peligro
                    />
                  </>
                )}
                {r.estado === 'suspendido' && (
                  <AccionConMotivo
                    ruta={`/revendedores/${r.id}/reactivar`}
                    boton="Reactivar"
                    confirmar="Reactivar revendedor"
                    etiqueta="Motivo de la reactivación"
                  />
                )}
                {r.estado === 'rechazado' && (
                  <p className="text-tinta-suave">
                    Solicitud rechazada. El cliente puede enviarla de nuevo desde su cuenta.
                  </p>
                )}
              </div>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
