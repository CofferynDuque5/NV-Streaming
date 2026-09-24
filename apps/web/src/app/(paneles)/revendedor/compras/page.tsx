import { type CompraPublica, formatearMonto, listarComprasSchema, type Pagina } from '@nv/shared';
import { ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';
import { FiltroSelector } from '@/componentes/admin/piezas-crm';
import { Paginacion } from '@/componentes/panel/paginacion';
import { EstadoCompraInsignia, SinFicha } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { TIPO_COMPRA } from '@/lib/revendedores';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis compras' };

type Crudo = Record<string, string | string[] | undefined>;

export default async function Compras({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['revendedor'] });
  const { filtro, consulta, parametros } = leerFiltro(listarComprasSchema, await searchParams, {
    porPagina: 20,
  });
  const { estado, datos: pagina } = await leerApi<Pagina<CompraPublica>>(
    `/revendedor/compras?${consulta}`,
  );
  const cabecera = (
    <CabeceraPagina
      titulo="Mis compras"
      descripcion="Cada activación y renovación que pagaste con tu saldo."
      acciones={<BotonEnlace href="/revendedor/catalogo">Nueva activación</BotonEnlace>}
    />
  );
  if (estado === 404) {
    return (
      <>
        {cabecera}
        <SinFicha />
      </>
    );
  }
  if (!pagina) {
    return (
      <>
        {cabecera}
        <Alerta tono="peligro">No pudimos cargar tus compras. Recarga la página.</Alerta>
      </>
    );
  }

  return (
    <>
      {cabecera}
      <Tarjeta>
        <form className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4 sm:px-6">
          <FiltroSelector
            id="filtro-estado"
            etiqueta="Estado"
            name="estado"
            defaultValue={filtro.estado ?? ''}
          >
            <option value="">Todas</option>
            <option value="completada">Completadas</option>
            <option value="reembolsada">Reembolsadas</option>
          </FiltroSelector>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          <p className="w-full text-sm text-tinta-tenue sm:ml-auto sm:w-auto">
            {pagina.total === 1 ? '1 compra' : `${pagina.total} compras`}
          </p>
        </form>
        {pagina.elementos.length === 0 ? (
          <EstadoVacio icono={ShoppingBag} titulo="Sin compras">
            {filtro.estado
              ? 'No hay compras con ese estado.'
              : 'Cuando compres una activación o renovación aparecerá aquí.'}
          </EstadoVacio>
        ) : (
          <Tabla minimo="46rem">
            <Encabezados
              columnas={[
                'Fecha',
                'Cliente',
                'Plan',
                { texto: 'Precio', className: 'text-right' },
                { texto: 'Estado', className: 'pr-5 sm:pr-6' },
              ]}
            />
            <Cuerpo>
              {pagina.elementos.map((c) => (
                <tr key={c.id}>
                  <Celda primera className="whitespace-nowrap text-tinta-suave">
                    <time dateTime={c.creadoEn}>{formatearFechaHora(c.creadoEn)}</time>
                  </Celda>
                  <Celda className="font-medium">{c.cliente.nombre}</Celda>
                  <Celda>
                    <span className="block">
                      {c.plan.servicio} · {c.plan.nombre}
                    </span>
                    <span className="block text-xs text-tinta-tenue">
                      {TIPO_COMPRA[c.tipo]}
                      {c.suscripcion.venceEn
                        ? ` · vence ${formatearFecha(c.suscripcion.venceEn)}`
                        : ''}
                    </span>
                  </Celda>
                  <Celda className="text-right whitespace-nowrap tabular-nums">
                    {formatearMonto(c.precioUsd, 'USD')}
                  </Celda>
                  <Celda className="pr-5 sm:pr-6">
                    <EstadoCompraInsignia estado={c.estado} />
                    {c.motivoReembolso && (
                      <span className="mt-1 block max-w-56 text-xs text-tinta-tenue">
                        {c.motivoReembolso}
                      </span>
                    )}
                  </Celda>
                </tr>
              ))}
            </Cuerpo>
          </Tabla>
        )}
        <Paginacion
          ruta="/revendedor/compras"
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
