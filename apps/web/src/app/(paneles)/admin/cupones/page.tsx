import { type CuponPublico, DESCUENTO_MAXIMO_VENTAS, type PlanPublico } from '@nv/shared';
import clsx from 'clsx';
import { TicketPercent } from 'lucide-react';
import type { Metadata } from 'next';
import { InterruptorCupon, NuevoCupon } from '@/componentes/admin/cupones';
import { formatearDescuento } from '@/componentes/admin/formato-admin';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
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

export default async function Cupones() {
  const sesion = await requerirSesion({ permiso: 'cupones.ver' });
  const puedeGestionar = sesion.permisos.includes('cupones.gestionar');
  const esVentas = sesion.usuario.rol === 'ventas';

  const [{ datos: cupones }, planes] = await Promise.all([
    leerApi<CuponPublico[]>('/cupones'),
    puedeGestionar && sesion.permisos.includes('catalogo.ver')
      ? leerApi<PlanPublico[]>('/catalogo/planes').then((r) => r.datos ?? [])
      : Promise.resolve([] as PlanPublico[]),
  ]);
  const lista = cupones ?? [];
  const activos = lista.filter((c) => estadoCupon(c).texto === 'Activo').length;

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
          <h2 className="text-base font-semibold">Todos los cupones</h2>
          <p className="text-sm text-tinta-tenue tabular-nums">
            {activos === 1 ? '1 vigente' : `${activos} vigentes`} de {lista.length}
          </p>
        </header>
        {!cupones ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar los cupones. Recarga la página.</Alerta>
          </div>
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
      </Tarjeta>
    </>
  );
}
