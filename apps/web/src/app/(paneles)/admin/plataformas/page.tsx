import type { Inventario } from '@nv/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { GrillaPlataformas } from '@/componentes/admin/plataformas';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Plataformas' };

/** Como el Gestor: una tarjeta por plataforma con sus clientes, por vencer y vencidos. */
export default async function Plataformas() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { datos } = await leerApi<Inventario>('/cuentas/inventario');
  return (
    <>
      <CabeceraPagina
        titulo="Plataformas"
        descripcion="Toca una plataforma para ver sus cuentas completas e individuales, agregar clientes a los perfiles libres, avisar datos, mover o cortar."
        acciones={
          sesion.permisos.includes('cuentas.gestionar') ? (
            <BotonEnlace href="/admin/cuentas" tamano="sm">
              <Plus className="size-4" aria-hidden /> Agregar cuenta
            </BotonEnlace>
          ) : null
        }
      />
      {datos ? (
        <GrillaPlataformas servicios={datos.servicios} />
      ) : (
        <Alerta tono="peligro">No pudimos cargar las plataformas. Recarga la página.</Alerta>
      )}
    </>
  );
}
