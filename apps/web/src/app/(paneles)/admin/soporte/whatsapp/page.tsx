import type { BandejaWhatsApp, ConversacionWhatsAppDetalle } from '@nv/shared';
import clsx from 'clsx';
import { ArrowLeft, Check, CheckCheck, CircleAlert, MessageCircle, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CerrarConversacion,
  RefrescoBandeja,
  ResponderWhatsApp,
  VinculoWhatsAppQr,
} from '@/componentes/admin/whatsapp-bandeja';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'WhatsApp' };

const UUID = /^[0-9a-f-]{36}$/i;

function EstadoEnvio({ estado }: { estado: string | null }) {
  if (estado === 'fallido')
    return (
      <span className="inline-flex items-center gap-1 text-peligro">
        <CircleAlert className="size-3.5" aria-hidden="true" /> No se entregó
      </span>
    );
  if (estado === 'leido')
    return (
      <span className="inline-flex items-center gap-1 text-cian">
        <CheckCheck className="size-3.5" aria-hidden="true" /> Leído
      </span>
    );
  if (estado === 'entregado')
    return (
      <span className="inline-flex items-center gap-1">
        <CheckCheck className="size-3.5" aria-hidden="true" /> Entregado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Check className="size-3.5" aria-hidden="true" /> Enviado
    </span>
  );
}

export default async function BandejaWhatsAppPagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'tickets.gestionar' });
  const puedeVincular = sesion.permisos.includes('automatizaciones.configurar');
  const crudo = await searchParams;
  const estado = crudo.estado === 'cerradas' ? 'cerradas' : 'abiertas';
  const elegida = typeof crudo.c === 'string' && UUID.test(crudo.c) ? crudo.c : null;
  const [{ datos: bandeja }, detalle] = await Promise.all([
    leerApi<BandejaWhatsApp>(`/whatsapp/conversaciones?estado=${estado}`),
    elegida
      ? leerApi<ConversacionWhatsAppDetalle>(`/whatsapp/conversaciones/${elegida}`).then(
          (r) => r.datos,
        )
      : Promise.resolve(null),
  ]);
  const enlace = (c: string | null, e = estado) =>
    `/admin/soporte/whatsapp?${new URLSearchParams({
      ...(e === 'cerradas' ? { estado: e } : {}),
      ...(c ? { c } : {}),
    }).toString()}`;

  const motivo = !bandeja?.canalListo
    ? 'El número de WhatsApp no está vinculado: por ahora responde desde tu teléfono.'
    : detalle && !bandeja.sinVentana && !detalle.ventanaHasta
      ? 'Pasaron más de 24 h desde su último mensaje. WhatsApp solo deja escribirle de nuevo cuando vuelva a escribir (o con una plantilla aprobada).'
      : null;

  return (
    <>
      <RefrescoBandeja />
      <CabeceraPagina
        titulo="WhatsApp"
        descripcion="Lo que los clientes escriben al número de la empresa. Respondes desde aquí y les llega a su WhatsApp."
        acciones={
          <BotonEnlace href="/admin/soporte" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden="true" /> Tickets
          </BotonEnlace>
        }
      />

      {bandeja && puedeVincular && (
        <Tarjeta className="grid gap-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Número de la empresa</h2>
          <VinculoWhatsAppQr inicial={bandeja.vinculo} />
        </Tarjeta>
      )}

      {bandeja && !puedeVincular && !bandeja.canalListo && (
        <Alerta tono="aviso" titulo="Falta conectar el número de la empresa">
          Un administrador tiene que vincular el número de WhatsApp desde esta misma pantalla.
        </Alerta>
      )}

      {!bandeja ? (
        <Alerta tono="peligro" titulo="No pudimos cargar la bandeja">
          Recarga la página en unos segundos.
        </Alerta>
      ) : (
        <Tarjeta className="grid overflow-hidden lg:grid-cols-[22rem_1fr]">
          <nav
            aria-label="Conversaciones de WhatsApp"
            className={clsx('border-borde lg:border-r', detalle && 'hidden lg:block')}
          >
            <div className="flex gap-1 border-b border-borde p-2">
              {(['abiertas', 'cerradas'] as const).map((e) => (
                <Link
                  key={e}
                  href={enlace(null, e)}
                  aria-current={estado === e ? 'page' : undefined}
                  className={clsx(
                    'flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-semibold',
                    estado === e
                      ? 'bg-white/[0.06] text-tinta'
                      : 'text-tinta-suave hover:text-tinta',
                  )}
                >
                  {e === 'abiertas'
                    ? `Abiertas${bandeja.sinLeer ? ` (${bandeja.sinLeer} sin leer)` : ''}`
                    : 'Cerradas'}
                </Link>
              ))}
            </div>
            {bandeja.conversaciones.length === 0 ? (
              <EstadoVacio
                icono={MessageCircle}
                titulo={estado === 'abiertas' ? 'Sin conversaciones abiertas' : 'Nada cerrado'}
              >
                {estado === 'abiertas'
                  ? 'Cuando un cliente escriba al WhatsApp de la empresa, aparece aquí.'
                  : undefined}
              </EstadoVacio>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-borde overflow-y-auto">
                {bandeja.conversaciones.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={enlace(c.id)}
                      aria-current={c.id === elegida ? 'true' : undefined}
                      className={clsx(
                        'grid gap-0.5 px-4 py-3 hover:bg-white/[0.03]',
                        c.id === elegida && 'bg-white/[0.05]',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <b className="truncate text-sm">
                          {c.cliente?.nombre ?? c.nombre ?? c.telefono}
                        </b>
                        <span className="shrink-0 text-xs text-tinta-tenue">
                          {haceCuanto(c.ultimoMensajeEn)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-tinta-suave">
                          {c.ultimoMensaje?.direccion === 'saliente' ? 'Tú: ' : ''}
                          {c.ultimoMensaje?.texto ?? ''}
                        </span>
                        {c.noLeidos > 0 && (
                          <span
                            className="grid min-w-5 shrink-0 place-items-center rounded-full bg-exito px-1.5 text-xs font-bold text-black"
                            aria-label={`${c.noLeidos} sin leer`}
                          >
                            {c.noLeidos}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <section
            aria-label="Conversación"
            className={clsx('flex min-h-[28rem] flex-col', !detalle && 'hidden lg:flex')}
          >
            {!detalle ? (
              <div className="grid flex-1 place-items-center">
                <EstadoVacio icono={MessageCircle} titulo="Elige una conversación">
                  Los mensajes nuevos aparecen solos, sin recargar.
                </EstadoVacio>
              </div>
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3 sm:px-5">
                  <div className="grid gap-0.5">
                    <Link href={enlace(null)} className="text-xs text-tinta-suave lg:hidden">
                      ← Conversaciones
                    </Link>
                    <h2 className="text-base font-semibold">
                      {detalle.cliente?.nombre ?? detalle.nombre ?? detalle.telefono}
                    </h2>
                    <p className="text-xs text-tinta-suave">
                      {detalle.telefono}
                      {bandeja.sinVentana
                        ? ''
                        : detalle.ventanaHasta
                          ? ` · Puedes responder hasta el ${formatearFechaHora(detalle.ventanaHasta)}`
                          : ' · Ventana de 24 h cerrada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detalle.cliente && (
                      <BotonEnlace
                        href={`/admin/clientes/${detalle.cliente.id}`}
                        variante="secundario"
                        tamano="sm"
                      >
                        <UserRound className="size-4" aria-hidden="true" /> Ficha
                      </BotonEnlace>
                    )}
                    <CerrarConversacion conversacionId={detalle.id} cerrada={detalle.cerrada} />
                  </div>
                </header>
                <ol
                  className="grid max-h-[60vh] flex-1 content-start gap-2 overflow-y-auto px-4 py-4 sm:px-5"
                  aria-label="Mensajes"
                >
                  {detalle.mensajes.map((m) => (
                    <li
                      key={m.id}
                      className={clsx(
                        'grid max-w-[85%] gap-1 rounded-2xl px-3.5 py-2 text-sm',
                        m.direccion === 'entrante'
                          ? 'justify-self-start rounded-bl-md bg-white/[0.05]'
                          : 'justify-self-end rounded-br-md bg-exito/15',
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                      <p className="flex flex-wrap justify-end gap-x-2 text-[0.7rem] text-tinta-tenue">
                        {m.autor && <span>{m.autor.nombre}</span>}
                        <time dateTime={m.creadoEn}>{formatearFechaHora(m.creadoEn)}</time>
                        {m.direccion === 'saliente' && <EstadoEnvio estado={m.estado} />}
                      </p>
                    </li>
                  ))}
                </ol>
                <ResponderWhatsApp conversacionId={detalle.id} puede={!motivo} motivo={motivo} />
              </>
            )}
          </section>
        </Tarjeta>
      )}
    </>
  );
}
