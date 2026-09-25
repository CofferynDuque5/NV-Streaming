import {
  ADAPTADORES_ENTREGA,
  type ConfigEntregaProveedor,
  type EntregaDetalle,
  ESTADOS_ENTREGA,
  filtroEntregasSchema,
  MOTIVOS_ENTREGA,
  type PaginaEntregas,
} from '@nv/shared';
import { ChevronRight, PackageCheck, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccionesEntrega, CajonLateral } from '@/componentes/admin/entregas';
import { clasesFiltro, FiltroSelector } from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { ADAPTADOR_ENTREGA, ESTADO_ENTREGA, MOTIVO_ENTREGA } from '@/lib/entregas';
import { ACCIONES_AUDITORIA, formatearFechaHora, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Entregas' };

const RUTA = '/admin/entregas';

export default async function Entregas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'entregas.ver' });
  const puedeGestionar = sesion.permisos.includes('entregas.gestionar');
  const crudo = await searchParams;
  const { filtro, consulta, parametros } = leerFiltro(filtroEntregasSchema, crudo, {
    porPagina: 20,
  });
  const id = typeof crudo.id === 'string' && /^[0-9a-f-]{36}$/i.test(crudo.id) ? crudo.id : null;

  const [rLista, rDetalle] = await Promise.all([
    leerApi<PaginaEntregas>(`/entregas?${consulta}`),
    id ? leerApi<EntregaDetalle>(`/entregas/${id}`) : Promise.resolve(null),
  ]);
  const pagina = rLista.datos;
  const detalle = rDetalle?.datos ?? null;
  const config =
    detalle && puedeGestionar && sesion.permisos.includes('catalogo.ver')
      ? (
          await leerApi<ConfigEntregaProveedor>(
            `/catalogo/proveedores/${detalle.proveedor.id}/entrega`,
          )
        ).datos
      : null;

  const conId = (entregaId: string) => {
    const q = new URLSearchParams(
      Object.entries({ ...parametros, pagina: String(filtro.pagina), id: entregaId }).filter(
        (e): e is [string, string] => Boolean(e[1]),
      ),
    );
    return `${RUTA}?${q}`;
  };
  const sinId = (() => {
    const q = new URLSearchParams(
      Object.entries({ ...parametros, pagina: String(filtro.pagina) }).filter(
        (e): e is [string, string] => Boolean(e[1]) && e[1] !== '1',
      ),
    );
    const s = q.toString();
    return s ? `${RUTA}?${s}` : RUTA;
  })();
  const filtrando = Boolean(
    filtro.estado || filtro.adaptador || filtro.motivo || filtro.busqueda || filtro.clienteId,
  );
  const atencion = pagina ? pagina.contadores.pendiente + pagina.contadores.fallida : 0;

  return (
    <>
      <CabeceraPagina
        titulo="Entregas"
        descripcion="Cada pago o compra confirmada crea una entrega: el servicio propio o la activación oficial del distribuidor. Aquí ves su estado, los reintentos y las que esperan a una persona. Los códigos nunca se muestran al equipo."
      />

      {!pagina && (
        <Alerta tono="peligro" titulo="No pudimos cargar las entregas">
          Recarga la página en unos segundos.
        </Alerta>
      )}

      {pagina && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-nv border border-borde bg-borde shadow-nv sm:grid-cols-4">
          {(['pendiente', 'fallida', 'entregada', 'revocada'] as const).map((e) => (
            <div key={e} className="grid gap-0.5 bg-superficie px-4 py-4 sm:px-6">
              <dt className="text-xs text-tinta-tenue">{ESTADO_ENTREGA[e].texto}</dt>
              <dd className="font-titulo text-2xl font-semibold tabular-nums">
                <Link
                  href={`${RUTA}?estado=${e}`}
                  className="underline-offset-4 hover:underline focus-visible:underline"
                >
                  {pagina.contadores[e]}
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {atencion > 0 && !filtro.estado && (
        <Alerta tono="aviso" titulo="Hay entregas que necesitan atención">
          {pagina?.contadores.pendiente ?? 0} pendientes y {pagina?.contadores.fallida ?? 0}{' '}
          fallidas. Las manuales esperan a que alguien las complete; las fallidas se pueden
          reintentar o completar a mano.
        </Alerta>
      )}

      <Tarjeta>
        <form
          className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
          aria-label="Filtrar entregas"
        >
          <div className="relative min-w-0 flex-1 basis-52">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por cliente o referencia del proveedor
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden="true"
            />
            <input
              id="busqueda"
              name="busqueda"
              type="search"
              defaultValue={filtro.busqueda ?? ''}
              placeholder="Cliente o referencia"
              className={`${clasesFiltro} pl-9`}
            />
          </div>
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? ''}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_ENTREGA.map((e) => (
              <option key={e} value={e}>
                {ESTADO_ENTREGA[e].texto}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-adaptador"
            etiqueta="Forma de entrega"
            name="adaptador"
            defaultValue={filtro.adaptador ?? ''}
          >
            <option value="">Todas las formas</option>
            {ADAPTADORES_ENTREGA.map((a) => (
              <option key={a} value={a}>
                {ADAPTADOR_ENTREGA[a].nombre}
              </option>
            ))}
          </FiltroSelector>
          <FiltroSelector
            id="filtro-motivo"
            etiqueta="Motivo"
            name="motivo"
            defaultValue={filtro.motivo ?? ''}
          >
            <option value="">Todos los motivos</option>
            {MOTIVOS_ENTREGA.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_ENTREGA[m]}
              </option>
            ))}
          </FiltroSelector>
          {filtro.clienteId && <input type="hidden" name="clienteId" value={filtro.clienteId} />}
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          {filtrando && (
            <Link
              href={RUTA}
              className="text-sm text-tinta-suave underline-offset-2 hover:text-tinta hover:underline"
            >
              Quitar filtros
            </Link>
          )}
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina?.total === 1 ? '1 entrega' : `${pagina?.total ?? 0} entregas`}
          </p>
        </form>

        {!pagina || pagina.elementos.length === 0 ? (
          <EstadoVacio
            icono={PackageCheck}
            titulo={filtrando ? 'No hay entregas con esos filtros' : 'Aún no hay entregas'}
          >
            {filtrando
              ? 'Cambia los filtros o quítalos para ver todas.'
              : 'Aparecen cuando se confirma el pago de un alta o una renovación, o cuando un revendedor compra una activación.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="56rem">
            <Encabezados
              columnas={[
                'Cliente',
                'Servicio · plan',
                'Estado',
                'Forma',
                'Intentos',
                'Creada',
                { texto: 'Detalle', className: 'w-10 sr-only' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((e) => (
                <Fila key={e.id} href={conId(e.id)}>
                  <Celda primera>
                    <EnlaceFila href={conId(e.id)}>
                      <span className="font-medium">{e.cliente.nombre}</span>
                      <span className="text-xs text-tinta-tenue">
                        {e.revendedor
                          ? `Vía ${e.revendedor.nombreComercial}`
                          : MOTIVO_ENTREGA[e.motivo]}
                        {e.factura ? ` · ${e.factura.numero}` : ''}
                      </span>
                    </EnlaceFila>
                  </Celda>
                  <Celda>
                    <span className="grid">
                      <span>
                        {e.plan.servicio} · {e.plan.nombre}
                      </span>
                      <span className="text-xs text-tinta-tenue">{e.proveedor.nombre}</span>
                    </span>
                  </Celda>
                  <Celda>
                    <span className="grid justify-items-start gap-1">
                      <Insignia tono={ESTADO_ENTREGA[e.estado].tono}>
                        {ESTADO_ENTREGA[e.estado].texto}
                      </Insignia>
                      {e.error && e.estado !== 'entregada' && (
                        <span className="line-clamp-1 max-w-56 text-xs text-tinta-tenue">
                          {e.error}
                        </span>
                      )}
                    </span>
                  </Celda>
                  <Celda className="text-tinta-suave">
                    {ADAPTADOR_ENTREGA[e.adaptador].nombre}
                  </Celda>
                  <Celda className="tabular-nums text-tinta-suave">{e.intentos}</Celda>
                  <Celda>
                    <time dateTime={e.creadoEn} className="text-tinta-suave">
                      {haceCuanto(e.creadoEn)}
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
        {pagina && (
          <Paginacion
            ruta={RUTA}
            parametros={parametros}
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
          />
        )}
      </Tarjeta>

      {id && (
        <CajonLateral
          titulo={detalle ? `Entrega a ${detalle.cliente.nombre}` : 'Entrega'}
          cerrar={sinId}
        >
          {!detalle ? (
            <Alerta tono="peligro">Esta entrega no existe o no se pudo cargar.</Alerta>
          ) : (
            <DetalleEntrega
              e={detalle}
              puedeGestionar={puedeGestionar}
              adaptadorProveedor={config?.adaptador ?? detalle.adaptador}
            />
          )}
        </CajonLateral>
      )}
    </>
  );
}

function DetalleEntrega({
  e,
  puedeGestionar,
  adaptadorProveedor,
}: {
  e: EntregaDetalle;
  puedeGestionar: boolean;
  adaptadorProveedor: string;
}) {
  const filas: [string, ReactNode][] = [
    ['Servicio', `${e.plan.servicio} · ${e.plan.nombre}`],
    ['Proveedor', e.proveedor.nombre],
    ['Forma de entrega', ADAPTADOR_ENTREGA[e.adaptador].nombre],
    ['Motivo', MOTIVO_ENTREGA[e.motivo]],
    [
      'Cliente',
      <Link
        key="c"
        href={`/admin/clientes/${e.cliente.id}`}
        className="text-marca underline-offset-2 hover:underline"
      >
        {e.cliente.nombre}
      </Link>,
    ],
  ];
  if (e.revendedor) filas.push(['Revendedor', e.revendedor.nombreComercial]);
  if (e.factura) {
    filas.push([
      'Factura',
      <Link
        key="f"
        href={`/admin/cobros/facturas/${e.factura.id}`}
        className="font-mono text-xs text-marca underline-offset-2 hover:underline"
      >
        {e.factura.numero}
      </Link>,
    ]);
  }
  if (e.suscripcionId) {
    filas.push([
      'Suscripción',
      <Link
        key="s"
        href={`/admin/suscripciones/${e.suscripcionId}`}
        className="text-marca underline-offset-2 hover:underline"
      >
        Ver suscripción
      </Link>,
    ]);
  }
  filas.push(['Intentos', String(e.intentos)]);
  if (e.proximoIntentoEn && e.estado === 'pendiente') {
    filas.push(['Próximo intento', formatearFechaHora(e.proximoIntentoEn)]);
  }
  if (e.referenciaExterna) {
    filas.push([
      'Referencia del proveedor',
      <code key="r" className="font-mono text-xs">
        {e.referenciaExterna}
      </code>,
    ]);
  }
  if (e.codigoInventario) {
    filas.push([
      'Código de inventario',
      <span key="h" className="grid">
        <code className="font-mono text-xs">huella {e.codigoInventario.huella}…</code>
        <span className="text-xs text-tinta-tenue">Lote «{e.codigoInventario.lote.nombre}»</span>
      </span>,
    ]);
  }
  if (e.entregadaEn) filas.push(['Entregada', formatearFechaHora(e.entregadaEn)]);
  if (e.completadaPor) filas.push(['Completada por', e.completadaPor.nombre]);
  filas.push([
    'Visto por el cliente',
    e.vistaEn ? formatearFechaHora(e.vistaEn) : e.estado === 'entregada' ? 'Aún no' : '—',
  ]);
  if (e.revocadaEn) filas.push(['Revocada', formatearFechaHora(e.revocadaEn)]);
  if (e.anuladaEn) filas.push(['Anulada', formatearFechaHora(e.anuladaEn)]);
  if (e.motivoAnulacion) filas.push(['Motivo de anulación', e.motivoAnulacion]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={ESTADO_ENTREGA[e.estado].tono}>{ESTADO_ENTREGA[e.estado].texto}</Insignia>
        {(e.tieneCodigo || e.tieneEnlace) && (
          <span className="text-xs text-tinta-tenue">
            Guardado cifrado:{' '}
            {[e.tieneCodigo && 'código', e.tieneEnlace && 'enlace'].filter(Boolean).join(' y ')}
          </span>
        )}
      </div>
      {e.error && e.estado !== 'entregada' && (
        <Alerta tono={e.estado === 'fallida' ? 'peligro' : 'aviso'}>{e.error}</Alerta>
      )}
      {e.error && e.estado === 'entregada' && <Alerta tono="aviso">{e.error}</Alerta>}
      {puedeGestionar && <AccionesEntrega entrega={e} adaptadorProveedor={adaptadorProveedor} />}
      <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[11rem_1fr]">
        {filas.map(([t, v]) => (
          <div key={t} className="contents">
            <dt className="text-tinta-tenue">{t}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {e.instrucciones && (
        <section className="grid gap-1.5">
          <h3 className="text-sm font-medium">Instrucciones para el cliente</h3>
          <p className="rounded-xl border border-borde bg-hundida px-3 py-2.5 text-sm whitespace-pre-line">
            {e.instrucciones}
          </p>
        </section>
      )}
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Historial</h3>
        <ol className="grid gap-2 border-l border-borde pl-4">
          {e.historial.map((h, i) => (
            <li key={`${h.accion}-${i}`} className="grid text-sm">
              <span>{ACCIONES_AUDITORIA[h.accion] ?? h.accion}</span>
              <span className="text-xs text-tinta-tenue">
                {formatearFechaHora(h.fecha)} · {h.actor?.nombre ?? 'Sistema'}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
