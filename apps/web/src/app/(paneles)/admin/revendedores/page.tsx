import {
  ESTADOS_REVENDEDOR,
  type EstadoRevendedor,
  formatearMonto,
  type NivelPublico,
  type Pagina,
  paginacionSchema,
  type RecargaPublica,
  type ResumenProgramaRevendedores,
  type RevendedorResumen,
  type TablaPreciosMayoristas,
} from '@nv/shared';
import clsx from 'clsx';
import {
  BadgePercent,
  CircleCheckBig,
  Inbox,
  type LucideIcon,
  Paperclip,
  Search,
  Store,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { clasesFiltro, FiltroSelector } from '@/componentes/admin/piezas-crm';
import {
  CeldaPrecio,
  ConciliarRecarga,
  EditarNivel,
  NuevoNivel,
  RevisarSolicitud,
} from '@/componentes/admin/revendedores';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Cifra, EstadoRevendedorInsignia } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha, haceCuanto, nombrePais } from '@/lib/formato';
import { ESTADO_REVENDEDOR } from '@/lib/revendedores';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Revendedores' };

type Vista = 'solicitudes' | 'revendedores' | 'precios' | 'recargas';
type Crudo = Record<string, string | string[] | undefined>;
const VISTAS: Vista[] = ['solicitudes', 'revendedores', 'precios', 'recargas'];

export default async function Revendedores({ searchParams }: { searchParams: Promise<Crudo> }) {
  const sesion = await requerirSesion({ permiso: 'revendedores.ver' });
  const puedeGestionar = sesion.permisos.includes('revendedores.gestionar');
  const puedeConciliar = sesion.permisos.includes('pagos.gestionar');
  const crudo = await searchParams;
  const pedida = VISTAS.find((v) => v === crudo.vista) ?? 'solicitudes';
  const vista: Vista = pedida === 'recargas' && !puedeConciliar ? 'solicitudes' : pedida;

  const [{ datos: resumen }, niveles] = await Promise.all([
    leerApi<ResumenProgramaRevendedores>('/revendedores/resumen'),
    leerApi<NivelPublico[]>('/revendedores/niveles').then((r) => r.datos ?? []),
  ]);

  return (
    <>
      <CabeceraPagina
        titulo="Revendedores"
        descripcion="Solicitudes, cuentas de revendedor, precios mayoristas y recargas de saldo."
      />

      {resumen && (
        <Tarjeta>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-nv bg-borde sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              etiqueta="Revendedores activos"
              valor={String(resumen.aprobados)}
              detalle={
                resumen.suspendidos > 0
                  ? `${resumen.suspendidos} suspendido${resumen.suspendidos === 1 ? '' : 's'}`
                  : 'Ninguno suspendido'
              }
            />
            <Cifra
              etiqueta="Recargas este mes"
              valor={formatearMonto(resumen.recargasMesUsd, 'USD')}
              detalle="Confirmadas: lo que ingresa el programa"
            />
            <Cifra
              etiqueta="Saldo en cuentas"
              valor={formatearMonto(resumen.saldoTotalUsd, 'USD')}
              detalle="Pendiente de consumir en compras"
            />
            <Cifra
              etiqueta="Compras este mes"
              valor={String(resumen.comprasMes)}
              detalle="Activaciones y renovaciones"
            />
          </dl>
        </Tarjeta>
      )}

      <Pestanas
        vista={vista}
        puedeConciliar={puedeConciliar}
        solicitudes={resumen?.solicitudes ?? 0}
        recargas={resumen?.recargasEnRevision ?? 0}
      />

      {vista === 'solicitudes' && (
        <Solicitudes crudo={crudo} niveles={niveles} puedeGestionar={puedeGestionar} />
      )}
      {vista === 'revendedores' && <ListaRevendedores crudo={crudo} />}
      {vista === 'precios' && <Precios niveles={niveles} puedeGestionar={puedeGestionar} />}
      {vista === 'recargas' && <Recargas crudo={crudo} />}
    </>
  );
}

function Pestanas({
  vista,
  puedeConciliar,
  solicitudes,
  recargas,
}: {
  vista: Vista;
  puedeConciliar: boolean;
  solicitudes: number;
  recargas: number;
}) {
  const pestanas: { id: Vista; texto: string; icono: LucideIcon; cuenta?: number }[] = [
    { id: 'solicitudes', texto: 'Solicitudes', icono: Inbox, cuenta: solicitudes },
    { id: 'revendedores', texto: 'Revendedores', icono: Store },
    { id: 'precios', texto: 'Niveles y precios', icono: BadgePercent },
    ...(puedeConciliar
      ? [{ id: 'recargas' as const, texto: 'Recargas', icono: Wallet, cuenta: recargas }]
      : []),
  ];
  return (
    <nav aria-label="Vistas de revendedores" className="-mt-2 max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-xl border border-borde bg-hundida p-1">
        {pestanas.map(({ id, texto, icono: Icono, cuenta }) => {
          const activa = vista === id;
          return (
            <li key={id}>
              <Link
                href={`/admin/revendedores?vista=${id}`}
                aria-current={activa ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activa
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
                )}
              >
                <Icono className={clsx('size-4', activa && 'text-marca')} aria-hidden="true" />
                {texto}
                {cuenta !== undefined && cuenta > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-aviso px-1.5 text-[0.7rem] font-semibold text-fondo tabular-nums">
                    {cuenta}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NoCargado() {
  return (
    <div className="p-5 sm:p-6">
      <Alerta tono="peligro">No pudimos cargar esta lista. Recarga la página.</Alerta>
    </div>
  );
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

async function Solicitudes({
  crudo,
  niveles,
  puedeGestionar,
}: {
  crudo: Crudo;
  niveles: NivelPublico[];
  puedeGestionar: boolean;
}) {
  const { consulta } = leerFiltro(paginacionSchema, crudo, { porPagina: 20 });
  consulta.set('estado', 'solicitud');
  const { datos } = await leerApi<Pagina<RevendedorResumen>>(`/revendedores?${consulta}`);

  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Solicitudes pendientes"
        descripcion="Primero las más antiguas. Al aprobar, la cuenta pasa a revendedor y se cierran sus sesiones."
      />
      {!datos ? (
        <NoCargado />
      ) : datos.elementos.length === 0 ? (
        <EstadoVacio icono={CircleCheckBig} titulo="No hay solicitudes pendientes">
          Cuando un cliente pida ser revendedor aparecerá aquí.
        </EstadoVacio>
      ) : (
        <ol className="divide-y divide-borde">
          {datos.elementos.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-1 gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
            >
              <div className="grid content-start gap-1">
                <Link
                  href={`/admin/revendedores/${r.id}`}
                  className="font-medium break-words hover:text-marca hover:underline"
                >
                  {r.nombreComercial}
                </Link>
                <p className="text-sm break-words text-tinta-suave">
                  {r.usuario.nombre} · {r.usuario.correo}
                </p>
                <p className="text-xs text-tinta-tenue">
                  {r.pais ? `${nombrePais(r.pais)} · ` : ''}Enviada{' '}
                  <time dateTime={r.creadoEn}>{haceCuanto(r.creadoEn)}</time> ·{' '}
                  <Link href={`/admin/revendedores/${r.id}`} className="text-marca hover:underline">
                    Ver solicitud completa
                  </Link>
                </p>
              </div>
              {puedeGestionar && (
                <RevisarSolicitud revendedorId={r.id} nombre={r.usuario.nombre} niveles={niveles} />
              )}
            </li>
          ))}
        </ol>
      )}
      {datos && (
        <Paginacion
          ruta="/admin/revendedores"
          parametros={{ vista: 'solicitudes' }}
          pagina={datos.pagina}
          porPagina={datos.porPagina}
          total={datos.total}
        />
      )}
    </Tarjeta>
  );
}

// ── Revendedores ─────────────────────────────────────────────────────────────

async function ListaRevendedores({ crudo }: { crudo: Crudo }) {
  const { consulta } = leerFiltro(paginacionSchema, crudo, { porPagina: 20 });
  const estado =
    crudo.estado === 'todos'
      ? 'todos'
      : (ESTADOS_REVENDEDOR.find((e) => e === crudo.estado) ?? 'aprobado');
  const busqueda = typeof crudo.busqueda === 'string' ? crudo.busqueda.trim().slice(0, 120) : '';
  if (estado !== 'todos') consulta.set('estado', estado);
  if (busqueda) consulta.set('busqueda', busqueda);
  const { datos } = await leerApi<Pagina<RevendedorResumen>>(`/revendedores?${consulta}`);

  return (
    <Tarjeta>
      <form
        className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
        role="search"
      >
        <input type="hidden" name="vista" value="revendedores" />
        <div className="relative min-w-0 flex-1 basis-52">
          <label htmlFor="busqueda" className="sr-only">
            Buscar por negocio, nombre, correo o documento
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden="true"
          />
          <input
            id="busqueda"
            name="busqueda"
            type="search"
            defaultValue={busqueda}
            placeholder="Negocio, nombre, correo o documento"
            className={`${clasesFiltro} pl-9`}
          />
        </div>
        <FiltroSelector id="filtro-estado" etiqueta="Estado" name="estado" defaultValue={estado}>
          {(['aprobado', 'suspendido', 'solicitud', 'rechazado'] as EstadoRevendedor[]).map((e) => (
            <option key={e} value={e}>
              {ESTADO_REVENDEDOR[e].texto}
            </option>
          ))}
          <option value="todos">Todos</option>
        </FiltroSelector>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>
      {!datos ? (
        <NoCargado />
      ) : datos.elementos.length === 0 ? (
        <EstadoVacio icono={Store} titulo="No hay revendedores con ese filtro" />
      ) : (
        <Tabla minimo="48rem">
          <Encabezados
            columnas={[
              'Revendedor',
              'Estado',
              'Nivel',
              { texto: 'Saldo', className: 'text-right' },
              { texto: 'Límite diario', className: 'pr-5 sm:pr-6' },
            ]}
          />
          <Cuerpo>
            {datos.elementos.map((r) => (
              <Fila key={r.id} href={`/admin/revendedores/${r.id}`}>
                <Celda primera>
                  <EnlaceFila href={`/admin/revendedores/${r.id}`}>
                    <span className="font-medium group-hover:text-marca">{r.nombreComercial}</span>
                    <span className="text-xs text-tinta-tenue">
                      {r.usuario.nombre} · {r.usuario.correo}
                    </span>
                  </EnlaceFila>
                </Celda>
                <Celda>
                  <EstadoRevendedorInsignia estado={r.estado} />
                </Celda>
                <Celda>{r.nivel?.nombre ?? <span className="text-tinta-tenue">—</span>}</Celda>
                <Celda className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatearMonto(r.saldoUsd, 'USD')}
                </Celda>
                <Celda className="pr-5 text-tinta-suave sm:pr-6">
                  {r.limiteDiarioCompras ?? 'Sin límite'}
                </Celda>
              </Fila>
            ))}
          </Cuerpo>
        </Tabla>
      )}
      {datos && (
        <Paginacion
          ruta="/admin/revendedores"
          parametros={{ vista: 'revendedores', estado, busqueda: busqueda || undefined }}
          pagina={datos.pagina}
          porPagina={datos.porPagina}
          total={datos.total}
        />
      )}
    </Tarjeta>
  );
}

// ── Niveles y precios ────────────────────────────────────────────────────────

async function Precios({
  niveles,
  puedeGestionar,
}: {
  niveles: NivelPublico[];
  puedeGestionar: boolean;
}) {
  const { datos: tabla } = await leerApi<TablaPreciosMayoristas>('/revendedores/precios');

  return (
    <>
      <Tarjeta>
        <CabeceraTarjeta
          titulo="Niveles"
          descripcion="Cada revendedor tiene un nivel, y cada nivel su lista de precios."
          accion={puedeGestionar ? <NuevoNivel /> : undefined}
        />
        {niveles.length === 0 ? (
          <EstadoVacio icono={BadgePercent} titulo="Aún no hay niveles">
            Crea al menos uno para poder aprobar revendedores.
          </EstadoVacio>
        ) : (
          <ul className="divide-y divide-borde">
            {niveles.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {n.nombre}
                    {!n.activo && <Insignia tono="neutro">Inactivo</Insignia>}
                  </span>
                  <span className="text-xs text-tinta-tenue">
                    {n.revendedores === 1 ? '1 revendedor' : `${n.revendedores} revendedores`}
                    {n.descripcion ? ` · ${n.descripcion}` : ''}
                  </span>
                </div>
                {puedeGestionar && <EditarNivel nivel={n} />}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Precios mayoristas"
          descripcion={
            <>
              Solo aparecen los planes revendibles de proveedores que permiten la reventa. El precio
              nunca puede ser menor que el costo del plan (se fija en{' '}
              <Link href="/admin/catalogo" className="text-marca hover:underline">
                Catálogo
              </Link>
              ). Deja la celda vacía para no vender ese plan a un nivel.
            </>
          }
        />
        {!tabla ? (
          <NoCargado />
        ) : (
          <>
            {tabla.bloqueadosPorProveedor.length > 0 && (
              <div className="px-5 pt-4 sm:px-6">
                <Alerta tono="aviso" titulo="Planes revendibles bloqueados por el proveedor">
                  {tabla.bloqueadosPorProveedor
                    .map((p) => `${p.servicio} · ${p.nombre} (${p.proveedor})`)
                    .join(', ')}
                  . Su proveedor no permite la reventa, así que no se venden a revendedores.
                </Alerta>
              </div>
            )}
            {tabla.planes.length === 0 || tabla.niveles.length === 0 ? (
              <EstadoVacio icono={BadgePercent} titulo="Nada que configurar todavía">
                {tabla.niveles.length === 0
                  ? 'Crea un nivel para asignar precios.'
                  : 'Marca algún plan como revendible en el catálogo.'}
              </EstadoVacio>
            ) : (
              <Tabla minimo={`${22 + tabla.niveles.length * 8}rem`}>
                <Encabezados
                  columnas={[
                    'Plan',
                    { texto: 'Público', className: 'text-right' },
                    { texto: 'Costo', className: 'text-right' },
                    ...tabla.niveles.map((n, i) => ({
                      texto: n.nombre,
                      className: clsx(
                        'text-right',
                        i === tabla.niveles.length - 1 && 'pr-5 sm:pr-6',
                      ),
                    })),
                  ]}
                />
                <Cuerpo>
                  {tabla.planes.map((p) => (
                    <tr key={p.id} className={clsx(!p.activo && 'opacity-60')}>
                      <Celda primera>
                        <span className="block font-medium">{p.nombre}</span>
                        <span className="block text-xs text-tinta-tenue">
                          {p.servicio}
                          {p.activo ? '' : ' · inactivo'}
                        </span>
                      </Celda>
                      <Celda className="text-right whitespace-nowrap tabular-nums">
                        {formatearMonto(p.precioUsd, 'USD')}
                      </Celda>
                      <Celda className="text-right whitespace-nowrap text-tinta-suave tabular-nums">
                        {p.costoUsd ? formatearMonto(p.costoUsd, 'USD') : '—'}
                      </Celda>
                      {tabla.niveles.map((n, i) => (
                        <Celda
                          key={n.id}
                          className={clsx(
                            'text-right align-top',
                            i === tabla.niveles.length - 1 && 'pr-5 sm:pr-6',
                          )}
                        >
                          <CeldaPrecio
                            planId={p.id}
                            nivelId={n.id}
                            descripcion={`${p.nombre} para ${n.nombre}`}
                            precio={p.precios[n.id] ?? null}
                            costo={p.costoUsd}
                            editable={puedeGestionar}
                          />
                        </Celda>
                      ))}
                    </tr>
                  ))}
                </Cuerpo>
              </Tabla>
            )}
          </>
        )}
      </Tarjeta>
    </>
  );
}

// ── Recargas por conciliar ──────────────────────────────────────────────────

async function Recargas({ crudo }: { crudo: Crudo }) {
  const { consulta } = leerFiltro(paginacionSchema, crudo, { porPagina: 20 });
  consulta.set('estado', 'en_revision');
  const { datos } = await leerApi<Pagina<RecargaPublica>>(`/recargas-saldo?${consulta}`);

  return (
    <Tarjeta>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Recargas por conciliar</h2>
          <p className="text-sm text-tinta-suave">
            Comprueba cada pago en el banco antes de acreditarlo. La tasa quedó fijada al reportar.
          </p>
        </div>
        {datos && (
          <Insignia tono={datos.total > 0 ? 'aviso' : 'exito'}>
            {datos.total === 1 ? '1 en revisión' : `${datos.total} en revisión`}
          </Insignia>
        )}
      </header>
      {!datos ? (
        <NoCargado />
      ) : datos.elementos.length === 0 ? (
        <EstadoVacio icono={CircleCheckBig} titulo="No hay recargas pendientes">
          Cuando un revendedor reporte una recarga aparecerá aquí.
        </EstadoVacio>
      ) : (
        <ol className="divide-y divide-borde">
          {datos.elementos.map((x) => {
            const filas: [string, ReactNode][] = [
              ['Método', x.metodo.nombre],
              [
                'Referencia del banco',
                x.referenciaExterna ? (
                  <span className="font-mono text-[0.8rem] break-all">{x.referenciaExterna}</span>
                ) : (
                  <span className="text-tinta-tenue">Sin referencia</span>
                ),
              ],
              ['Fecha del pago', formatearFecha(x.fechaPago)],
              [
                'Código',
                <span key="codigo" className="font-mono text-[0.8rem]">
                  {x.referencia}
                </span>,
              ],
            ];
            return (
              <li
                key={x.id}
                className="grid grid-cols-1 gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
              >
                <div className="grid content-start gap-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/admin/revendedores/${x.revendedor.id}`}
                      className="font-medium hover:text-marca hover:underline"
                    >
                      {x.revendedor.nombre}
                    </Link>
                    <span className="text-xs text-tinta-tenue">
                      Reportada <time dateTime={x.creadoEn}>{haceCuanto(x.creadoEn)}</time>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-borde">
                    <div className="grid gap-0.5 bg-hundida px-4 py-3">
                      <span className="text-xs text-tinta-tenue">Declarado</span>
                      <span className="font-titulo text-lg font-semibold break-words tabular-nums">
                        {formatearMonto(x.montoDeclarado, x.moneda)}
                      </span>
                    </div>
                    <div className="grid gap-0.5 border-l border-borde bg-hundida px-4 py-3">
                      <span className="text-xs text-tinta-tenue">
                        Saldo a acreditar{x.moneda !== 'USD' ? ` (tasa ${x.tasa})` : ''}
                      </span>
                      <span className="font-titulo text-lg font-semibold break-words tabular-nums">
                        {formatearMonto(x.montoUsdEstimado, 'USD')}
                      </span>
                    </div>
                  </div>
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    {filas.map(([k, v]) => (
                      <div key={k} className="grid gap-0.5">
                        <dt className="text-xs text-tinta-tenue">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="grid content-start gap-3">
                  {x.tieneComprobante ? (
                    <a
                      href={`/api/v1/recargas-saldo/${x.id}/comprobante`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-2 text-sm font-medium text-marca hover:underline"
                    >
                      <Paperclip className="size-4" aria-hidden="true" />
                      Ver comprobante
                      <span className="sr-only">(se abre en una pestaña nueva)</span>
                    </a>
                  ) : (
                    <p className="inline-flex items-center gap-2 text-sm text-tinta-tenue">
                      <Paperclip className="size-4" aria-hidden="true" /> Sin comprobante
                    </p>
                  )}
                  <ConciliarRecarga recarga={x} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {datos && (
        <Paginacion
          ruta="/admin/revendedores"
          parametros={{ vista: 'recargas' }}
          pagina={datos.pagina}
          porPagina={datos.porPagina}
          total={datos.total}
        />
      )}
    </Tarjeta>
  );
}
