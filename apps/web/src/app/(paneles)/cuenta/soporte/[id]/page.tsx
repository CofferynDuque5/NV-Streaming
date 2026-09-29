import type { TicketDetalle } from '@nv/shared';
import clsx from 'clsx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PildoraEstado } from '@/componentes/cliente/pago';
import {
  CabeceraCuenta,
  ESTADO_SOLICITUD,
  Vacio,
  Volver,
} from '@/componentes/cliente/piezas-cuenta';
import { ResponderTicket } from '@/componentes/cliente/soporte';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { autorMensaje } from '@/lib/automatizaciones';
import { CATEGORIA_TICKET } from '@/lib/estados';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Solicitud de soporte' };

const cuando = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export default async function Solicitud({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  const { id } = await params;
  const { estado, datos: t } = await leerApi<TicketDetalle>(`/mi/tickets/${id}`);
  if (estado === 404 || estado === 400) notFound();
  if (!t) {
    return (
      <Alerta tono="peligro">
        No pudimos cargar la solicitud. Recarga la página en un momento.
      </Alerta>
    );
  }
  const [texto, tono] = ESTADO_SOLICITUD[t.estado];

  return (
    <>
      <Volver href="/cuenta/soporte">Mis solicitudes</Volver>
      <CabeceraCuenta
        pequena
        titulo={t.asunto}
        descripcion={`Solicitud #${t.numero} · ${CATEGORIA_TICKET[t.categoria]}`}
        accion={<PildoraEstado texto={texto} tono={tono} />}
      />
      <ol className="grid gap-2.5" aria-label="Conversación">
        {t.mensajes.map((m) => {
          const autor = autorMensaje(m);
          const propio = autor.id === sesion.usuario.id;
          return (
            <li
              key={m.id}
              className={clsx(
                'grid max-w-[88%] gap-1 rounded-[1.125rem] border px-3.5 py-2.5 text-sm',
                propio
                  ? 'justify-self-end rounded-br-md border-marca/35 bg-marca/[0.14]'
                  : 'justify-self-start rounded-bl-md border-borde bg-[rgb(10_14_32/0.7)]',
              )}
            >
              <small className="text-[0.72rem] text-tinta-tenue">
                {propio
                  ? 'Tú'
                  : autor.esEquipo && !autor.sistema
                    ? `${autor.nombre} · Equipo NV`
                    : autor.nombre}{' '}
                · {cuando.format(new Date(m.creadoEn))}
              </small>
              <p className="break-words whitespace-pre-line">{m.texto}</p>
            </li>
          );
        })}
      </ol>
      {t.estado === 'cerrado' ? (
        <Vacio
          accion={
            <BotonEnlace href="/cuenta/soporte/nueva" variante="secundario" tamano="sm">
              Abrir una nueva
            </BotonEnlace>
          }
        >
          Esta solicitud está cerrada.
        </Vacio>
      ) : (
        <ResponderTicket ticketId={t.id} resuelto={t.estado === 'resuelto'} />
      )}
    </>
  );
}
