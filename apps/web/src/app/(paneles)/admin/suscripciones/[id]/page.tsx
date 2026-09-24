import { INFO_MONEDA, type SuscripcionDetalle } from '@nv/shared';
import { History } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListaDatos, relativoDias, Volver } from '@/componentes/admin/piezas-crm';
import { AccionesSuscripcion } from '@/componentes/admin/suscripciones';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { EVENTO_SUSCRIPCION } from '@/lib/estados';
import { formatearDuracion, formatearFecha, formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Detalle de la suscripción' };

/** Color del punto de cada evento en el historial. */
const TONO_EVENTO: Record<string, string> = {
  alta: 'bg-marca',
  activacion: 'bg-exito',
  renovacion: 'bg-exito',
  reanudacion: 'bg-exito',
  recuperacion: 'bg-exito',
  cancelacion_revertida: 'bg-exito',
  pausa: 'bg-tinta-tenue',
  cancelacion_programada: 'bg-aviso',
  vencimiento: 'bg-aviso',
  cancelacion: 'bg-peligro',
  suspension: 'bg-peligro',
};

function Tenue({ children }: { children: string }) {
  return <span className="text-tinta-tenue">{children}</span>;
}

export default async function DetalleSuscripcion({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'suscripciones.ver' });
  const { id } = await params;
  const { estado, datos: s } = await leerApi<SuscripcionDetalle>(
    `/suscripciones/${encodeURIComponent(id)}`,
  );
  if (estado === 404 || estado === 400 || !s) notFound();

  const puedeRenovar = sesion.permisos.includes('suscripciones.crear');
  const puedeGestionar = sesion.permisos.includes('suscripciones.gestionar');
  const vence = s.venceEn ? relativoDias(s.venceEn) : null;
  const eventos = [...s.eventos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  return (
    <>
      <Volver href="/admin/suscripciones">Suscripciones</Volver>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold sm:text-[1.75rem]">
            {s.plan.servicio} · {s.plan.nombre}
          </h1>
          <EstadoSuscripcionInsignia estado={s.estado} />
          {s.cancelarAlVencer && <Insignia tono="aviso">Cancela al vencer</Insignia>}
        </div>
        <p className="text-sm text-tinta-suave">
          De{' '}
          <Link
            href={`/admin/clientes/${s.cliente.id}`}
            className="font-medium text-tinta underline-offset-2 hover:text-marca hover:underline"
          >
            {s.cliente.nombre}
          </Link>{' '}
          · {formatearDuracion(s.plan.duracionCantidad, s.plan.duracionUnidad)} · en {s.moneda}
        </p>
      </header>

      {s.estado === 'pendiente_pago' && (
        <Alerta tono="aviso" titulo="Esperando el primer pago">
          Se activará en cuanto se confirme el pago de su factura
          {s.facturaAbierta ? (
            <>
              {' '}
              <Link
                href={`/admin/cobros/facturas/${s.facturaAbierta.id}`}
                className="font-medium text-marca underline-offset-2 hover:underline"
              >
                {s.facturaAbierta.numero}
              </Link>
            </>
          ) : null}
          .
        </Alerta>
      )}

      <Tarjeta>
        <CabeceraTarjeta titulo="Resumen" />
        <ListaDatos
          columnas={3}
          datos={[
            [
              'Cliente',
              <Link
                key="cliente"
                href={`/admin/clientes/${s.cliente.id}`}
                className="font-medium text-marca underline-offset-2 hover:underline"
              >
                {s.cliente.nombre}
              </Link>,
            ],
            [
              'Plan',
              `${s.plan.servicio} · ${s.plan.nombre} (${formatearDuracion(s.plan.duracionCantidad, s.plan.duracionUnidad)})`,
            ],
            ['Estado', <EstadoSuscripcionInsignia key="estado" estado={s.estado} />],
            ['Moneda', `${s.moneda} · ${INFO_MONEDA[s.moneda].nombre}`],
            ['Inicio', s.inicioEn ? formatearFecha(s.inicioEn) : <Tenue>Aún no ha empezado</Tenue>],
            [
              'Vencimiento',
              s.venceEn && vence ? (
                <span>
                  {formatearFecha(s.venceEn)}{' '}
                  <span className={`text-xs ${vence.tono}`}>({vence.texto})</span>
                </span>
              ) : (
                <Tenue>Sin fecha todavía</Tenue>
              ),
            ],
            [
              'Cancelación programada',
              s.cancelarAlVencer ? (
                <span className="text-aviso">
                  Sí{s.venceEn ? `, termina el ${formatearFecha(s.venceEn)}` : ''}
                </span>
              ) : (
                'No'
              ),
            ],
            [
              'Factura abierta',
              s.facturaAbierta ? (
                <Link
                  key="factura"
                  href={`/admin/cobros/facturas/${s.facturaAbierta.id}`}
                  className="font-mono text-marca underline-offset-2 hover:underline"
                >
                  {s.facturaAbierta.numero}
                </Link>
              ) : (
                <Tenue>Ninguna</Tenue>
              ),
            ],
            ['Renovable', s.plan.renovable ? 'Sí' : 'No, el plan es de un solo periodo'],
            ...(s.estado === 'pausada' && s.pausadaEn
              ? ([['Pausada desde', formatearFechaHora(s.pausadaEn)]] as [string, string][])
              : []),
            ...(s.canceladaEn
              ? ([['Cancelada el', formatearFechaHora(s.canceladaEn)]] as [string, string][])
              : []),
            ['Creada', formatearFechaHora(s.creadoEn)],
          ]}
        />
      </Tarjeta>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Tarjeta className="min-w-0">
          <CabeceraTarjeta
            titulo="Historial"
            descripcion="Cada cambio de estado, quién lo hizo y por qué."
          />
          {eventos.length === 0 ? (
            <EstadoVacio icono={History} titulo="Sin eventos todavía" />
          ) : (
            <ol className="px-5 py-5 sm:px-6">
              {eventos.map((ev, i) => (
                <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < eventos.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-borde-fuerte"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={`relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-superficie ${TONO_EVENTO[ev.tipo] ?? 'bg-marca'}`}
                  />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <p className="text-sm font-medium">
                        {EVENTO_SUSCRIPCION[ev.tipo] ?? ev.tipo}
                      </p>
                      <time dateTime={ev.creadoEn} className="text-xs text-tinta-tenue">
                        {formatearFechaHora(ev.creadoEn)}
                      </time>
                    </div>
                    <p className="text-xs text-tinta-suave">
                      {ev.actor ? `Por ${ev.actor.nombre}` : 'Automático del sistema'}
                    </p>
                    {ev.motivo && (
                      <p className="mt-1 rounded-lg border border-borde bg-hundida px-3 py-2 text-sm break-words text-tinta-suave">
                        {ev.motivo}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta className="min-w-0">
          <CabeceraTarjeta
            titulo="Acciones"
            descripcion="Cada acción queda en el historial y en la auditoría."
          />
          <AccionesSuscripcion
            id={s.id}
            estado={s.estado}
            moneda={s.moneda}
            cancelarAlVencer={s.cancelarAlVencer}
            renovable={s.plan.renovable}
            facturaAbierta={s.facturaAbierta}
            puedeRenovar={puedeRenovar}
            puedeGestionar={puedeGestionar}
          />
        </Tarjeta>
      </div>
    </>
  );
}
