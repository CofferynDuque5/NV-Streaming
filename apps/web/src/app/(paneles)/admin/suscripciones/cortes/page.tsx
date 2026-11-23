import type { VencimientosCortes, VencimientosEquipo } from '@nv/shared';
import { CalendarClock, List } from 'lucide-react';
import type { Metadata } from 'next';
import { ListaVencimientosCortes } from '@/componentes/admin/cobros-cortes';
import { GrupoVencimientos } from '@/componentes/admin/grupo-vencimientos';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cortes' };

/**
 * Suscripciones → Cortes: vencidos que siguen ocupando un perfil o cupo (cortar,
 * eliminar, cambiar clave o PIN, renovar) y, aparte, los vencidos sin lugar
 * asignado que faltan por renovar.
 */
export default async function Cortes() {
  const sesion = await requerirSesion({ permiso: 'suscripciones.ver' });
  const [{ datos }, { datos: vencidas }] = await Promise.all([
    leerApi<VencimientosCortes>('/suscripciones/vencimientos-cortes'),
    leerApi<VencimientosEquipo>('/suscripciones/vencimientos'),
  ]);
  const enCortes = new Set(datos?.cortes.map((s) => s.id) ?? []);

  return (
    <>
      <CabeceraPagina
        titulo="Cortes"
        descripcion="Clientes vencidos que siguen en un perfil o cupo: renuévalos o córtalos."
        acciones={
          <>
            <BotonEnlace href="/admin/suscripciones/vencimientos" variante="secundario">
              <CalendarClock className="size-4" aria-hidden="true" />
              Vencimientos
            </BotonEnlace>
            <BotonEnlace href="/admin/suscripciones" variante="secundario">
              <List className="size-4" aria-hidden="true" />
              Todas las suscripciones
            </BotonEnlace>
          </>
        }
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar los cortes. Recarga la página.</Alerta>
      ) : (
        <ListaVencimientosCortes
          seccion="cortes"
          lista={datos.cortes}
          horaCorte={datos.horaCorte}
          pasoHoraCorte={datos.pasoHoraCorte}
          puedeCortar={sesion.permisos.includes('cuentas.gestionar')}
          puedeRevelar={sesion.permisos.includes('cuentas.revelar')}
        />
      )}
      {vencidas && datos && (
        <GrupoVencimientos
          titulo="Vencidas sin perfil asignado"
          descripcion="En gracia, suspendidas o vencidas hace menos de 30 días que no ocupan un perfil ni cupo: renuévalas o cancélalas desde su ficha."
          lista={vencidas.vencidas.filter((s) => !enCortes.has(s.id))}
        />
      )}
    </>
  );
}
