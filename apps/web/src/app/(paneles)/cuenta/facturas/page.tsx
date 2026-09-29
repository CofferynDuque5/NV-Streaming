import {
  type EstadoFactura,
  type FacturaPublica,
  formatearMonto,
  listarFacturasSchema,
  type Pagina,
} from '@nv/shared';
import { Tag } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PildoraEstado } from '@/componentes/cliente/pago';
import {
  CabeceraCuenta,
  claseFila,
  claseLista,
  estadoFactura,
  fechaLarga,
  Vacio,
} from '@/componentes/cliente/piezas-cuenta';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Facturas y pagos' };

const FILTROS: [EstadoFactura | undefined, string][] = [
  [undefined, 'Todas'],
  ['emitida', 'Pendientes'],
  ['pagada', 'Pagadas'],
  ['anulada', 'Anuladas'],
];

/** «Renovación · NV Cine Mensual»: el concepto es el título de la fila. */
function concepto(f: FacturaPublica) {
  const tipo = f.concepto === 'alta' ? 'Alta' : 'Renovación';
  return f.plan ? `${tipo} · ${f.plan.servicio.nombre} ${f.plan.nombre}` : tipo;
}

export default async function MisFacturas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const { filtro, consulta, parametros } = leerFiltro(listarFacturasSchema, await searchParams, {
    porPagina: 20,
  });
  // Cuántas hay de cada estado, para los filtros (solo se pide el total).
  const [{ datos }, ...cuentas] = await Promise.all([
    leerApi<Pagina<FacturaPublica>>(`/mi/facturas?${consulta}`),
    ...FILTROS.map(([estado]) =>
      leerApi<Pagina<FacturaPublica>>(
        `/mi/facturas?porPagina=1${estado ? `&estado=${estado}` : ''}`,
      ),
    ),
  ]);
  const totalDe = (i: number) => cuentas[i]?.datos?.total ?? 0;
  const hayFacturas = totalDe(0) > 0;

  return (
    <>
      <CabeceraCuenta
        titulo="Facturas y pagos"
        descripcion="Cada plan tiene su factura. Toca una para pagarla o ver sus comprobantes."
      />
      {!datos ? (
        <Alerta tono="peligro" titulo="No pudimos cargar tus facturas">
          Recarga la página en unos segundos.
        </Alerta>
      ) : !hayFacturas ? (
        <Vacio
          icono={<Tag className="size-5" aria-hidden="true" />}
          titulo="Todavía no tienes facturas"
          accion={
            <BotonEnlace href="/catalogo" variante="secundario">
              Ver el catálogo
            </BotonEnlace>
          }
        >
          Cuando contrates o renueves un plan, su factura aparece aquí.
        </Vacio>
      ) : (
        <>
          <nav aria-label="Filtrar facturas" className="flex flex-wrap gap-2">
            {FILTROS.map(([estado, nombre], i) => (
              <Link
                key={nombre}
                href={estado ? `/cuenta/facturas?estado=${estado}` : '/cuenta/facturas'}
                className="chip"
                aria-current={filtro.estado === estado ? 'page' : undefined}
              >
                {nombre} · {totalDe(i)}
              </Link>
            ))}
          </nav>
          {datos.elementos.length === 0 ? (
            <Vacio>
              No hay facturas con ese estado.{' '}
              <Link href="/cuenta/facturas" className="font-semibold text-cian hover:underline">
                Ver todas
              </Link>
            </Vacio>
          ) : (
            <div className={claseLista}>
              {datos.elementos.map((f) => {
                const [estado, tono] = estadoFactura(f.estado, f.vencida);
                return (
                  <Link key={f.id} href={`/cuenta/facturas/${f.id}`} className={claseFila}>
                    <span
                      className="grid size-[2.375rem] place-items-center rounded-xl border border-borde-fuerte text-cian"
                      aria-hidden="true"
                    >
                      <Tag className="size-4" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <b className="truncate text-[0.92rem] font-semibold">{concepto(f)}</b>
                      <small className="truncate text-[0.8rem] text-tinta-suave">
                        {f.numero} · {fechaLarga(f.creadoEn)}
                        {f.estado === 'emitida'
                          ? f.pagoEnRevision
                            ? ' · pago en revisión'
                            : ` · pagar antes del ${fechaLarga(f.venceEn)}`
                          : ''}
                      </small>
                    </span>
                    <span className="col-start-2 flex items-center gap-2.5 tabular-nums sm:col-start-auto sm:grid sm:justify-items-end sm:gap-1.5">
                      <strong className="font-titulo text-[0.95rem] whitespace-nowrap">
                        {formatearMonto(f.total, f.moneda)}
                      </strong>
                      <PildoraEstado texto={estado} tono={tono} />
                    </span>
                  </Link>
                );
              })}
              <Paginacion
                ruta="/cuenta/facturas"
                parametros={parametros}
                pagina={filtro.pagina}
                porPagina={filtro.porPagina}
                total={datos.total}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
