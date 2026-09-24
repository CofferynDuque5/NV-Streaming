import {
  ESTADOS_SUSCRIPCION,
  formatearMonto,
  type MetricasPanel,
  type Pagina,
  type RegistroAuditoria,
} from '@nv/shared';
import { ArrowRight, CalendarClock, FileClock, Headset, Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HojaDeRuta } from '@/componentes/panel/hoja-de-ruta';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ESTADO_SUSCRIPCION } from '@/lib/estados';
import { ACCIONES_AUDITORIA, diasHasta, formatearFecha, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Resumen' };

function Cifra({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5 bg-superficie px-5 py-5 sm:px-6">
      <dt className="text-xs font-medium text-tinta-tenue">{etiqueta}</dt>
      <dd className="font-titulo text-[1.75rem] leading-none font-semibold tabular-nums">
        {valor}
      </dd>
      {detalle && <dd className="text-xs text-tinta-suave">{detalle}</dd>}
    </div>
  );
}

function Pendiente({
  href,
  icono: Icono,
  cantidad,
  texto,
  urgente,
}: {
  href: string;
  icono: typeof Receipt;
  cantidad: number;
  texto: string;
  urgente?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-nv border border-borde bg-superficie px-5 py-4 shadow-nv transition-colors hover:border-borde-fuerte"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
          urgente && cantidad > 0
            ? 'border-aviso/30 bg-aviso-suave text-aviso'
            : 'border-borde bg-hundida text-marca'
        }`}
      >
        <Icono className="size-5" aria-hidden="true" />
      </span>
      <span className="grid flex-1 gap-0.5">
        <span className="font-titulo text-xl leading-none font-semibold tabular-nums">
          {cantidad}
        </span>
        <span className="text-sm text-tinta-suave">{texto}</span>
      </span>
      <ArrowRight
        className="size-4 text-tinta-tenue transition-transform group-hover:translate-x-0.5 group-hover:text-tinta"
        aria-hidden="true"
      />
    </Link>
  );
}

export default async function ResumenAdmin() {
  const sesion = await requerirSesion();
  const permisos = sesion.permisos;
  const [metricas, actividad] = await Promise.all([
    permisos.includes('metricas.ver')
      ? leerApi<MetricasPanel>('/metricas/panel').then((r) => r.datos)
      : null,
    permisos.includes('auditoria.ver')
      ? leerApi<Pagina<RegistroAuditoria>>('/auditoria?porPagina=6').then(
          (r) => r.datos?.elementos ?? [],
        )
      : null,
  ]);

  const activas = metricas
    ? metricas.suscripcionesPorEstado.activa + metricas.suscripcionesPorEstado.en_gracia
    : 0;
  const totalSuscripciones = metricas
    ? Object.values(metricas.suscripcionesPorEstado).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <CabeceraPagina
        titulo={`Hola, ${sesion.usuario.nombre.split(' ')[0]}`}
        descripcion={
          metricas?.soloCartera
            ? 'Estas cifras son solo de tu cartera de clientes.'
            : 'Así va NV Streaming hoy.'
        }
      />

      {metricas &&
        metricas.tasasFaltantes.length > 0 &&
        permisos.includes('finanzas.configurar') && (
          <Alerta tono="aviso" titulo="Faltan tasas de cambio">
            Sin tasa no se puede cobrar en {metricas.tasasFaltantes.join(', ')}.{' '}
            <Link href="/admin/finanzas" className="font-medium text-marca hover:underline">
              Registrar tasas
            </Link>
          </Alerta>
        )}

      {metricas && (
        <>
          <Tarjeta>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-nv bg-borde sm:grid-cols-2 lg:grid-cols-4">
              <Cifra
                etiqueta="Ingreso recurrente mensual"
                valor={
                  metricas.enBolivares
                    ? formatearMonto(metricas.enBolivares.ingresoMensualRecurrente, 'VES')
                    : formatearMonto(metricas.ingresoMensualRecurrenteUsd, 'USD')
                }
                detalle={
                  metricas.enBolivares
                    ? `${formatearMonto(metricas.ingresoMensualRecurrenteUsd, 'USD')} a la tasa de hoy (${formatearMonto(metricas.enBolivares.tasa, 'VES')} por dólar)`
                    : 'Estimado de las suscripciones activas'
                }
              />
              <Cifra
                etiqueta="Cobrado este mes"
                valor={
                  metricas.enBolivares
                    ? formatearMonto(metricas.enBolivares.ingresosMes, 'VES')
                    : formatearMonto(metricas.ingresosMesUsd, 'USD')
                }
                detalle={
                  metricas.ingresosMes.length > 0
                    ? `Recibido: ${metricas.ingresosMes.map((i) => formatearMonto(i.total, i.moneda)).join(' · ')}`
                    : 'Aún no hay pagos confirmados este mes'
                }
              />
              <Cifra
                etiqueta="Clientes activos"
                valor={String(metricas.clientesActivos)}
                detalle={`${metricas.clientesNuevosMes} nuevos este mes`}
              />
              <Cifra
                etiqueta="Suscripciones activas"
                valor={String(activas)}
                detalle={
                  metricas.suscripcionesPorEstado.en_gracia > 0
                    ? `${metricas.suscripcionesPorEstado.en_gracia} en periodo de gracia`
                    : 'Ninguna en periodo de gracia'
                }
              />
            </dl>
          </Tarjeta>

          <div className="grid gap-3 md:grid-cols-3">
            {permisos.includes('pagos.gestionar') && (
              <Pendiente
                href="/admin/cobros"
                icono={Receipt}
                cantidad={metricas.pagosEnRevision}
                texto="pagos por conciliar"
                urgente
              />
            )}
            <Pendiente
              href="/admin/cobros?vista=facturas&vencidas=true"
              icono={CalendarClock}
              cantidad={metricas.facturasVencidas}
              texto="facturas vencidas sin pagar"
              urgente
            />
            <Pendiente
              href="/admin/soporte"
              icono={Headset}
              cantidad={metricas.ticketsAbiertos}
              texto={
                metricas.ticketsSlaIncumplido > 0
                  ? `tickets abiertos, ${metricas.ticketsSlaIncumplido} fuera de plazo`
                  : 'tickets abiertos'
              }
              urgente={metricas.ticketsSlaIncumplido > 0}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Vencen en los próximos 7 días"
                accion={
                  <Link
                    href="/admin/suscripciones?vencenEnDias=7"
                    className="text-sm font-medium text-marca hover:underline"
                  >
                    Ver todas
                  </Link>
                }
              />
              {metricas.proximosVencimientos.length === 0 ? (
                <EstadoVacio icono={CalendarClock} titulo="Nada vence esta semana" />
              ) : (
                <ul className="divide-y divide-borde">
                  {metricas.proximosVencimientos.map((s) => {
                    const dias = s.venceEn ? diasHasta(s.venceEn) : 0;
                    return (
                      <li
                        key={s.id}
                        className="relative flex items-center gap-4 px-5 py-3 hover:bg-hundida/60 sm:px-6"
                      >
                        <div className="grid min-w-0 flex-1">
                          <Link
                            href={`/admin/suscripciones/${s.id}`}
                            className="truncate text-sm font-medium after:absolute after:inset-0"
                          >
                            {s.cliente.nombre}
                          </Link>
                          <span className="truncate text-xs text-tinta-tenue">
                            {s.plan.servicio} · {s.plan.nombre}
                          </span>
                        </div>
                        <EstadoSuscripcionInsignia estado={s.estado} />
                        <span className="w-24 shrink-0 text-right text-xs text-tinta-suave">
                          {dias <= 0 ? 'Vencida' : dias === 1 ? 'Mañana' : `En ${dias} días`}
                          <br />
                          <span className="text-tinta-tenue">
                            {s.venceEn && formatearFecha(s.venceEn)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Tarjeta>

            <Tarjeta>
              <CabeceraTarjeta
                titulo="Suscripciones por estado"
                descripcion={`${totalSuscripciones} en total`}
              />
              <ul className="grid gap-3 px-5 py-4 sm:px-6">
                {ESTADOS_SUSCRIPCION.map((estado) => {
                  const n = metricas.suscripcionesPorEstado[estado];
                  const ancho = totalSuscripciones ? (n / totalSuscripciones) * 100 : 0;
                  return (
                    <li key={estado} className="grid gap-1.5">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-tinta-suave">{ESTADO_SUSCRIPCION[estado].texto}</span>
                        <span className="font-medium tabular-nums">{n}</span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-hundida"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-marca"
                          style={{ width: `${ancho}%`, minWidth: n > 0 ? '4px' : 0 }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          </div>
        </>
      )}

      {actividad && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Actividad reciente"
            accion={
              <Link
                href="/admin/auditoria"
                className="text-sm font-medium text-marca hover:underline"
              >
                Ver auditoría
              </Link>
            }
          />
          {actividad.length === 0 ? (
            <EstadoVacio icono={FileClock} titulo="Sin actividad todavía" />
          ) : (
            <ul className="divide-y divide-borde">
              {actividad.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"
                >
                  <div className="grid min-w-0">
                    <span className="truncate text-sm">
                      {ACCIONES_AUDITORIA[e.accion] ?? e.accion}
                    </span>
                    <span className="truncate text-xs text-tinta-tenue">
                      {e.actor?.nombre ?? (e.actorTipo === 'sistema' ? 'Sistema' : 'Asistente IA')}
                    </span>
                  </div>
                  <time dateTime={e.fecha} className="shrink-0 text-xs text-tinta-tenue">
                    {haceCuanto(e.fecha)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}

      {!metricas && (
        <Alerta tono="info" titulo="Sin métricas para tu rol">
          Usa el menú para ir a tus módulos.
        </Alerta>
      )}

      <HojaDeRuta actual={1} />
    </>
  );
}
