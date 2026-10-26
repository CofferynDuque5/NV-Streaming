import {
  type EjecucionResumen,
  type Pagina,
  type PanelAutomatizaciones,
  paginacionSchema,
} from '@nv/shared';
import { History } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  EjecutarAhora,
  FormularioAutomatizacion,
  InterruptorAutomatizacion,
  ProbarFuenteTasa,
} from '@/componentes/admin/automatizaciones';
import { ListaDatos, Volver } from '@/componentes/admin/piezas-crm';
import {
  EstadoEjecucionInsignia,
  HoraVenezuela,
  UltimaEjecucion,
} from '@/componentes/admin/piezas-automatizaciones';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import {
  DISPARO_AUTOMATIZACION,
  duracion,
  esTipoAutomatizacion,
  nombreAutomatizacion,
} from '@/lib/automatizaciones';
import { leerFiltro } from '@/lib/consulta';
import { requerirSesion } from '@/lib/sesion';

type Crudo = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tipo: string }>;
}): Promise<Metadata> {
  const { tipo } = await params;
  return {
    title: esTipoAutomatizacion(tipo) ? nombreAutomatizacion(tipo)! : 'Automatización',
  };
}

export default async function DetalleAutomatizacion({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<Crudo>;
}) {
  const sesion = await requerirSesion({ permiso: 'automatizaciones.ver' });
  const puedeConfigurar = sesion.permisos.includes('automatizaciones.configurar');
  const { tipo } = await params;
  if (!esTipoAutomatizacion(tipo)) notFound();
  const { consulta } = leerFiltro(paginacionSchema, await searchParams, { porPagina: 20 });

  const [{ datos: panel }, { datos: ejecuciones }] = await Promise.all([
    leerApi<PanelAutomatizaciones>('/automatizaciones'),
    leerApi<Pagina<EjecucionResumen>>(`/automatizaciones/${tipo}/ejecuciones?${consulta}`),
  ]);
  const a = panel?.automatizaciones.find((x) => x.tipo === tipo);

  if (!panel || !a) {
    return (
      <>
        <Volver href="/admin/automatizaciones">Automatizaciones</Volver>
        <Alerta tono="peligro" titulo="No pudimos cargar esta automatización">
          Recarga la página. Si sigue fallando, revisa que la API esté en marcha.
        </Alerta>
      </>
    );
  }

  const programada = a.disparo === 'programada';
  const variacionMaxima = Number(a.parametros.variacionMaximaPct ?? 10);

  return (
    <>
      <Volver href="/admin/automatizaciones">Automatizaciones</Volver>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-2xl font-semibold break-words sm:text-[1.75rem]">{a.nombre}</h1>
          <p className="max-w-2xl text-sm text-tinta-suave sm:text-[0.95rem]">{a.descripcion}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Insignia tono={programada ? 'marca' : 'acento'}>
              {DISPARO_AUTOMATIZACION[a.disparo]}
            </Insignia>
            {!puedeConfigurar && (
              <Insignia tono={a.activa ? 'exito' : 'neutro'}>
                {a.activa ? 'Activa' : 'Pausada'}
              </Insignia>
            )}
          </div>
        </div>
        {puedeConfigurar && (
          <InterruptorAutomatizacion tipo={a.tipo} nombre={a.nombre} activa={a.activa} />
        )}
      </header>

      {!panel.canales.trabajador.activo && (
        <Alerta tono="peligro" titulo="El proceso trabajador no está en marcha">
          Esta automatización no se ejecutará hasta que arranque.
        </Alerta>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta className="min-w-0">
          <CabeceraTarjeta
            titulo="Configuración"
            descripcion={
              puedeConfigurar
                ? 'Los cambios se aplican desde la próxima ejecución y quedan en la auditoría. Las horas son de Venezuela.'
                : 'Solo administración puede cambiar esta configuración. Las horas son de Venezuela.'
            }
          />
          <div className="p-5 sm:p-6">
            <FormularioAutomatizacion
              automatizacion={a}
              editable={puedeConfigurar}
              canales={panel.canales}
            />
          </div>
        </Tarjeta>

        <aside className="grid min-w-0 gap-6" aria-label="Estado de la automatización">
          <Tarjeta>
            <CabeceraTarjeta titulo="Estado" />
            <ListaDatos
              columnas={1}
              datos={[
                [
                  'Próxima ejecución',
                  !programada ? (
                    'Se dispara con cada cambio'
                  ) : !a.activa ? (
                    'Pausada'
                  ) : a.proximaEjecucionEn ? (
                    <HoraVenezuela key="proxima" iso={a.proximaEjecucionEn} />
                  ) : (
                    'Sin programar'
                  ),
                ],
                [
                  'Última ejecución',
                  <UltimaEjecucion key="ultima" ejecucion={a.ultimaEjecucion} />,
                ],
                [
                  'Último cambio',
                  <span key="cambio">
                    {a.actualizadoPor?.nombre ?? 'Configuración inicial'} ·{' '}
                    <HoraVenezuela iso={a.actualizadoEn} relativa />
                  </span>,
                ],
              ]}
            />
            {programada && puedeConfigurar && (
              <div className="border-t border-borde px-5 py-4 sm:px-6">
                <EjecutarAhora tipo={a.tipo} nombre={a.nombre} className="justify-items-start" />
              </div>
            )}
          </Tarjeta>

          {a.tipo === 'tasa_automatica' && (
            <Tarjeta>
              <CabeceraTarjeta titulo="Probar la fuente" />
              <div className="px-5 py-4 sm:px-6">
                {puedeConfigurar ? (
                  <ProbarFuenteTasa
                    variacionMaximaPct={variacionMaxima}
                    fuenteGuardada={a.parametros.fuente === 'json' ? 'json' : 'bcv'}
                    fuentesTasa={panel.canales.fuentesTasa}
                  />
                ) : (
                  <p className="text-sm text-tinta-suave">
                    Solo administración puede consultar la fuente desde aquí.
                  </p>
                )}
              </div>
            </Tarjeta>
          )}
        </aside>
      </div>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Historial de ejecuciones"
          descripcion="La más reciente primero. Horas de Venezuela."
        />
        {!ejecuciones ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar el historial. Recarga la página.</Alerta>
          </div>
        ) : ejecuciones.elementos.length === 0 ? (
          <EstadoVacio icono={History} titulo="Todavía no se ha ejecutado">
            {programada
              ? 'Aparecerá aquí cada vez que corra, a su hora o al pulsar «Ejecutar ahora».'
              : 'Aparecerá aquí cuando ocurra el primer cambio que la dispare.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="46rem">
            <Encabezados
              columnas={[
                'Inicio',
                'Estado',
                'Origen',
                { texto: 'Procesados', className: 'text-right' },
                { texto: 'Omitidos', className: 'text-right' },
                { texto: 'Errores', className: 'text-right' },
                { texto: 'Resumen', className: 'pr-5 sm:pr-6' },
              ]}
            />
            <Cuerpo>
              {ejecuciones.elementos.map((e) => {
                const dura = duracion(e.iniciadaEn, e.terminadaEn);
                return (
                  <tr key={e.id}>
                    <Celda primera className="whitespace-nowrap">
                      <HoraVenezuela iso={e.iniciadaEn} />
                      {dura && <span className="block text-xs text-tinta-tenue">{dura}</span>}
                    </Celda>
                    <Celda>
                      <EstadoEjecucionInsignia estado={e.estado} />
                    </Celda>
                    <Celda className="text-tinta-suave">
                      {e.disparo === 'manual' ? 'Manual' : 'Programada'}
                    </Celda>
                    <Celda className="text-right tabular-nums">{e.procesados}</Celda>
                    <Celda className="text-right text-tinta-suave tabular-nums">{e.omitidos}</Celda>
                    <Celda
                      className={
                        e.errores > 0
                          ? 'text-right font-medium text-peligro tabular-nums'
                          : 'text-right text-tinta-suave tabular-nums'
                      }
                    >
                      {e.errores}
                    </Celda>
                    <Celda className="max-w-80 pr-5 text-tinta-suave sm:pr-6">
                      {e.resumen ?? '—'}
                    </Celda>
                  </tr>
                );
              })}
            </Cuerpo>
          </Tabla>
        )}
        {ejecuciones && (
          <Paginacion
            ruta={`/admin/automatizaciones/${a.tipo}`}
            parametros={{}}
            pagina={ejecuciones.pagina}
            porPagina={ejecuciones.porPagina}
            total={ejecuciones.total}
          />
        )}
      </Tarjeta>
    </>
  );
}
