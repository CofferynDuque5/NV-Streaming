import {
  type CuponPublico,
  DESCUENTO_MAXIMO_VENTAS,
  listarCuponesSchema,
  type PaginaCupones,
  type PlanPublico,
} from '@nv/shared';
import clsx from 'clsx';
import { Search, TicketPercent } from 'lucide-react';
import type { Metadata } from 'next';
import { InterruptorCupon, NuevoCupon } from '@/componentes/admin/cupones';
import { formatearDescuento } from '@/componentes/admin/formato-admin';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cupones' };

/** Estado visible del cupón según su vigencia y usos (a la hora de la petición). */
function estadoCupon(c: CuponPublico, ahora = Date.now()) {
  if (!c.activo) return { texto: 'Inactivo', tono: 'neutro' } as const;
  if (c.validoHasta && new Date(c.validoHasta).getTime() < ahora)
    return { texto: 'Caducado', tono: 'peligro' } as const;
  if (c.usosMaximos !== null && c.usos >= c.usosMaximos)
    return { texto: 'Agotado', tono: 'aviso' } as const;
  if (c.validoDesde && new Date(c.validoDesde).getTime() > ahora)
    return { texto: 'Programado', tono: 'marca' } as const;
  return { texto: 'Activo', tono: 'exito' } as const;
}

function vigencia(c: CuponPublico): string {
  if (c.validoDesde && c.validoHasta)
    return `${formatearFecha(c.validoDesde)} – ${formatearFecha(c.validoHasta)}`;
  if (c.validoDesde) return `Desde el ${formatearFecha(c.validoDesde)}`;
  if (c.validoHasta) return `Hasta el ${formatearFecha(c.validoHasta)}`;
  return 'Sin límite';
}

const POR_PAGINA = 50;

export default async function Cupones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'cupones.ver' });
  const puedeGestionar = sesion.permisos.includes('cupones.gestionar');
  const esVentas = sesion.usuario.rol === 'ventas';
  const crudo = await searchParams;
  const filtro = listarCuponesSchema.safeParse({
    ...Object.fromEntries(Object.entries(crudo).filter(([, v]) => v)),
    porPagina: POR_PAGINA,
  });
  const f = filtro.success ? filtro.data : listarCuponesSchema.parse({ porPagina: POR_PAGINA });
  const parametros = { busqueda: f.busqueda, estado: f.estado };
  const q = new URLSearchParams(
    Object.entries({
      ...parametros,
      pagina: String(f.pagina),
      porPagina: String(f.porPagina),
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const filtrado = Boolean(f.busqueda || f.estado);

  const [{ datos: cupones }, planes] = await Promise.all([
    leerApi<PaginaCupones>(`/cupones?${q}`),
    puedeGestionar && sesion.permisos.includes('catalogo.ver')
      ? leerApi<PlanPublico[]>('/catalogo/planes').then((r) => r.datos ?? [])
      : Promise.resolve([] as PlanPublico[]),
  ]);
  const lista = cupones?.elementos ?? [];

  return (
    <>
      <CabeceraPagina
        titulo="Cupones"
        descripcion={
          esVentas
            ? `Descuentos para tus clientes. Puedes crear cupones de hasta ${DESCUENTO_MAXIMO_VENTAS} % con un número máximo de usos, y activar o desactivar los tuyos.`
            : 'Códigos de descuento para altas y renovaciones. Cada cupón se aplica una vez por factura.'
        }
        acciones={puedeGestionar ? <NuevoCupon planes={planes} esVentas={esVentas} /> : undefined}
      />

      <Tarjeta>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">
            {filtrado ? 'Cupones encontrados' : 'Todos los cupones'}
          </h2>
          {cupones && (
            <p className="text-sm text-tinta-tenue tabular-nums">
              {cupones.vigentes === 1 ? '1 vigente' : `${cupones.vigentes} vigentes`} de{' '}
              {cupones.total}
            </p>
          )}
        </header>
        <form
          className="flex flex-wrap items-end gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
        >
          <div className="relative min-w-52 flex-1">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por código
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden="true"
            />
            <input
              id="busqueda"
              name="busqueda"
              defaultValue={f.busqueda}
              placeholder="Buscar por código"
              className={`${clasesEntrada} pl-9`}
            />
          </div>
          <label className="sr-only" htmlFor="filtro-estado">
            Estado
          </label>
          <select
            id="filtro-estado"
            name="estado"
            defaultValue={f.estado ?? ''}
            className={`${clasesEntrada} w-auto`}
          >
            <option value="">Activos e inactivos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>
        {!cupones ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar los cupones. Recarga la página.</Alerta>
          </div>
        ) : lista.length === 0 && filtrado ? (
          <EstadoVacio icono={TicketPercent} titulo="No hay cupones con esos filtros" />
        ) : lista.length === 0 ? (
          <EstadoVacio icono={TicketPercent} titulo="Todavía no hay cupones">
            {puedeGestionar
              ? 'Crea el primero con «Nuevo cupón». Podrás limitarlo por fechas, usos y planes.'
              : 'Cuando el equipo cree cupones aparecerán aquí.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="64rem">
            <Encabezados
              columnas={[
                'Código',
                { texto: 'Descuento', className: 'text-right' },
                'Vigencia',
                { texto: 'Usos', className: 'text-right' },
                'Aplica a',
                'Creado por',
                'Estado',
                ...(puedeGestionar
                  ? [{ texto: 'Acción', className: 'pr-5 text-right sm:pr-6' }]
                  : []),
              ]}
            />
            <Cuerpo>
              {lista.map((c) => {
                const e = estadoCupon(c);
                const puedeCambiar =
                  puedeGestionar && (!esVentas || c.creadoPor.id === sesion.usuario.id);
                return (
                  <tr key={c.id} className={clsx(!c.activo && 'text-tinta-suave')}>
                    <Celda primera>
                      <span className="rounded-md border border-dashed border-borde-fuerte bg-hundida px-2 py-1 font-mono text-[0.8rem] font-semibold tracking-wide">
                        {c.codigo}
                      </span>
                    </Celda>
                    <Celda className="text-right font-titulo font-semibold tabular-nums">
                      {formatearDescuento(c)}
                    </Celda>
                    <Celda className="text-tinta-suave">{vigencia(c)}</Celda>
                    <Celda className="text-right tabular-nums">
                      {c.usos}
                      <span className="text-tinta-tenue"> / {c.usosMaximos ?? '∞'}</span>
                    </Celda>
                    <Celda>
                      <span className="block">
                        {c.soloAltas ? 'Solo altas' : 'Altas y renovaciones'}
                      </span>
                      <span
                        className="block max-w-56 truncate text-xs text-tinta-tenue"
                        title={c.planes.map((p) => p.nombre).join(', ') || undefined}
                      >
                        {c.planes.length === 0
                          ? 'Todos los planes'
                          : c.planes.map((p) => p.nombre).join(', ')}
                      </span>
                    </Celda>
                    <Celda>
                      <span className="block">{c.creadoPor.nombre}</span>
                      <span className="block text-xs text-tinta-tenue">
                        {formatearFecha(c.creadoEn)}
                      </span>
                    </Celda>
                    <Celda>
                      <Insignia tono={e.tono}>{e.texto}</Insignia>
                    </Celda>
                    {puedeGestionar && (
                      <Celda className="pr-5 text-right sm:pr-6">
                        {puedeCambiar ? (
                          <InterruptorCupon id={c.id} codigo={c.codigo} activo={c.activo} />
                        ) : (
                          <span className="text-xs text-tinta-tenue">Creado por otra persona</span>
                        )}
                      </Celda>
                    )}
                  </tr>
                );
              })}
            </Cuerpo>
          </Tabla>
        )}
        {cupones && (
          <Paginacion
            ruta="/admin/cupones"
            parametros={parametros}
            pagina={cupones.pagina}
            porPagina={cupones.porPagina}
            total={cupones.total}
          />
        )}
      </Tarjeta>
    </>
  );
}
