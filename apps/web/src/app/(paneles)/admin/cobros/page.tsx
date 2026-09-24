import {
  ESTADOS_FACTURA,
  type EstadoFactura,
  type FacturaPublica,
  listarFacturasSchema,
  listarPagosSchema,
  type Pagina,
  type PagoPublico,
} from '@nv/shared';
import clsx from 'clsx';
import {
  CircleCheckBig,
  FileSearch,
  FileText,
  Globe,
  Paperclip,
  ReceiptText,
  Repeat,
  TriangleAlert,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ConciliarPago } from '@/componentes/admin/cobros';
import { TablaCobrosAutomaticos } from '@/componentes/admin/cobros-automaticos';
import { mismoImporte } from '@/componentes/admin/formato-admin';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoFacturaInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, EnlaceFila, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha, formatearMonto, haceCuanto } from '@/lib/formato';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cobros' };

type Vista = 'conciliar' | 'facturas' | 'automaticos';
type Crudo = Record<string, string | string[] | undefined>;

const FILTRO_ESTADO: Record<EstadoFactura, string> = {
  emitida: 'Pendientes de pago',
  pagada: 'Pagadas',
  anulada: 'Anuladas',
};

export default async function Cobros({ searchParams }: { searchParams: Promise<Crudo> }) {
  const sesion = await requerirSesion({ permiso: 'facturas.ver' });
  const puedeConciliar = sesion.permisos.includes('pagos.gestionar');
  const crudo = await searchParams;
  const pedida =
    crudo.vista === 'facturas' || crudo.vista === 'conciliar' || crudo.vista === 'automaticos'
      ? crudo.vista
      : null;
  const vista: Vista =
    pedida === 'automaticos'
      ? 'automaticos'
      : pedida === 'facturas' || !puedeConciliar
        ? 'facturas'
        : (pedida ?? 'conciliar');

  // El total de la cola se muestra en la pestaña aunque se esté viendo la otra.
  const enRevision = puedeConciliar
    ? vista === 'conciliar'
      ? null
      : ((await leerApi<Pagina<PagoPublico>>('/pagos?estado=en_revision&porPagina=1')).datos
          ?.total ?? null)
    : null;

  return (
    <>
      <CabeceraPagina
        titulo="Cobros"
        descripcion={
          puedeConciliar
            ? 'Concilia los pagos que reportan los clientes y consulta todas las facturas.'
            : 'Facturas de tu cartera de clientes y su estado de pago.'
        }
      />
      <Pestanas vista={vista} enRevision={enRevision} puedeConciliar={puedeConciliar} />
      {vista === 'conciliar' && <ColaConciliacion crudo={crudo} />}
      {vista === 'facturas' && <Facturas crudo={crudo} />}
      {vista === 'automaticos' && (
        <TablaCobrosAutomaticos
          crudo={crudo}
          ruta="/admin/cobros"
          fijos={{ vista: 'automaticos' }}
        />
      )}
    </>
  );
}

function Pestanas({
  vista,
  enRevision,
  puedeConciliar,
}: {
  vista: Vista;
  enRevision: number | null;
  puedeConciliar: boolean;
}) {
  const pestanas: { id: Vista; texto: string; icono: typeof FileSearch }[] = [
    ...(puedeConciliar
      ? [{ id: 'conciliar' as const, texto: 'Por conciliar', icono: FileSearch }]
      : []),
    { id: 'facturas', texto: 'Facturas', icono: ReceiptText },
    { id: 'automaticos', texto: 'Cobros automáticos', icono: Repeat },
  ];
  return (
    <nav aria-label="Vistas de cobros" className="-mt-2 max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-xl border border-borde bg-hundida p-1">
        {pestanas.map(({ id, texto, icono: Icono }) => {
          const activa = vista === id;
          return (
            <li key={id}>
              <Link
                href={`/admin/cobros?vista=${id}`}
                aria-current={activa ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                  activa
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:bg-superficie/60 hover:text-tinta',
                )}
              >
                <Icono className={clsx('size-4', activa && 'text-marca')} aria-hidden="true" />
                {texto}
                {id === 'conciliar' && enRevision !== null && enRevision > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-aviso px-1.5 text-[0.7rem] font-semibold text-fondo tabular-nums">
                    {enRevision}
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

// ── Por conciliar ────────────────────────────────────────────────────────────

async function ColaConciliacion({ crudo }: { crudo: Crudo }) {
  const { filtro, consulta } = leerFiltro(listarPagosSchema, crudo, {
    estado: 'en_revision',
    porPagina: 20,
  });
  const { datos } = await leerApi<Pagina<PagoPublico>>(`/pagos?${consulta}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };

  return (
    <Tarjeta>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Pagos por conciliar</h2>
          <p className="text-sm text-tinta-suave">
            Comprueba cada pago en el banco antes de confirmarlo. Primero los más antiguos.
          </p>
        </div>
        <Insignia tono={pagina.total > 0 ? 'aviso' : 'exito'}>
          {pagina.total === 1 ? '1 en revisión' : `${pagina.total} en revisión`}
        </Insignia>
      </header>
      {!datos && (
        <div className="p-5 sm:p-6">
          <Alerta tono="peligro">No pudimos cargar la cola. Recarga la página.</Alerta>
        </div>
      )}
      {datos && pagina.elementos.length === 0 ? (
        <EstadoVacio icono={CircleCheckBig} titulo="No hay pagos pendientes de revisar">
          Cuando un cliente reporte un pago aparecerá aquí para que lo confirmes o lo rechaces.
        </EstadoVacio>
      ) : (
        <ol className="divide-y divide-borde">
          {pagina.elementos.map((p) => (
            <PagoEnCola key={p.id} pago={p} />
          ))}
        </ol>
      )}
      <Paginacion
        ruta="/admin/cobros"
        parametros={{ vista: 'conciliar', clienteId: filtro.clienteId }}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
      />
    </Tarjeta>
  );
}

function PagoEnCola({ pago: p }: { pago: PagoPublico }) {
  const coincide = p.moneda === p.factura.moneda && mismoImporte(p.montoDeclarado, p.factura.total);
  const datos: [string, ReactNode][] = [
    ['Método', p.metodo.nombre],
    [
      'Referencia del banco',
      p.referenciaExterna ? (
        <span className="font-mono text-[0.8rem] break-all">{p.referenciaExterna}</span>
      ) : (
        <span className="text-tinta-tenue">Sin referencia</span>
      ),
    ],
    ['Fecha del pago', formatearFecha(p.fechaPago)],
  ];

  return (
    <li className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/admin/clientes/${p.cliente.id}`}
            className="font-medium hover:text-marca hover:underline"
          >
            {p.cliente.nombre}
          </Link>
          <Link
            href={`/admin/cobros/facturas/${p.factura.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-borde bg-hundida px-2 py-0.5 font-mono text-xs text-tinta-suave hover:border-marca/40 hover:text-marca"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {p.factura.numero}
          </Link>
          {p.origen === 'pasarela' && (
            <Insignia tono="acento">
              <Globe className="size-3" aria-hidden="true" /> En línea ·{' '}
              {nombrePasarela(p.pasarela)}
            </Insignia>
          )}
          <span className="text-xs text-tinta-tenue">
            Reportado <time dateTime={p.creadoEn}>{haceCuanto(p.creadoEn)}</time>
          </span>
        </div>

        <div
          className={clsx(
            'grid grid-cols-2 overflow-hidden rounded-xl border',
            coincide ? 'border-borde' : 'border-aviso/40',
          )}
        >
          <div
            className={clsx('grid gap-0.5 px-4 py-3', coincide ? 'bg-hundida' : 'bg-aviso-suave')}
          >
            <span className="text-xs text-tinta-tenue">Declarado por el cliente</span>
            <span
              className={clsx(
                'font-titulo text-lg font-semibold tabular-nums',
                !coincide && 'text-aviso',
              )}
            >
              {formatearMonto(p.montoDeclarado, p.moneda)}
            </span>
          </div>
          <div className="grid gap-0.5 border-l border-borde bg-hundida px-4 py-3">
            <span className="text-xs text-tinta-tenue">Total de la factura</span>
            <span className="font-titulo text-lg font-semibold tabular-nums">
              {formatearMonto(p.factura.total, p.factura.moneda)}
            </span>
          </div>
        </div>
        {!coincide && (
          <p className="-mt-2 flex items-center gap-2 text-sm text-aviso">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            El monto declarado no coincide con el total. Revisa lo que llegó al banco.
          </p>
        )}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {datos.map(([k, v]) => (
            <div key={k} className="grid gap-0.5">
              <dt className="text-xs text-tinta-tenue">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid content-start gap-3">
        {p.tieneComprobante ? (
          <a
            href={`/api/v1/pagos/${p.id}/comprobante`}
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
            <Paperclip className="size-4" aria-hidden="true" /> Sin comprobante adjunto
          </p>
        )}
        <ConciliarPago pago={p} totalFactura={p.factura.total} />
      </div>
    </li>
  );
}

// ── Facturas ─────────────────────────────────────────────────────────────────

async function Facturas({ crudo }: { crudo: Crudo }) {
  const { filtro, consulta, parametros } = leerFiltro(listarFacturasSchema, crudo, {
    porPagina: 20,
  });
  const { datos } = await leerApi<Pagina<FacturaPublica>>(`/facturas?${consulta}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };
  const hayFiltros = Boolean(filtro.estado || filtro.vencidas || filtro.clienteId);

  return (
    <Tarjeta>
      <form
        className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6"
        role="search"
        aria-label="Filtrar facturas"
      >
        <input type="hidden" name="vista" value="facturas" />
        {filtro.clienteId && <input type="hidden" name="clienteId" value={filtro.clienteId} />}
        <label htmlFor="filtro-estado" className="sr-only">
          Estado
        </label>
        <select
          id="filtro-estado"
          name="estado"
          defaultValue={filtro.estado ?? ''}
          className={`${clasesEntrada} w-auto`}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_FACTURA.map((e) => (
            <option key={e} value={e}>
              {FILTRO_ESTADO[e]}
            </option>
          ))}
        </select>
        <label className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-borde-fuerte bg-hundida px-3.5 text-sm">
          <input
            type="checkbox"
            name="vencidas"
            value="true"
            defaultChecked={filtro.vencidas === true}
            className="size-4 accent-[var(--nv-marca)]"
          />
          Solo vencidas
        </label>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        {hayFiltros && (
          <Link
            href="/admin/cobros?vista=facturas"
            className="text-sm text-tinta-suave hover:text-tinta hover:underline"
          >
            Quitar filtros
          </Link>
        )}
        <p className="ml-auto text-sm text-tinta-tenue tabular-nums">
          {pagina.total === 1 ? '1 factura' : `${pagina.total} facturas`}
        </p>
      </form>

      {!datos ? (
        <div className="p-5 sm:p-6">
          <Alerta tono="peligro">No pudimos cargar las facturas. Recarga la página.</Alerta>
        </div>
      ) : pagina.elementos.length === 0 ? (
        <EstadoVacio icono={ReceiptText} titulo="No hay facturas con esos filtros">
          {hayFiltros
            ? 'Prueba con otro estado o quita los filtros.'
            : 'Las facturas se crean al dar de alta o renovar una suscripción.'}
        </EstadoVacio>
      ) : (
        <Tabla minimo="56rem">
          <Encabezados
            columnas={[
              'Número',
              'Cliente',
              'Concepto',
              { texto: 'Total', className: 'text-right' },
              'Estado',
              'Vence',
              'Pago',
            ]}
          />
          <Cuerpo>
            {pagina.elementos.map((f) => (
              <Fila key={f.id} href={`/admin/cobros/facturas/${f.id}`}>
                <Celda primera>
                  <EnlaceFila href={`/admin/cobros/facturas/${f.id}`}>
                    <span className="font-mono text-[0.8rem] font-medium">{f.numero}</span>
                  </EnlaceFila>
                </Celda>
                <Celda className="max-w-56 truncate">{f.cliente.nombre}</Celda>
                <Celda className="text-tinta-suave">
                  {f.concepto === 'alta' ? 'Alta' : 'Renovación'}
                </Celda>
                <Celda className="text-right">
                  <span className="block font-medium tabular-nums">
                    {formatearMonto(f.total, f.moneda)}
                  </span>
                  {f.moneda !== 'USD' && (
                    <span className="block text-xs text-tinta-tenue tabular-nums">
                      ≈ {formatearMonto(f.totalUsd, 'USD')}
                    </span>
                  )}
                </Celda>
                <Celda>
                  <EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />
                </Celda>
                <Celda>
                  <span className="block">{formatearFecha(f.venceEn)}</span>
                  {f.estado === 'emitida' && (
                    <span
                      className={clsx(
                        'block text-xs',
                        f.vencida ? 'text-peligro' : 'text-tinta-tenue',
                      )}
                    >
                      {haceCuanto(f.venceEn)}
                    </span>
                  )}
                </Celda>
                <Celda>
                  {f.pagoEnRevision ? (
                    <Insignia tono="aviso">En revisión</Insignia>
                  ) : (
                    <span className="text-tinta-tenue" aria-label="Sin pago en revisión">
                      —
                    </span>
                  )}
                </Celda>
              </Fila>
            ))}
          </Cuerpo>
        </Tabla>
      )}
      <Paginacion
        ruta="/admin/cobros"
        parametros={{ ...parametros, vista: 'facturas' }}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
      />
    </Tarjeta>
  );
}
