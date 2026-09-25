import {
  AUTOMATIZACIONES,
  CANALES_AVISO,
  ESTADOS_NOTIFICACION,
  filtroNotificacionesSchema,
  type NotificacionResumen,
  type Pagina,
  type PanelAutomatizaciones,
  TIPOS_AUTOMATIZACION,
} from '@nv/shared';
import { BellRing, Mail, MessageCircle, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EnviarPrueba } from '@/componentes/admin/automatizaciones';
import { FiltroSelector } from '@/componentes/admin/piezas-crm';
import {
  EstadoNotificacionInsignia,
  HoraVenezuela,
  PestanasAutomatizaciones,
} from '@/componentes/admin/piezas-automatizaciones';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import {
  CANAL_AVISO,
  ESTADO_NOTIFICACION,
  nombreAutomatizacion,
  nombrePlantilla,
  textoMotivo,
} from '@/lib/automatizaciones';
import { leerFiltro } from '@/lib/consulta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Avisos enviados' };

type Crudo = Record<string, string | string[] | undefined>;

export default async function Avisos({ searchParams }: { searchParams: Promise<Crudo> }) {
  const sesion = await requerirSesion({ permiso: 'automatizaciones.ver' });
  const puedeConfigurar = sesion.permisos.includes('automatizaciones.configurar');
  const { filtro, consulta, parametros } = leerFiltro(
    filtroNotificacionesSchema,
    await searchParams,
  );
  // El filtro de avisos no lleva tamaño de página: la API usa el suyo.
  consulta.delete('porPagina');

  const [{ datos }, panel] = await Promise.all([
    leerApi<Pagina<NotificacionResumen>>(`/notificaciones?${consulta}`),
    puedeConfigurar
      ? leerApi<PanelAutomatizaciones>('/automatizaciones').then((r) => r.datos)
      : Promise.resolve(null),
  ]);
  const hayFiltro = Boolean(filtro.canal || filtro.estado || filtro.automatizacion);

  return (
    <>
      <CabeceraPagina
        titulo="Automatizaciones"
        descripcion="Registro de cada aviso enviado por correo o WhatsApp, con su resultado. Horas de Venezuela."
      />
      <PestanasAutomatizaciones vista="avisos" />

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Avisos enviados"
          descripcion="Los destinos se muestran parcialmente ocultos. Los omitidos no se enviaron por una razón prevista (por ejemplo, sin consentimiento)."
        />
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar avisos"
        >
          {filtro.clienteId && <input type="hidden" name="clienteId" value={filtro.clienteId} />}
          <FiltroSelector
            id="filtro-canal"
            etiqueta="Canal"
            name="canal"
            defaultValue={filtro.canal ?? ''}
          >
            <option value="">Todos los canales</option>
            {CANALES_AVISO.map((c) => (
              <option key={c} value={c}>
                {CANAL_AVISO[c]}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? ''}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_NOTIFICACION.map((e) => (
              <option key={e} value={e}>
                {ESTADO_NOTIFICACION[e].texto}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-automatizacion"
            etiqueta="Automatización"
            name="automatizacion"
            defaultValue={filtro.automatizacion ?? ''}
          >
            <option value="">Todas las automatizaciones</option>
            {TIPOS_AUTOMATIZACION.map((t) => (
              <option key={t} value={t}>
                {AUTOMATIZACIONES[t].nombre}
              </option>
            ))}
          </FiltroSelector>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          {(hayFiltro || filtro.clienteId) && (
            <Link
              href="/admin/automatizaciones/avisos"
              className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta"
            >
              <X className="size-3.5" aria-hidden="true" /> Quitar filtros
            </Link>
          )}
        </form>
        {filtro.clienteId && (
          <p className="border-b border-borde bg-hundida/40 px-5 py-2 text-xs text-tinta-suave sm:px-6">
            Solo los avisos de un cliente.{' '}
            <Link
              href={`/admin/clientes/${filtro.clienteId}`}
              className="text-marca hover:underline"
            >
              Ver su ficha
            </Link>
          </p>
        )}

        {!datos ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">
              No pudimos cargar el registro de avisos. Recarga la página.
            </Alerta>
          </div>
        ) : datos.elementos.length === 0 ? (
          <EstadoVacio
            icono={BellRing}
            titulo={
              hayFiltro ? 'No hay avisos con ese filtro' : 'Todavía no se ha enviado ningún aviso'
            }
          >
            {hayFiltro
              ? 'Prueba con otro canal, estado o automatización.'
              : 'Cuando una automatización avise a alguien, quedará registrado aquí.'}
          </EstadoVacio>
        ) : (
          <ol className="divide-y divide-borde" aria-label="Avisos">
            {datos.elementos.map((n) => (
              <FilaAviso key={n.id} n={n} />
            ))}
          </ol>
        )}
        {datos && (
          <Paginacion
            ruta="/admin/automatizaciones/avisos"
            parametros={parametros}
            pagina={datos.pagina}
            porPagina={datos.porPagina}
            total={datos.total}
          />
        )}
      </Tarjeta>

      {puedeConfigurar && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Enviar aviso de prueba"
            descripcion="Comprueba que un canal funciona. La prueba queda en el registro."
          />
          <div className="p-5 sm:p-6">
            <EnviarPrueba whatsapp={panel?.canales.whatsapp ?? null} />
          </div>
        </Tarjeta>
      )}
    </>
  );
}

function FilaAviso({ n }: { n: NotificacionResumen }) {
  const Icono = n.canal === 'whatsapp' ? MessageCircle : Mail;
  const titulo = nombreAutomatizacion(n.automatizacion) ?? nombrePlantilla(n.plantilla);
  const motivo = n.estado === 'omitida' ? textoMotivo(n.motivo) : null;
  const detalleError = n.estado === 'fallida' ? (n.error ?? textoMotivo(n.motivo)) : null;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6">
      <span
        className="row-span-2 mt-0.5 grid size-8 place-items-center rounded-lg border border-borde bg-hundida text-tinta-suave"
        title={CANAL_AVISO[n.canal]}
      >
        <Icono className="size-4" aria-hidden="true" />
        <span className="sr-only">{CANAL_AVISO[n.canal]}</span>
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm font-medium break-words">{titulo}</p>
        <p className="text-xs break-words text-tinta-suave">
          <span className="font-mono">{n.destino}</span>
          {n.cliente && (
            <>
              {' · '}
              <Link href={`/admin/clientes/${n.cliente.id}`} className="text-marca hover:underline">
                {n.cliente.nombre}
              </Link>
            </>
          )}
          {!n.cliente && n.usuario && <> · {n.usuario.nombre}</>}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tinta-tenue sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:grid sm:content-start sm:justify-items-end">
        <EstadoNotificacionInsignia estado={n.estado} />
        <HoraVenezuela iso={n.enviadaEn ?? n.creadoEn} />
      </div>
      {(motivo || detalleError) && (
        <p
          className={
            n.estado === 'fallida'
              ? 'col-start-2 text-xs break-words text-peligro'
              : 'col-start-2 text-xs break-words text-tinta-suave'
          }
        >
          {n.estado === 'fallida' ? 'Error: ' : 'Motivo: '}
          {motivo ?? detalleError}
        </p>
      )}
    </li>
  );
}
