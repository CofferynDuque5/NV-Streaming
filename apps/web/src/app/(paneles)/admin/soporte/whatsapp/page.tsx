import type {
  BandejaWhatsApp,
  ConversacionWhatsAppDetalle,
  ConversacionWhatsAppResumen,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CircleAlert,
  MessageCircle,
  Phone,
  UserRound,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import {
  CerrarConversacion,
  ListaAlFinal,
  RefrescoBandeja,
  ResponderWhatsApp,
  VinculoWhatsAppQr,
} from '@/componentes/admin/whatsapp-bandeja';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { leerApi } from '@/lib/api-servidor';
import { claveDia, etiquetaDia, formatearFechaHora, formatearHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'WhatsApp' };

const UUID = /^[0-9a-f-]{36}$/i;

/** Colores de las iniciales de cada conversación (siempre el mismo para el mismo número). */
const TONOS = [
  'bg-[linear-gradient(135deg,#22c55e,#0ea5e9)]',
  'bg-[linear-gradient(135deg,#8b5cf6,#d946ef)]',
  'bg-[linear-gradient(135deg,#f59e0b,#ef4444)]',
  'bg-[linear-gradient(135deg,#3b82f6,#8b5cf6)]',
  'bg-[linear-gradient(135deg,#14b8a6,#22c55e)]',
];

function nombreDe(c: ConversacionWhatsAppResumen) {
  return c.cliente?.nombre ?? c.nombre ?? c.telefono;
}

function Iniciales({ c, className }: { c: ConversacionWhatsAppResumen; className: string }) {
  const nombre = c.cliente?.nombre ?? c.nombre;
  const letras = nombre
    ? nombre
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : null;
  const tono = TONOS[[...c.telefono].reduce((n, d) => n + d.charCodeAt(0), 0) % TONOS.length];
  return (
    <i
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-titulo font-bold text-white not-italic',
        tono,
        className,
      )}
    >
      {letras ?? <Phone className="size-[45%]" />}
    </i>
  );
}

function EstadoEnvio({ estado }: { estado: string | null }) {
  if (estado === 'fallido')
    return (
      <span className="inline-flex items-center gap-1 text-peligro">
        <CircleAlert className="size-3.5" aria-hidden="true" /> No se entregó
      </span>
    );
  if (estado === 'leido')
    return (
      <span className="inline-flex text-cian" title="Leído">
        <CheckCheck className="size-4" aria-hidden="true" />
        <span className="sr-only">Leído</span>
      </span>
    );
  if (estado === 'entregado')
    return (
      <span className="inline-flex" title="Entregado">
        <CheckCheck className="size-4" aria-hidden="true" />
        <span className="sr-only">Entregado</span>
      </span>
    );
  return (
    <span className="inline-flex" title="Enviado">
      <Check className="size-4" aria-hidden="true" />
      <span className="sr-only">Enviado</span>
    </span>
  );
}

/** Hora si fue hoy; si no, «Ayer» o la fecha corta. */
function cuando(iso: string) {
  const dia = etiquetaDia(iso);
  return dia === 'Hoy' ? formatearHora(iso) : dia;
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
  const conectado = bandeja?.vinculo.estado === 'conectado';

  return (
    <>
      <RefrescoBandeja />
      {/* En el teléfono, con un chat abierto, el chat ocupa la pantalla (tiene su flecha para volver). */}
      <div className={clsx('grid gap-5.5', detalle && 'max-lg:hidden')}>
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
          <section
            aria-label="Número de la empresa"
            className={clsx(
              'rounded-[1.25rem] border',
              conectado
                ? 'border-exito/30 bg-exito/[0.06] px-4 py-2.5'
                : 'border-borde bg-superficie/80 p-4 sm:p-5',
            )}
          >
            <VinculoWhatsAppQr inicial={bandeja.vinculo} />
          </section>
        )}
      </div>

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
        <div
          className={clsx(
            'grid min-h-[30rem] overflow-hidden rounded-[1.25rem] border border-borde bg-[rgb(8_11_26/0.85)] lg:grid-cols-[21rem_minmax(0,1fr)]',
            // Cabe entero en la pantalla: el que escribe siempre ve la caja de respuesta.
            puedeVincular ? 'nav:h-[calc(100dvh-17rem)]' : 'nav:h-[calc(100dvh-13rem)]',
            detalle ? 'max-nav:h-[calc(100dvh-12.5rem)]' : 'max-nav:h-[calc(100dvh-20rem)]',
          )}
        >
          <nav
            aria-label="Conversaciones de WhatsApp"
            className={clsx(
              'flex min-h-0 flex-col border-borde lg:border-r',
              detalle && 'max-lg:hidden',
            )}
          >
            <div className="flex shrink-0 gap-1 border-b border-borde p-2">
              {(['abiertas', 'cerradas'] as const).map((e) => (
                <Link
                  key={e}
                  href={enlace(null, e)}
                  aria-current={estado === e ? 'page' : undefined}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold',
                    estado === e
                      ? 'bg-white/[0.07] text-tinta'
                      : 'text-tinta-suave hover:text-tinta',
                  )}
                >
                  {e === 'abiertas' ? 'Abiertas' : 'Cerradas'}
                  {e === 'abiertas' && bandeja.sinLeer > 0 && (
                    <em className="grid h-5 min-w-5 place-items-center rounded-full bg-exito px-1.5 text-[0.68rem] font-bold text-black not-italic">
                      {bandeja.sinLeer}
                      <span className="sr-only"> sin leer</span>
                    </em>
                  )}
                </Link>
              ))}
            </div>
            {bandeja.conversaciones.length === 0 ? (
              <div className="grid flex-1 place-items-center p-4">
                <EstadoVacio
                  icono={MessageCircle}
                  titulo={estado === 'abiertas' ? 'Sin conversaciones abiertas' : 'Nada cerrado'}
                >
                  {estado === 'abiertas'
                    ? 'Cuando un cliente escriba al WhatsApp de la empresa, aparece aquí.'
                    : undefined}
                </EstadoVacio>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                {bandeja.conversaciones.map((c) => {
                  const marcada = c.id === elegida;
                  return (
                    <li key={c.id}>
                      <Link
                        href={enlace(c.id)}
                        aria-current={marcada ? 'true' : undefined}
                        className={clsx(
                          'flex items-center gap-3 border-b border-borde/60 px-3.5 py-3',
                          marcada ? 'bg-marca/[0.14]' : 'hover:bg-white/[0.03]',
                        )}
                      >
                        <Iniciales c={c} className="size-11 text-sm" />
                        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <b className="min-w-0 flex-1 truncate text-sm">{nombreDe(c)}</b>
                            <span
                              className={clsx(
                                'shrink-0 text-[0.7rem]',
                                c.noLeidos > 0 ? 'font-semibold text-exito' : 'text-tinta-tenue',
                              )}
                            >
                              {cuando(c.ultimoMensajeEn)}
                            </span>
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[0.82rem] text-tinta-suave">
                              {c.ultimoMensaje?.direccion === 'saliente' ? 'Tú: ' : ''}
                              {c.ultimoMensaje?.texto ?? ''}
                            </span>
                            {c.noLeidos > 0 && (
                              <span
                                className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-exito px-1.5 text-[0.68rem] font-bold text-black"
                                aria-label={`${c.noLeidos} sin leer`}
                              >
                                {c.noLeidos}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <section
            aria-label="Conversación"
            className={clsx('flex min-h-0 flex-col', !detalle && 'max-lg:hidden')}
          >
            {!detalle ? (
              <div className="grid flex-1 place-items-center p-6">
                <EstadoVacio icono={MessageCircle} titulo="Elige una conversación">
                  Los mensajes nuevos aparecen solos, sin recargar.
                </EstadoVacio>
              </div>
            ) : (
              <>
                <header className="flex shrink-0 items-center gap-3 border-b border-borde px-3 py-2.5 sm:px-4">
                  <Link
                    href={enlace(null)}
                    className="grid size-9 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] lg:hidden"
                    aria-label="Volver a las conversaciones"
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </Link>
                  <Iniciales c={detalle} className="size-10 text-sm" />
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <h2 className="truncate text-[0.95rem] font-semibold">{nombreDe(detalle)}</h2>
                    <p className="truncate text-xs text-tinta-suave">
                      {detalle.telefono}
                      {bandeja.sinVentana
                        ? ''
                        : detalle.ventanaHasta
                          ? ` · Puedes responder hasta el ${formatearFechaHora(detalle.ventanaHasta)}`
                          : ' · Ventana de 24 h cerrada'}
                    </p>
                  </div>
                  {detalle.cliente && (
                    <BotonEnlace
                      href={`/admin/clientes/${detalle.cliente.id}`}
                      variante="secundario"
                      tamano="sm"
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      <span className="max-sm:sr-only">Ficha</span>
                    </BotonEnlace>
                  )}
                  <CerrarConversacion conversacionId={detalle.id} cerrada={detalle.cerrada} />
                </header>
                <ListaAlFinal
                  aria-label="Mensajes"
                  className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain bg-[radial-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-4 [scrollbar-width:thin] sm:px-6"
                >
                  {detalle.mensajes.map((m, i) => {
                    const dia = claveDia(m.creadoEn);
                    const nuevoDia = i === 0 || claveDia(detalle.mensajes[i - 1]!.creadoEn) !== dia;
                    const entrante = m.direccion === 'entrante';
                    return (
                      <Fragment key={m.id}>
                        {nuevoDia && (
                          <li className="my-2 justify-self-center rounded-lg bg-white/[0.06] px-3 py-1 text-[0.7rem] font-semibold text-tinta-suave">
                            {etiquetaDia(m.creadoEn)}
                          </li>
                        )}
                        <li
                          className={clsx(
                            'grid max-w-[min(80%,36rem)] gap-0.5 rounded-2xl px-3 py-1.5 text-sm shadow-[0_1px_0_rgb(0_0_0/0.25)]',
                            entrante
                              ? 'justify-self-start rounded-tl-md bg-[#1b2238]'
                              : 'justify-self-end rounded-tr-md bg-[#0f4a3c]',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                          <p className="flex items-center justify-end gap-1.5 text-[0.68rem] text-tinta-tenue">
                            {m.autor && <span className="truncate">{m.autor.nombre} ·</span>}
                            <time dateTime={m.creadoEn} title={formatearFechaHora(m.creadoEn)}>
                              {formatearHora(m.creadoEn)}
                            </time>
                            {!entrante && <EstadoEnvio estado={m.estado} />}
                          </p>
                        </li>
                      </Fragment>
                    );
                  })}
                </ListaAlFinal>
                <ResponderWhatsApp conversacionId={detalle.id} puede={!motivo} motivo={motivo} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
