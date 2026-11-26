import type { RevisionSpotifyPublica } from '@nv/shared';
import type { Metadata } from 'next';
import { RevisionSpotify } from '@/componentes/admin/revision-spotify';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Revisión de Spotify' };

export default async function RevisionDeSpotify() {
  const sesion = await requerirSesion({ permiso: 'codigos.consultar' });
  const puedeRevisar = sesion.permisos.includes('codigos.configurar');
  const datos = await leerApi<{
    dominio: string;
    corriendo: boolean;
    cuentas: RevisionSpotifyPublica[];
  }>('/codigos/spotify').then((r) => r.datos);

  return (
    <>
      <CabeceraPagina
        titulo="Revisión de Spotify"
        descripcion="El servidor entra a tus cuentas Spotify principales con el código que llega al correo y lee la fecha de vencimiento, si el pago falló y los cupos libres. Solo corre cuando pulsas «Revisar». Si la cuenta está al día, se actualiza su fecha de vencimiento en la web; con pago fallido, pausa o caída no se cambia nada."
      />
      {datos ? (
        <Tarjeta>
          <RevisionSpotify
            dominio={datos.dominio}
            corriendo={datos.corriendo}
            cuentas={datos.cuentas}
            puedeRevisar={puedeRevisar}
          />
        </Tarjeta>
      ) : (
        <Alerta tono="peligro">No pudimos cargar las cuentas. Recarga la página.</Alerta>
      )}
    </>
  );
}
