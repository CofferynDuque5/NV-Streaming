import type { PlanPublico, ProveedorPublico, ServicioPublico } from '@nv/shared';
import type { Metadata } from 'next';
import { ListaServicios } from '@/componentes/admin/catalogo';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Servicios' };

/** Los servicios de la tienda: se abre cada uno para cambiar logo, descripción, planes y precios. */
export default async function Servicios() {
  await requerirSesion({ permiso: 'catalogo.gestionar' });
  const [rServicios, rProveedores, rPlanes] = await Promise.all([
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
    leerApi<ProveedorPublico[]>('/catalogo/proveedores'),
    leerApi<PlanPublico[]>('/catalogo/planes'),
  ]);
  if (!rServicios.datos || !rProveedores.datos) {
    return (
      <Alerta tono="peligro" titulo="No pudimos cargar los servicios">
        Recarga la página en unos segundos.
      </Alerta>
    );
  }
  const planes = rPlanes.datos ?? [];
  const aLaVenta = Object.fromEntries(
    rServicios.datos.map((s) => [
      s.id,
      planes.filter((p) => p.servicio.id === s.id && p.activo && p.visible).length,
    ]),
  );
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Servicios</h1>
        <p className="text-tinta-suave">
          Abre un servicio para cambiar su logo, descripción, planes y precios para clientes y
          revendedores, o para dejar de venderlo.
        </p>
      </div>
      <Tarjeta>
        <CabeceraTarjeta
          titulo="Todos los servicios"
          descripcion={`${rServicios.datos.filter((s) => s.activo).length} activos de ${rServicios.datos.length}.`}
        />
        <ListaServicios
          servicios={rServicios.datos}
          proveedores={rProveedores.datos}
          puedeGestionar
          planesALaVenta={aLaVenta}
        />
      </Tarjeta>
    </>
  );
}
