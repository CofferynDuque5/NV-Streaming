import type { VencimientosCortes, VencimientosEquipo } from '@nv/shared';
import { List, Scissors } from 'lucide-react';
import type { Metadata } from 'next';
import { ListaVencimientosCortes } from '@/componentes/admin/cobros-cortes';
import { GrupoVencimientos } from '@/componentes/admin/grupo-vencimientos';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Vencimientos' };

/**
 * Suscripciones → Vencimientos: los que vencen hoy y mañana (como en el Gestor,
 * con buscador, filtros y acciones por fila) y, aparte, los que vencen esta semana.
 */
export default async function Vencimientos() {
  const sesion = await requerirSesion({ permiso: 'suscripciones.ver' });
  const [{ datos }, { datos: semana }] = await Promise.all([
    leerApi<VencimientosCortes>('/suscripciones/vencimientos-cortes'),
    leerApi<VencimientosEquipo>('/suscripciones/vencimientos'),
  ]);
  const cortes = datos?.cortes.length ?? 0;

  return (
    <>
      <CabeceraPagina
        titulo="Vencimientos"
        descripcion="Clientes que vencen hoy y mañana: cóbrales o renuévalos a tiempo. Abajo, los que vencen esta semana."
        acciones={
          <>
            <BotonEnlace href="/admin/suscripciones/cortes" variante="secundario">
              <Scissors className="size-4" aria-hidden="true" />
              Cortes{cortes > 0 ? ` · ${cortes}` : ''}
            </BotonEnlace>
            <BotonEnlace href="/admin/suscripciones" variante="secundario">
              <List className="size-4" aria-hidden="true" />
              Todas las suscripciones
            </BotonEnlace>
          </>
        }
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar los vencimientos. Recarga la página.</Alerta>
      ) : (
        <ListaVencimientosCortes
          seccion="vencimientos"
          lista={datos.vencimientos}
          horaCorte={datos.horaCorte}
          pasoHoraCorte={datos.pasoHoraCorte}
          puedeCortar={sesion.permisos.includes('cuentas.gestionar')}
          puedeRevelar={sesion.permisos.includes('cuentas.revelar')}
        />
      )}
      {semana && (
        <GrupoVencimientos
          titulo="Esta semana"
          descripcion="Del pasado mañana a 7 días."
          lista={semana.semana}
        />
      )}
    </>
  );
}
