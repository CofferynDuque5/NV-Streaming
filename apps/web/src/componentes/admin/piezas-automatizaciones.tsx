import type {
  EjecucionResumen,
  EstadoCanales,
  EstadoEjecucion,
  EstadoNotificacion,
} from '@nv/shared';
import clsx from 'clsx';
import { BellRing, HeartPulse, type LucideIcon, Mail, MessageCircle, Workflow } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Insignia } from '@/componentes/ui/insignia';
import {
  ESTADO_EJECUCION,
  ESTADO_NOTIFICACION,
  fechaHoraLargaVenezuela,
  fechaHoraVenezuela,
} from '@/lib/automatizaciones';
import { haceCuanto } from '@/lib/formato';

/*
 * Piezas de servidor de las pantallas de automatizaciones.
 * Sin 'use client': las páginas las importan directamente.
 */

export const EstadoEjecucionInsignia = ({ estado }: { estado: EstadoEjecucion }) => (
  <Insignia tono={ESTADO_EJECUCION[estado].tono}>{ESTADO_EJECUCION[estado].texto}</Insignia>
);

export const EstadoNotificacionInsignia = ({ estado }: { estado: EstadoNotificacion }) => (
  <Insignia tono={ESTADO_NOTIFICACION[estado].tono}>{ESTADO_NOTIFICACION[estado].texto}</Insignia>
);

/** Fecha en hora de Venezuela, con la fecha completa como título. */
export function HoraVenezuela({ iso, relativa }: { iso: string; relativa?: boolean }) {
  return (
    <time dateTime={iso} title={`${fechaHoraLargaVenezuela(iso)} (hora de Venezuela)`}>
      {relativa ? haceCuanto(iso) : fechaHoraVenezuela(iso)}
    </time>
  );
}

type Vista = 'automatizaciones' | 'avisos';

export function PestanasAutomatizaciones({ vista }: { vista: Vista }) {
  const pestanas: { id: Vista; texto: string; href: string; icono: LucideIcon }[] = [
    {
      id: 'automatizaciones',
      texto: 'Automatizaciones',
      href: '/admin/automatizaciones',
      icono: Workflow,
    },
    {
      id: 'avisos',
      texto: 'Avisos enviados',
      href: '/admin/automatizaciones/avisos',
      icono: BellRing,
    },
  ];
  return (
    <nav aria-label="Vistas de automatizaciones" className="-mt-2 max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-xl border border-borde bg-hundida p-1">
        {pestanas.map(({ id, texto, href, icono: Icono }) => {
          const activa = vista === id;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm sm:px-3 font-medium whitespace-nowrap transition-colors',
                  activa
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
                )}
              >
                <Icono className={clsx('size-4', activa && 'text-marca')} aria-hidden="true" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CeldaEstado({
  icono: Icono,
  titulo,
  estado,
  tono,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  estado: string;
  tono: 'exito' | 'aviso' | 'peligro' | 'neutro';
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 bg-superficie px-5 py-4">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-borde bg-hundida text-marca"
        aria-hidden="true"
      >
        <Icono className="size-4" />
      </span>
      <div className="grid min-w-0 gap-1">
        <dt className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {titulo}
          <Insignia tono={tono}>{estado}</Insignia>
        </dt>
        <dd className="text-xs break-words text-tinta-suave">{children}</dd>
      </div>
    </div>
  );
}

/** Franja con el estado de los canales de aviso y del proceso trabajador. */
export function FranjaEstado({ canales }: { canales: EstadoCanales }) {
  const { correo, whatsapp, trabajador } = canales;
  return (
    <section aria-label="Estado de los canales y del trabajador" className="grid gap-4">
      {!trabajador.activo && (
        <Alerta tono="peligro" titulo="El proceso trabajador no está en marcha">
          Mientras no arranque, las automatizaciones no se ejecutan y los avisos quedan en cola.
          {trabajador.ultimoLatidoEn ? (
            <>
              {' '}
              Último latido: <HoraVenezuela iso={trabajador.ultimoLatidoEn} /> (
              <HoraVenezuela iso={trabajador.ultimoLatidoEn} relativa />
              ).
            </>
          ) : (
            ' No ha arrancado nunca en este servidor.'
          )}
        </Alerta>
      )}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-nv border border-borde bg-borde shadow-nv md:grid-cols-3">
        <CeldaEstado
          icono={Mail}
          titulo="Correo"
          estado={correo.proveedor === 'smtp' ? 'SMTP' : 'Sandbox'}
          tono={correo.proveedor === 'smtp' ? 'exito' : 'aviso'}
        >
          {correo.proveedor === 'smtp'
            ? 'Los correos se envían de verdad por el servidor SMTP.'
            : 'Modo de pruebas: los correos no salen, solo quedan en el registro de avisos.'}
        </CeldaEstado>
        <CeldaEstado
          icono={MessageCircle}
          titulo="WhatsApp"
          estado={
            whatsapp.proveedor === 'desactivado'
              ? 'Desactivado'
              : whatsapp.proveedor === 'sandbox'
                ? 'Sandbox'
                : whatsapp.listo
                  ? 'Listo'
                  : 'Sin credenciales'
          }
          tono={
            whatsapp.proveedor === 'desactivado'
              ? 'neutro'
              : whatsapp.proveedor === 'sandbox'
                ? 'aviso'
                : whatsapp.listo
                  ? 'exito'
                  : 'peligro'
          }
        >
          {whatsapp.proveedor === 'desactivado'
            ? 'Opcional. Los avisos por WhatsApp se omiten hasta configurarlo.'
            : whatsapp.proveedor === 'sandbox'
              ? 'Modo de pruebas: los mensajes no salen, solo quedan en el registro.'
              : whatsapp.listo
                ? 'API de WhatsApp Cloud conectada. Solo a clientes con consentimiento.'
                : 'Faltan credenciales de la API de WhatsApp Cloud en el servidor.'}
        </CeldaEstado>
        <CeldaEstado
          icono={HeartPulse}
          titulo="Trabajador"
          estado={trabajador.activo ? 'Activo' : 'Detenido'}
          tono={trabajador.activo ? 'exito' : 'peligro'}
        >
          {trabajador.ultimoLatidoEn ? (
            <>
              Último latido <HoraVenezuela iso={trabajador.ultimoLatidoEn} relativa />.
            </>
          ) : (
            'Nunca ha dado señales de vida.'
          )}
        </CeldaEstado>
      </dl>
    </section>
  );
}

/** Resultado de la última ejecución, en una línea. */
export function UltimaEjecucion({ ejecucion }: { ejecucion: EjecucionResumen | null }) {
  if (!ejecucion) return <span className="text-tinta-tenue">Todavía no se ha ejecutado.</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <EstadoEjecucionInsignia estado={ejecucion.estado} />
      <HoraVenezuela iso={ejecucion.iniciadaEn} relativa />
      <span className="text-tinta-tenue">
        · {ejecucion.procesados} {ejecucion.procesados === 1 ? 'procesado' : 'procesados'}
        {ejecucion.errores > 0 ? ` · ${ejecucion.errores} con error` : ''}
      </span>
    </span>
  );
}
