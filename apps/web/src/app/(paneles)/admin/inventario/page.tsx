import type { Inventario } from '@nv/shared';
import { Gem, MailSearch, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { InventarioCuentas } from '@/componentes/admin/inventario-cuentas';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Inventario' };

/** Hora del servidor al pintar: los días que faltan se cuentan desde aquí. */
const ahoraMs = () => new Date().getTime();

export default async function InventarioPagina() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { datos } = await leerApi<Inventario>('/cuentas/inventario');
  const puede = (p: (typeof sesion.permisos)[number]) => sesion.permisos.includes(p);

  return (
    <>
      <CabeceraPagina
        titulo="Inventario"
        descripcion="Todas tus cuentas con sus perfiles: cuáles están libres, quién usa cada uno y cuándo vence. Toca una cuenta para asignar perfiles, poner el PIN o ver los datos."
        acciones={
          <div className="flex flex-wrap gap-2">
            {puede('codigos.consultar') && (
              <BotonEnlace href="/admin/codigos" variante="secundario" tamano="sm">
                <MailSearch className="size-4" aria-hidden /> Correos de códigos
              </BotonEnlace>
            )}
            {puede('inventario.gestionar') && (
              <BotonEnlace href="/admin/inventario/codigos" variante="fantasma" tamano="sm">
                <Gem className="size-4" aria-hidden /> Códigos de activación
              </BotonEnlace>
            )}
            {puede('cuentas.gestionar') && (
              <BotonEnlace href="/admin/cuentas" tamano="sm">
                <Plus className="size-4" aria-hidden /> Agregar cuentas
              </BotonEnlace>
            )}
          </div>
        }
      />
      {datos ? (
        <InventarioCuentas
          inventario={datos}
          ahora={ahoraMs()}
          verCodigos={puede('codigos.consultar')}
        />
      ) : (
        <Alerta tono="peligro" titulo="No pudimos cargar el inventario">
          Recarga la página en unos segundos.
        </Alerta>
      )}
    </>
  );
}
