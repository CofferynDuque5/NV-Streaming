import {
  type ClienteDetalle,
  ESTADOS_TICKET,
  listarTicketsSchema,
  type Pagina,
  PRIORIDADES_TICKET,
  type TicketResumen,
} from '@nv/shared';
import clsx from 'clsx';
import { ChevronRight, Clock, Inbox, MessageSquarePlus, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FiltroSelector, PanelAlta } from '@/componentes/admin/piezas-crm';
import { NuevoTicket } from '@/componentes/admin/soporte';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoTicketInsignia, PrioridadInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { CATEGORIA_TICKET, ESTADO_TICKET, PRIORIDAD_TICKET } from '@/lib/estados';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Soporte' };

/** Plazo de primera respuesta de un ticket. */
function Sla({ t }: { t: TicketResumen }) {
  if (t.slaIncumplido) return <Insignia tono="peligro">Plazo vencido</Insignia>;
  if (t.primeraRespuestaEn) return <span className="text-xs text-tinta-tenue">Respondido</span>;
  if (t.estado === 'resuelto' || t.estado === 'cerrado')
    return <span className="text-tinta-tenue">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-tinta-suave"
      title={`Responder antes del ${formatearFechaHora(t.slaPrimeraRespuesta)}`}
    >
      <Clock className="size-3.5 text-aviso" aria-hidden="true" />
      <span>
        <span className="sr-only">Responder antes del </span>
        {formatearFechaHora(t.slaPrimeraRespuesta)}
      </span>
    </span>
  );
}

export default async function Soporte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'tickets.ver' });
  const puedeGestionar = sesion.permisos.includes('tickets.gestionar');
  const crudo = await searchParams;

  // "estado" admite dos vistas además de cada estado: abiertos (por defecto) y todos.
  const vista = typeof crudo.estado === 'string' && crudo.estado ? crudo.estado : 'abiertos';
  const { filtro, consulta, parametros } = leerFiltro(
    listarTicketsSchema,
    {
      ...crudo,
      estado: vista === 'abiertos' || vista === 'todos' ? undefined : vista,
      abiertos: vista === 'abiertos' ? 'true' : undefined,
    },
    { porPagina: 20 },
  );
  const vistaFinal = filtro.estado ?? (filtro.abiertos ? 'abiertos' : 'todos');
  const parametrosPagina = { ...parametros, abiertos: undefined, estado: vistaFinal };

  const nuevo = puedeGestionar && crudo.nuevo === '1';
  const idCliente = typeof crudo.cliente === 'string' ? crudo.cliente : null;
  const [{ datos }, clienteInicial] = await Promise.all([
    leerApi<Pagina<TicketResumen>>(`/tickets?${consulta}`),
    nuevo && idCliente && /^[0-9a-f-]{36}$/i.test(idCliente)
      ? leerApi<ClienteDetalle>(`/clientes/${idCliente}`).then((r) => r.datos)
      : Promise.resolve(null),
  ]);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };
  const filtrando = Boolean(
    vistaFinal !== 'abiertos' || filtro.prioridad || filtro.asignacion || filtro.clienteId,
  );

  return (
    <>
      <CabeceraPagina
        titulo="Soporte"
        descripcion="La bandeja de tickets de los clientes, con su prioridad y el plazo para dar la primera respuesta."
        acciones={
          puedeGestionar && !nuevo ? (
            <BotonEnlace href="/admin/soporte?nuevo=1" scroll={false}>
              <MessageSquarePlus className="size-4" aria-hidden="true" /> Nuevo ticket
            </BotonEnlace>
          ) : undefined
        }
      />

      {nuevo && (
        <PanelAlta
          titulo="Nuevo ticket"
          descripcion="Para casos que el cliente te contó por otro canal. Recibirá un aviso por correo con cada respuesta."
          cerrarHref="/admin/soporte"
        >
          <NuevoTicket
            clienteInicial={
              clienteInicial
                ? {
                    id: clienteInicial.id,
                    nombre: clienteInicial.nombre,
                    correo: clienteInicial.correo,
                  }
                : null
            }
          />
        </PanelAlta>
      )}

      <Tarjeta>
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar tickets"
        >
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={vistaFinal}
          >
            <option value="abiertos">Abiertos (sin resolver)</option>
            <option value="todos">Todos, incluidos cerrados</option>
            <optgroup label="Un estado concreto">
              {ESTADOS_TICKET.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_TICKET[e].texto}
                </option>
              ))}
            </optgroup>
          </FiltroSelector>
          <FiltroSelector
            id="filtro-prioridad"
            etiqueta="Prioridad"
            name="prioridad"
            defaultValue={filtro.prioridad ?? ''}
          >
            <option value="">Cualquier prioridad</option>
            {PRIORIDADES_TICKET.map((p) => (
              <option key={p} value={p}>
                {PRIORIDAD_TICKET[p].texto}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-asignacion"
            etiqueta="Asignación"
            name="asignacion"
            defaultValue={filtro.asignacion ?? ''}
          >
            <option value="">Cualquier asignación</option>
            <option value="mios">Mis tickets</option>
            <option value="sin_asignar">Sin asignar</option>
          </FiltroSelector>
          {filtro.clienteId && <input type="hidden" name="clienteId" value={filtro.clienteId} />}
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          {filtrando && (
            <Link
              href="/admin/soporte"
              className="text-sm text-tinta-suave underline-offset-2 hover:text-tinta hover:underline"
            >
              Quitar filtros
            </Link>
          )}
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina.total === 1 ? '1 ticket' : `${pagina.total} tickets`}
          </p>
        </form>

        {pagina.elementos.length === 0 ? (
          filtrando ? (
            <EstadoVacio icono={SearchX} titulo="No hay tickets con esos filtros">
              Cambia los filtros o quítalos para volver a la bandeja de abiertos.
            </EstadoVacio>
          ) : (
            <EstadoVacio icono={Inbox} titulo="Bandeja al día">
              No hay tickets abiertos. Cuando un cliente escriba desde su panel, aparecerá aquí.
            </EstadoVacio>
          )
        ) : (
          <Tabla minimo="68rem">
            <Encabezados
              columnas={[
                'Ticket',
                'Cliente',
                'Categoría',
                'Prioridad',
                'Estado',
                'Asignado',
                'Primera respuesta',
                'Última actividad',
                { texto: 'Detalle', className: 'w-10 sr-only' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((t) => (
                <Fila
                  key={t.id}
                  href={`/admin/soporte/${t.id}`}
                  className={clsx(t.slaIncumplido && 'bg-peligro-suave/40')}
                >
                  <Celda primera className="max-w-[20rem]">
                    <EnlaceFila href={`/admin/soporte/${t.id}`}>
                      <span className="font-mono text-xs text-tinta-tenue">#{t.numero}</span>
                      <span className="truncate font-medium">{t.asunto}</span>
                    </EnlaceFila>
                  </Celda>
                  <Celda className="text-tinta-suave">{t.cliente.nombre}</Celda>
                  <Celda className="text-tinta-suave">{CATEGORIA_TICKET[t.categoria]}</Celda>
                  <Celda>
                    <PrioridadInsignia prioridad={t.prioridad} />
                  </Celda>
                  <Celda>
                    <EstadoTicketInsignia estado={t.estado} />
                  </Celda>
                  <Celda className="text-tinta-suave">
                    {t.asignadoA ? (
                      t.asignadoA.id === sesion.usuario.id ? (
                        <span className="font-medium text-tinta">Tú</span>
                      ) : (
                        t.asignadoA.nombre
                      )
                    ) : (
                      <span className="text-tinta-tenue">Sin asignar</span>
                    )}
                  </Celda>
                  <Celda>
                    <Sla t={t} />
                  </Celda>
                  <Celda className="text-xs whitespace-nowrap text-tinta-tenue">
                    <time dateTime={t.actualizadoEn} title={formatearFechaHora(t.actualizadoEn)}>
                      {haceCuanto(t.actualizadoEn)}
                    </time>
                  </Celda>
                  <Celda className="text-tinta-tenue">
                    <ChevronRight className="size-4 group-hover:text-tinta" aria-hidden="true" />
                  </Celda>
                </Fila>
              ))}
            </Cuerpo>
          </Tabla>
        )}
        <Paginacion
          ruta="/admin/soporte"
          parametros={parametrosPagina}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
