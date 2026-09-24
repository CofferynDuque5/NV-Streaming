import type { MensajeTicketPublico, Referencia, TicketDetalle } from '@nv/shared';
import clsx from 'clsx';
import { AlarmClock, CircleCheck, Clock, Lock, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cargarEquipo } from '@/componentes/admin/equipo-servidor';
import { Iniciales, ListaDatos, Volver } from '@/componentes/admin/piezas-crm';
import { GestionTicket, ResponderTicket } from '@/componentes/admin/soporte';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoTicketInsignia, PrioridadInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { CATEGORIA_TICKET, ESTADO_TICKET, PRIORIDAD_TICKET } from '@/lib/estados';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ticket de soporte' };

function Mensaje({ m }: { m: MensajeTicketPublico }) {
  const delEquipo = m.autor.esEquipo;
  return (
    <li className={clsx('flex items-end gap-2.5', delEquipo ? 'flex-row-reverse' : 'flex-row')}>
      <Iniciales
        nombre={m.autor.nombre}
        tono={m.interno ? 'aviso' : delEquipo ? 'marca' : 'neutro'}
        tamano="sm"
      />
      <div
        className={clsx(
          'grid max-w-[min(34rem,85%)] gap-1',
          delEquipo ? 'justify-items-end' : 'justify-items-start',
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs text-tinta-tenue">
          <span className="font-medium text-tinta-suave">{m.autor.nombre}</span>
          <span>{delEquipo ? 'Equipo NV' : 'Cliente'}</span>
          <time dateTime={m.creadoEn} title={formatearFechaHora(m.creadoEn)}>
            {haceCuanto(m.creadoEn)}
          </time>
        </p>
        <div
          className={clsx(
            'rounded-2xl border px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-line',
            m.interno
              ? 'rounded-br-md border-dashed border-aviso/40 bg-aviso-suave text-tinta'
              : delEquipo
                ? 'rounded-br-md border-marca/25 bg-marca-suave text-tinta'
                : 'rounded-bl-md border-borde bg-hundida text-tinta',
          )}
        >
          {m.interno && (
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-aviso">
              <Lock className="size-3.5" aria-hidden="true" /> Nota interna: el cliente no la ve
            </p>
          )}
          {m.texto}
        </div>
      </div>
    </li>
  );
}

/** Estado del plazo de primera respuesta. */
function PlazoRespuesta({ t }: { t: TicketDetalle }) {
  if (t.primeraRespuestaEn) {
    const aTiempo = t.primeraRespuestaEn <= t.slaPrimeraRespuesta;
    return (
      <div className="flex items-start gap-3">
        <CircleCheck
          className={clsx('mt-0.5 size-5 shrink-0', aTiempo ? 'text-exito' : 'text-aviso')}
          aria-hidden="true"
        />
        <div className="grid gap-0.5 text-sm">
          <p className="font-medium">
            {aTiempo ? 'Respondido a tiempo' : 'Respondido fuera de plazo'}
          </p>
          <p className="text-tinta-suave">
            Primera respuesta el {formatearFechaHora(t.primeraRespuestaEn)}.
          </p>
        </div>
      </div>
    );
  }
  if (t.slaIncumplido) {
    return (
      <div className="flex items-start gap-3">
        <AlarmClock className="mt-0.5 size-5 shrink-0 text-peligro" aria-hidden="true" />
        <div className="grid gap-0.5 text-sm">
          <p className="font-medium text-peligro">Plazo vencido</p>
          <p className="text-tinta-suave">
            Debía responderse antes del {formatearFechaHora(t.slaPrimeraRespuesta)} (
            {haceCuanto(t.slaPrimeraRespuesta)}).
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <Clock className="mt-0.5 size-5 shrink-0 text-aviso" aria-hidden="true" />
      <div className="grid gap-0.5 text-sm">
        <p className="font-medium">Responder {haceCuanto(t.slaPrimeraRespuesta)}</p>
        <p className="text-tinta-suave">
          Límite: {formatearFechaHora(t.slaPrimeraRespuesta)}. Las notas internas no cuentan como
          respuesta.
        </p>
      </div>
    </div>
  );
}

export default async function DetalleTicket({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'tickets.ver' });
  const { id } = await params;
  const puedeGestionar = sesion.permisos.includes('tickets.gestionar');
  const puedeListarEquipo = sesion.permisos.includes('usuarios.ver');

  const [{ estado, datos: t }, equipo] = await Promise.all([
    leerApi<TicketDetalle>(`/tickets/${encodeURIComponent(id)}`),
    puedeGestionar && puedeListarEquipo
      ? cargarEquipo(['operador', 'admin'])
      : Promise.resolve(null),
  ]);
  if (estado === 404 || estado === 400 || !t) notFound();

  const yo: Referencia | null = ['admin', 'operador'].includes(sesion.usuario.rol)
    ? { id: sesion.usuario.id, nombre: sesion.usuario.nombre }
    : null;
  const mensajes = [...t.mensajes].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  return (
    <>
      <Volver href="/admin/soporte">Soporte</Volver>

      <header className="grid gap-2">
        <p className="font-mono text-sm text-tinta-tenue">Ticket #{t.numero}</p>
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{t.asunto}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <EstadoTicketInsignia estado={t.estado} />
          <PrioridadInsignia prioridad={t.prioridad} />
          <Insignia>{CATEGORIA_TICKET[t.categoria]}</Insignia>
          {t.slaIncumplido && <Insignia tono="peligro">Plazo vencido</Insignia>}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta className="min-w-0">
          <CabeceraTarjeta
            titulo="Conversación"
            descripcion={
              mensajes.length === 1
                ? '1 mensaje'
                : `${mensajes.length} mensajes, del primero al último`
            }
          />
          {mensajes.length === 0 ? (
            <EstadoVacio icono={MessagesSquare} titulo="Sin mensajes todavía" />
          ) : (
            <ol className="grid gap-5 px-4 py-6 sm:px-6" aria-label="Mensajes del ticket">
              {mensajes.map((m) => (
                <Mensaje key={m.id} m={m} />
              ))}
            </ol>
          )}
          {puedeGestionar &&
            (t.estado === 'cerrado' ? (
              <div className="border-t border-borde px-5 py-5 sm:px-6">
                <Alerta tono="info">
                  Este ticket está cerrado. Para responder, cambia antes su estado en el panel de
                  gestión.
                </Alerta>
              </div>
            ) : (
              <ResponderTicket id={t.id} />
            ))}
        </Tarjeta>

        <aside className="grid min-w-0 gap-6" aria-label="Datos del ticket">
          <Tarjeta>
            <CabeceraTarjeta titulo="Gestión" />
            {puedeGestionar ? (
              <GestionTicket
                id={t.id}
                estado={t.estado}
                prioridad={t.prioridad}
                asignadoA={t.asignadoA}
                equipo={equipo}
                yo={yo}
              />
            ) : (
              <ListaDatos
                columnas={1}
                datos={[
                  ['Estado', ESTADO_TICKET[t.estado].texto],
                  ['Prioridad', PRIORIDAD_TICKET[t.prioridad].texto],
                  ['Asignado a', t.asignadoA?.nombre ?? 'Sin asignar'],
                ]}
              />
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Cliente" />
            <Link
              href={`/admin/clientes/${t.cliente.id}`}
              className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-hundida/60"
            >
              <Iniciales nombre={t.cliente.nombre} />
              <span className="grid min-w-0">
                <span className="truncate text-sm font-medium group-hover:text-marca">
                  {t.cliente.nombre}
                </span>
                <span className="text-xs text-tinta-tenue">Ver su ficha</span>
              </span>
            </Link>
            {t.suscripcionId && (
              <Link
                href={`/admin/suscripciones/${t.suscripcionId}`}
                className="block border-t border-borde px-5 py-3 text-sm text-marca underline-offset-2 hover:underline"
              >
                Ver la suscripción relacionada
              </Link>
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta titulo="Plazo de respuesta" />
            <div className="px-5 py-4">
              <PlazoRespuesta t={t} />
            </div>
            <ListaDatos
              columnas={1}
              className="border-t border-borde"
              datos={[
                ['Abierto', formatearFechaHora(t.creadoEn)],
                [
                  'Última actividad',
                  `${formatearFechaHora(t.actualizadoEn)} (${haceCuanto(t.actualizadoEn)})`,
                ],
              ]}
            />
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
