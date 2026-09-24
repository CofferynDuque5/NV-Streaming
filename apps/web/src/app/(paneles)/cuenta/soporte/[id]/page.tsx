import type { TicketDetalle } from '@nv/shared';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResponderTicket } from '@/componentes/cliente/soporte';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoTicketInsignia } from '@/componentes/ui/estado';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { CATEGORIA_TICKET } from '@/lib/estados';
import { formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Solicitud de soporte' };

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

  return (
    <>
      <Link
        href="/cuenta/soporte"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Soporte
      </Link>
      <CabeceraPagina
        titulo={t.asunto}
        descripcion={`Solicitud #${t.numero} · ${CATEGORIA_TICKET[t.categoria]}`}
        acciones={<EstadoTicketInsignia estado={t.estado} />}
      />
      <Tarjeta className="max-w-3xl">
        <ol className="grid gap-4 px-5 py-5 sm:px-6" aria-label="Conversación">
          {t.mensajes.map((m) => {
            const propio = m.autor.id === sesion.usuario.id;
            return (
              <li
                key={m.id}
                className={clsx('grid max-w-[85%] gap-1', propio && 'justify-self-end')}
              >
                <p className={clsx('text-xs text-tinta-tenue', propio && 'text-right')}>
                  {propio
                    ? 'Tú'
                    : m.autor.esEquipo
                      ? `${m.autor.nombre} · Equipo NV`
                      : m.autor.nombre}{' '}
                  · {formatearFechaHora(m.creadoEn)}
                </p>
                <p
                  className={clsx(
                    'rounded-2xl px-4 py-3 text-sm whitespace-pre-line',
                    propio ? 'bg-marca-suave' : 'border border-borde bg-elevada',
                  )}
                >
                  {m.texto}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-borde px-5 py-5 sm:px-6">
          {t.estado === 'cerrado' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-tinta-suave">Esta solicitud está cerrada.</p>
              <BotonEnlace href="/cuenta/soporte/nueva" variante="secundario" tamano="sm">
                Abrir una nueva
              </BotonEnlace>
            </div>
          ) : (
            <ResponderTicket ticketId={t.id} resuelto={t.estado === 'resuelto'} />
          )}
        </div>
      </Tarjeta>
    </>
  );
}
