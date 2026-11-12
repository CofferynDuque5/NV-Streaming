import type { PerfilPorReponer } from '@nv/shared';
import { Boxes, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { ColaReposicion } from '@/componentes/admin/reposicion';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Caídas y reposición' };

export default async function Reposicion() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { datos } = await leerApi<PerfilPorReponer[]>('/cuentas/reposicion');

  return (
    <>
      <CabeceraPagina
        titulo="Caídas y reposición"
        descripcion="Clientes con perfil en una cuenta caída. Pásalos a un perfil libre de otra cuenta y, si quieres, súmales los días que estuvieron sin servicio."
        acciones={
          <BotonEnlace href="/admin/cuentas?estado=caida" variante="secundario">
            <Boxes className="size-4" aria-hidden="true" />
            Ver cuentas caídas
          </BotonEnlace>
        }
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar la cola de reposición. Recarga la página.</Alerta>
      ) : datos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={ShieldCheck} titulo="Nadie espera reposición">
            Cuando marques una cuenta como caída, sus clientes con perfil aparecerán aquí.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <ColaReposicion
          pendientes={datos}
          puedeReponer={sesion.permisos.includes('cuentas.gestionar')}
        />
      )}
    </>
  );
}
