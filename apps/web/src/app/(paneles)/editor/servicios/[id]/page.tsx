import {
  INFO_CATEGORIA,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
  uuidSchema,
} from '@nv/shared';
import { ArrowLeft, ExternalLink, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioServicio, NuevoPlan } from '@/componentes/admin/catalogo';
import { PlanesServicio } from '@/componentes/admin/editor-servicio';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearMonto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Editar servicio' };

/**
 * Editor de un servicio en una sola pantalla: logo, nombre, descripción y
 * categoría; sus planes con el precio para el cliente y para revendedores; y
 * los interruptores para venderlo o no.
 */
export default async function EditarServicio({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion({ permiso: 'catalogo.gestionar' });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const [rServicios, rPlanes, rProveedores] = await Promise.all([
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
    leerApi<PlanPublico[]>('/catalogo/planes'),
    leerApi<ProveedorPublico[]>('/catalogo/proveedores'),
  ]);
  if (!rServicios.datos || !rPlanes.datos) {
    return (
      <Alerta tono="peligro" titulo="No pudimos cargar el servicio">
        Recarga la página en unos segundos.
      </Alerta>
    );
  }
  const servicio = rServicios.datos.find((s) => s.id === id);
  if (!servicio) notFound();
  const planes = rPlanes.datos
    .filter((p) => p.servicio.id === id)
    .sort((a, b) => a.orden - b.orden || Number(a.precioUsd) - Number(b.precioUsd));
  const enVenta = planes.filter((p) => p.activo && p.visible);
  const desde = enVenta.length
    ? enVenta.reduce((m, p) => (Number(p.precioUsd) < Number(m.precioUsd) ? p : m))
    : null;

  return (
    <>
      <CabeceraPagina
        titulo={servicio.nombre}
        descripcion="Todo el servicio en una pantalla: logo, descripción, planes y precios. Los interruptores se guardan al tocarlos."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/editor/servicios"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-borde px-3.5 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Servicios
            </Link>
            <a
              href={`/catalogo/${servicio.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-borde px-3.5 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            >
              <ExternalLink className="size-4" aria-hidden="true" /> Ver en la tienda
            </a>
          </div>
        }
      />

      <div className="grid items-start gap-5.5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-5.5">
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Datos del servicio"
              descripcion="Lo que ve el cliente en la tienda: logo, nombre, descripción y categoría."
            />
            <div className="p-5 sm:p-6">
              <FormularioServicio servicio={servicio} proveedores={rProveedores.datos ?? []} />
            </div>
          </Tarjeta>
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Planes y precios"
              descripcion="Precio para el cliente y para revendedores (en USD; las demás monedas siguen la tasa del día). Deja vacío el de revendedor si no lo revendes."
            />
            {planes.length === 0 ? (
              <EstadoVacio icono={Layers} titulo="Este servicio todavía no tiene planes">
                Agrega el primero abajo: por ejemplo «1 pantalla, 30 días».
              </EstadoVacio>
            ) : (
              <PlanesServicio planes={planes} />
            )}
            <div className="border-t border-borde px-5 py-4 sm:px-6">
              <NuevoPlan servicios={[servicio]} />
            </div>
          </Tarjeta>
        </div>

        <aside aria-label="Así se ve en la tienda" className="grid gap-3 xl:sticky xl:top-6">
          <p className="text-xs font-bold tracking-[0.12em] text-tinta-tenue uppercase">
            Así se ve en la tienda
          </p>
          <Tarjeta className="grid gap-3 p-5">
            <div className="flex items-center gap-3">
              {servicio.imagen ? (
                <img
                  src={servicio.imagen.url}
                  alt=""
                  className="size-16 shrink-0 rounded-2xl border border-borde bg-hundida object-contain"
                />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-borde bg-hundida text-xl font-bold text-tinta-suave">
                  {servicio.nombre.slice(0, 1)}
                </span>
              )}
              <div className="grid min-w-0 gap-1">
                <b className="truncate text-lg">{servicio.nombre}</b>
                <span className="text-xs text-tinta-tenue">
                  {servicio.categoria ? INFO_CATEGORIA[servicio.categoria].nombre : 'Sin categoría'}
                </span>
              </div>
            </div>
            <p className="text-sm text-tinta-suave">
              {servicio.descripcion ?? (
                <span className="text-tinta-tenue">Sin descripción todavía.</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
              {!servicio.activo ? (
                <Insignia tono="aviso">Desactivado: no se vende</Insignia>
              ) : desde ? (
                <span className="text-sm">
                  Desde{' '}
                  <b className="text-base">{formatearMonto(String(desde.precioUsd), 'USD')}</b>
                </span>
              ) : (
                <Insignia tono="aviso">Sin planes a la venta</Insignia>
              )}
              <span className="ml-auto text-xs text-tinta-tenue">
                {enVenta.length} de {planes.length} planes a la venta
              </span>
            </div>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
