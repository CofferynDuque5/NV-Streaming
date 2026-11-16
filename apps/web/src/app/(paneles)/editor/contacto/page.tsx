import type { TemaSitio } from '@nv/shared';
import type { Metadata } from 'next';
import { ContactoSitioSeccion } from '@/componentes/editor/paginas';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Contacto y redes' };

/** WhatsApp, canal, redes y correo que salen en el pie y en los botones de la tienda. */
export default async function Contacto() {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const { datos: tema } = await leerApi<TemaSitio>('/sitio/tema');
  return tema ? (
    <>
      <h1 className="sr-only">Contacto y redes</h1>
      <ContactoSitioSeccion
        contacto={tema.contacto}
        puedeCambiar={sesion.permisos.includes('sitio.publicar')}
      />
    </>
  ) : (
    <Alerta tono="peligro">No pudimos cargar el contacto. Recarga la página.</Alerta>
  );
}
