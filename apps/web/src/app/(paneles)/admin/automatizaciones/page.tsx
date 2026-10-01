import type { AutomatizacionResumen, PanelAutomatizaciones } from '@nv/shared';
import clsx from 'clsx';
import { Settings2, Workflow } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EjecutarAhora, InterruptorAutomatizacion } from '@/componentes/admin/automatizaciones';
import {
  FranjaEstado,
  HoraVenezuela,
  PestanasAutomatizaciones,
  UltimaEjecucion,
} from '@/componentes/admin/piezas-automatizaciones';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import {
  CANAL_AVISO,
  DISPARO_AUTOMATIZACION,
  GRUPOS_AUTOMATIZACION,
  resumenParametros,
} from '@/lib/automatizaciones';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Automatizaciones' };

export default async function Automatizaciones() {
  const sesion = await requerirSesion({ permiso: 'automatizaciones.ver' });
  const puedeConfigurar = sesion.permisos.includes('automatizaciones.configurar');
  const { datos: panel } = await leerApi<PanelAutomatizaciones>('/automatizaciones');

  return (
    <>
      <CabeceraPagina
        titulo="Automatizaciones"
        descripcion="Recordatorios, avisos y tareas que NV Streaming hace sola. Las horas son de Venezuela."
      />
      <PestanasAutomatizaciones vista="automatizaciones" />

      {!panel ? (
        <Alerta tono="peligro" titulo="No pudimos cargar las automatizaciones">
          Recarga la página. Si sigue fallando, revisa que la API esté en marcha.
        </Alerta>
      ) : (
        <>
          <FranjaEstado canales={panel.canales} />
          {!puedeConfigurar && (
            <Alerta tono="info">
              Puedes ver las automatizaciones y su historial. Solo administración puede activarlas,
              pausarlas o cambiar su configuración.
            </Alerta>
          )}
          {panel.automatizaciones.length === 0 ? (
            <Tarjeta>
              <EstadoVacio icono={Workflow} titulo="No hay automatizaciones">
                El catálogo de automatizaciones está vacío en este servidor.
              </EstadoVacio>
            </Tarjeta>
          ) : (
            GRUPOS_AUTOMATIZACION.map((g) => {
              const lista = panel.automatizaciones.filter((a) => a.grupo === g.id);
              if (lista.length === 0) return null;
              return (
                <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="grid gap-3">
                  <div className="grid gap-1">
                    <h2 id={`grupo-${g.id}`} className="text-lg font-semibold">
                      {g.titulo}
                    </h2>
                    <p className="text-sm text-tinta-suave">
                      {g.descripcion}
                      {g.id === 'clientes' &&
                        ' WhatsApp es opcional: solo llega a quien dio su consentimiento y con plantillas aprobadas por Meta.'}
                    </p>
                  </div>
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {lista.map((a) => (
                      <li key={a.tipo} className="min-w-0">
                        <TarjetaAutomatizacion a={a} puedeConfigurar={puedeConfigurar} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}

function TarjetaAutomatizacion({
  a,
  puedeConfigurar,
}: {
  a: AutomatizacionResumen;
  puedeConfigurar: boolean;
}) {
  const resumen = resumenParametros(a.tipo, a.parametros);
  const programada = a.disparo === 'programada';
  return (
    <Tarjeta
      className={clsx('flex h-full flex-col', !a.activa && 'bg-superficie/70')}
      aria-labelledby={`auto-${a.tipo}`}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="grid min-w-0 gap-1.5">
          <h3 id={`auto-${a.tipo}`} className="font-semibold break-words">
            <Link
              href={`/admin/automatizaciones/${a.tipo}`}
              className="hover:text-marca hover:underline"
            >
              {a.nombre}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tono={programada ? 'marca' : 'acento'}>
              {DISPARO_AUTOMATIZACION[a.disparo]}
            </Insignia>
            {a.canalesPermitidos.map((c) => {
              const usa = a.canales.includes(c);
              return (
                <Insignia
                  key={c}
                  tono={usa ? 'exito' : 'neutro'}
                  className={clsx(!usa && 'line-through decoration-tinta-tenue')}
                >
                  <span className="sr-only">{usa ? 'Envía por' : 'No envía por'} </span>
                  {CANAL_AVISO[c]}
                </Insignia>
              );
            })}
          </div>
        </div>
        {puedeConfigurar ? (
          <InterruptorAutomatizacion tipo={a.tipo} nombre={a.nombre} activa={a.activa} />
        ) : (
          <Insignia tono={a.activa ? 'exito' : 'neutro'}>
            {a.activa ? 'Activa' : 'Pausada'}
          </Insignia>
        )}
      </div>
      <p className="px-5 pt-3 text-sm text-tinta-suave">{a.descripcion}</p>
      <dl className="grid gap-x-6 gap-y-3 px-5 pt-4 pb-5 text-sm sm:grid-cols-2">
        {resumen && (
          <div className="grid gap-0.5 sm:col-span-2">
            <dt className="text-xs text-tinta-tenue">Configuración</dt>
            <dd className="break-words">{resumen}</dd>
          </div>
        )}
        <div className="grid gap-0.5">
          <dt className="text-xs text-tinta-tenue">Próxima ejecución</dt>
          <dd>
            {!programada ? (
              <span className="text-tinta-suave">Con cada cambio que la dispara</span>
            ) : !a.activa ? (
              <span className="text-tinta-tenue">Pausada</span>
            ) : a.proximaEjecucionEn ? (
              <HoraVenezuela iso={a.proximaEjecucionEn} />
            ) : (
              <span className="text-tinta-tenue">Sin programar</span>
            )}
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-xs text-tinta-tenue">Última ejecución</dt>
          <dd className="text-sm">
            <UltimaEjecucion ejecucion={a.ultimaEjecucion} />
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap items-start gap-2 border-t border-borde bg-hundida/40 px-5 py-3">
        <BotonEnlace
          href={`/admin/automatizaciones/${a.tipo}`}
          variante="fantasma"
          tamano="sm"
          aria-label={`${puedeConfigurar ? 'Configurar' : 'Ver detalle de'} ${a.nombre}`}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          {puedeConfigurar ? 'Configurar' : 'Ver detalle'}
        </BotonEnlace>
        {programada && puedeConfigurar && <EjecutarAhora tipo={a.tipo} nombre={a.nombre} />}
      </div>
    </Tarjeta>
  );
}
