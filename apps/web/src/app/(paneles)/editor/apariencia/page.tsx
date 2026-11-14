import type { TemaSitio } from '@nv/shared';
import type { Metadata } from 'next';
import { PaletaSitioSeccion, TemporadaSitioSeccion } from '@/componentes/editor/paginas';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Apariencia' };

/** Colores de la tienda y la temporada (Navidad, Halloween…). */
export default async function Apariencia() {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const puedeCambiar = sesion.permisos.includes('sitio.publicar');
  const { datos: tema } = await leerApi<TemaSitio>('/sitio/tema');
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Apariencia</h1>
        <p className="text-tinta-suave">
          Los colores de toda la tienda y la decoración de temporada. Se aplican al guardar.
        </p>
      </div>
      {tema ? (
        <>
          <PaletaSitioSeccion tema={tema} puedeCambiar={puedeCambiar} />
          <TemporadaSitioSeccion tema={tema} puedeCambiar={puedeCambiar} />
        </>
      ) : (
        <Alerta tono="peligro">No pudimos cargar la apariencia. Recarga la página.</Alerta>
      )}
    </>
  );
}
