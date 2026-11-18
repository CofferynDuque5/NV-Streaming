import type { PlataformaCuentas } from '@nv/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Volver } from '@/componentes/admin/piezas-crm';
import { PlataformaGestor } from '@/componentes/admin/plataformas';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Plataforma' };

/** Hora del servidor al pintar: los días que faltan se cuentan desde aquí. */
const ahoraMs = () => new Date().getTime();

export default async function Plataforma({ params }: { params: Promise<{ servicioId: string }> }) {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { servicioId } = await params;
  const r = await leerApi<PlataformaCuentas>(
    `/cuentas/plataforma/${encodeURIComponent(servicioId)}`,
  );
  if (r.estado === 404 || r.estado === 400) notFound();
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);
  if (!r.datos) {
    return <Alerta tono="peligro">No pudimos cargar la plataforma. Recarga la página.</Alerta>;
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Volver href="/admin/plataformas">Plataformas</Volver>
        {puede('cuentas.gestionar') && (
          <BotonEnlace href={`/admin/cuentas?servicioId=${r.datos.servicio.id}`} tamano="sm">
            <Plus className="size-4" aria-hidden /> Agregar cuenta
          </BotonEnlace>
        )}
      </div>
      <PlataformaGestor
        datos={r.datos}
        ahora={ahoraMs()}
        permisos={{
          gestionar: puede('cuentas.gestionar'),
          revelar: puede('cuentas.revelar'),
          codigos: puede('codigos.consultar'),
          alta: puede('suscripciones.crear')
            ? {
                puedeCobrar: puede('pagos.gestionar'),
                puedeCrearCliente: puede('clientes.gestionar'),
              }
            : undefined,
        }}
      />
    </div>
  );
}
