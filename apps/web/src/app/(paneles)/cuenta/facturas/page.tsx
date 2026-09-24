import { type FacturaPublica, formatearMonto, listarFacturasSchema, type Pagina } from '@nv/shared';
import { Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import { Paginacion } from '@/componentes/panel/paginacion';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoFacturaInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Celda, Cuerpo, EnlaceFila, Encabezados, Fila, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Facturas y pagos' };

export default async function MisFacturas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const { filtro, consulta, parametros } = leerFiltro(listarFacturasSchema, await searchParams, {
    porPagina: 20,
  });
  const { datos } = await leerApi<Pagina<FacturaPublica>>(`/mi/facturas?${consulta}`);

  return (
    <>
      <CabeceraPagina
        titulo="Facturas y pagos"
        descripcion="Todas tus facturas. Entra en una para pagarla o ver los comprobantes que enviaste."
      />
      <Tarjeta>
        {!datos || datos.elementos.length === 0 ? (
          <EstadoVacio
            icono={Receipt}
            titulo="Aún no tienes facturas"
            accion={<BotonEnlace href="/cuenta/planes">Ver planes</BotonEnlace>}
          >
            Cuando contrates o renueves un plan, la factura aparecerá aquí.
          </EstadoVacio>
        ) : (
          <>
            <Tabla minimo="34rem">
              <Encabezados
                columnas={[
                  'Factura',
                  'Fecha',
                  'Total',
                  { texto: 'Estado', className: 'pr-5 sm:pr-6' },
                ]}
              />
              <Cuerpo>
                {datos.elementos.map((f) => (
                  <Fila key={f.id} href={`/cuenta/facturas/${f.id}`}>
                    <Celda className="px-5 font-medium sm:px-6">
                      <EnlaceFila href={`/cuenta/facturas/${f.id}`}>{f.numero}</EnlaceFila>
                      <span className="block text-xs font-normal text-tinta-tenue">
                        {f.concepto === 'alta' ? 'Alta' : 'Renovación'}
                      </span>
                    </Celda>
                    <Celda className="text-tinta-suave">{formatearFecha(f.creadoEn)}</Celda>
                    <Celda className="tabular-nums">{formatearMonto(f.total, f.moneda)}</Celda>
                    <Celda className="pr-5 sm:pr-6">
                      <EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />
                      {f.pagoEnRevision && (
                        <span className="block text-xs text-tinta-tenue">Pago en revisión</span>
                      )}
                    </Celda>
                  </Fila>
                ))}
              </Cuerpo>
            </Tabla>
            <Paginacion
              ruta="/cuenta/facturas"
              parametros={parametros}
              pagina={filtro.pagina}
              porPagina={filtro.porPagina}
              total={datos.total}
            />
          </>
        )}
      </Tarjeta>
    </>
  );
}
