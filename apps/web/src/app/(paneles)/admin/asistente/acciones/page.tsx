import {
  type AccionPropuestaPublica,
  ESTADOS_ACCION_PROPUESTA,
  filtroAccionesSchema,
  type Pagina,
} from '@nv/shared';
import clsx from 'clsx';
import { ListChecks, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FiltroSelector } from '@/componentes/admin/piezas-crm';
import { EstadoAccionInsignia, PestanasAsistente } from '@/componentes/admin/piezas-asistente';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Celda, Cuerpo, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ESTADO_ACCION, estadoVisible, RUTA_ASISTENTE } from '@/lib/asistente';
import { leerFiltro } from '@/lib/consulta';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Acciones del asistente' };

type Crudo = Record<string, string | string[] | undefined>;
const RUTA = `${RUTA_ASISTENTE}/acciones`;

export default async function AccionesAsistente({
  searchParams,
}: {
  searchParams: Promise<Crudo>;
}) {
  const sesion = await requerirSesion({ permiso: 'asistente.usar' });
  const puedeConfigurar = sesion.permisos.includes('asistente.configurar');
  const { filtro, consulta, parametros } = leerFiltro(filtroAccionesSchema, await searchParams);
  // El filtro de acciones no lleva tamaño de página: la API usa el suyo.
  consulta.delete('porPagina');
  const { datos } = await leerApi<Pagina<AccionPropuestaPublica>>(
    `/asistente/acciones?${consulta}`,
  );
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };

  return (
    <>
      <CabeceraPagina
        titulo="Asistente"
        descripcion="Pregunta en lenguaje natural por clientes, vencimientos, cobros y tickets. Si algo requiere un cambio, te lo propone y tú decides."
      />
      <PestanasAsistente vista="acciones" puedeConfigurar={puedeConfigurar} />

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Acciones propuestas"
          descripcion={
            puedeConfigurar
              ? 'Todo lo que el asistente propuso al equipo y qué se decidió. Cada acción confirmada queda en la auditoría con el usuario que la confirmó.'
              : 'Lo que el asistente te propuso y qué decidiste. Las acciones por confirmar se deciden desde su conversación.'
          }
        />
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar acciones"
          action={RUTA}
        >
          <FiltroSelector
            id="filtro-estado-accion"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? ''}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_ACCION_PROPUESTA.map((e) => (
              <option key={e} value={e}>
                {ESTADO_ACCION[e].filtro}
              </option>
            ))}
          </FiltroSelector>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          {filtro.estado && (
            <Link
              href={RUTA}
              className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta"
            >
              <X className="size-3.5" aria-hidden="true" /> Quitar filtros
            </Link>
          )}
          <p className="ml-auto text-sm text-tinta-tenue tabular-nums">
            {pagina.total === 1 ? '1 acción' : `${pagina.total} acciones`}
          </p>
        </form>

        {!datos ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar las acciones. Recarga la página.</Alerta>
          </div>
        ) : pagina.elementos.length === 0 ? (
          <EstadoVacio icono={ListChecks} titulo="No hay acciones">
            {filtro.estado
              ? 'Prueba con otro estado.'
              : 'Cuando el asistente proponga un cambio (pausar una suscripción, responder un ticket…), aparecerá aquí.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="56rem">
            <Encabezados
              columnas={[
                'Propuesta',
                'Acción',
                'Solicitada por',
                'Estado',
                { texto: '', className: 'text-right' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((a) => {
                const estado = estadoVisible(a);
                const propia = a.solicitadaPor.id === sesion.usuario.id;
                return (
                  <Fila key={a.id}>
                    <Celda primera className="align-top">
                      <time dateTime={a.creadaEn} className="block whitespace-nowrap">
                        {formatearFechaHora(a.creadaEn)}
                      </time>
                      <span className="block text-xs text-tinta-tenue">
                        {haceCuanto(a.creadaEn)}
                      </span>
                    </Celda>
                    <Celda className="align-top">
                      <span className="block font-medium">{a.etiqueta}</span>
                      <span className="block max-w-md text-xs break-words text-tinta-suave">
                        {a.resumen}
                      </span>
                    </Celda>
                    <Celda className="align-top">{propia ? 'Tú' : a.solicitadaPor.nombre}</Celda>
                    <Celda className="align-top">
                      <EstadoAccionInsignia estado={estado} />
                      {a.decididaPor && a.decididaEn && (
                        <span className="mt-1 block text-xs text-tinta-tenue">
                          {a.decididaPor.id === sesion.usuario.id ? 'Tú' : a.decididaPor.nombre} ·{' '}
                          <time dateTime={a.decididaEn}>{haceCuanto(a.decididaEn)}</time>
                        </span>
                      )}
                      {a.resultado && (
                        <span className="mt-1 block max-w-64 text-xs break-words text-exito">
                          {a.resultado}
                        </span>
                      )}
                      {a.error && (
                        <span
                          className={clsx(
                            'mt-1 block max-w-64 text-xs break-words',
                            a.estado === 'rechazada' ? 'text-tinta-suave' : 'text-peligro',
                          )}
                        >
                          {a.estado === 'rechazada' ? `Motivo: ${a.error}` : a.error}
                        </span>
                      )}
                    </Celda>
                    <Celda className="pr-5 text-right align-top sm:pr-6">
                      {propia && (
                        <Link
                          href={`${RUTA_ASISTENTE}?conversacion=${a.conversacionId}`}
                          className="text-sm whitespace-nowrap text-marca hover:underline"
                          aria-label={`Ver la conversación de «${a.etiqueta}»`}
                        >
                          {estado === 'propuesta' ? 'Decidir' : 'Ver conversación'}
                        </Link>
                      )}
                    </Celda>
                  </Fila>
                );
              })}
            </Cuerpo>
          </Tabla>
        )}
        <Paginacion
          ruta={RUTA}
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
