import type { Inventario, PlataformaCuentas } from '@nv/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Volver } from '@/componentes/admin/piezas-crm';
import { PlataformaGestor } from '@/componentes/admin/plataformas';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Plataforma' };

/** Hora del servidor al pintar: los días que faltan se cuentan desde aquí. */
const ahoraMs = () => new Date().getTime();

export default async function Plataforma({
  params,
  searchParams,
}: {
  params: Promise<{ servicioId: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { servicioId } = await params;
  const vista = (await searchParams).vista === 'clientes' ? 'clientes' : 'cuentas';
  const [r, inventario] = await Promise.all([
    leerApi<PlataformaCuentas>(`/cuentas/plataforma/${encodeURIComponent(servicioId)}`),
    leerApi<Inventario>('/cuentas/inventario'),
  ]);
  if (r.estado === 404 || r.estado === 400) notFound();
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);
  if (!r.datos) {
    return <Alerta tono="peligro">No pudimos cargar la plataforma. Recarga la página.</Alerta>;
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Volver href="/admin/plataformas">Plataformas</Volver>
      <PlataformaGestor
        key={vista}
        datos={r.datos}
        ahora={ahoraMs()}
        vista={vista}
        servicios={inventario.datos?.servicios}
        nuevaCuenta={puede('cuentas.gestionar')}
        permisos={{
          gestionar: puede('cuentas.gestionar'),
          revelar: puede('cuentas.revelar'),
          codigos: puede('codigos.consultar'),
          editarNombre: puede('catalogo.gestionar'),
          alta: puede('suscripciones.crear')
            ? {
                cobrar: puede('pagos.gestionar'),
                crearCliente: puede('clientes.gestionar'),
                revelar: puede('cuentas.revelar'),
                crearCuenta: puede('cuentas.gestionar'),
              }
            : undefined,
        }}
      />
    </div>
  );
}
