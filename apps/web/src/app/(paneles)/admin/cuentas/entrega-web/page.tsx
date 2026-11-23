import type { EntregaWebServicio } from '@nv/shared';
import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import { EntregaWeb } from '@/componentes/admin/entrega-web';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Entrega web' };

export default async function EntregaWebPagina() {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const { datos } = await leerApi<EntregaWebServicio[]>('/cuentas/entrega-web');

  return (
    <>
      <CabeceraPagina
        titulo="Entrega web"
        descripcion="La web entrega sola únicamente los perfiles y cuentas que revisaste y marcaste como aptos. Aquí ves qué recibiría quien compre ahora, cuál sigue y lo que falta revisar. Un lugar que se asigna o se libera deja de estar apto hasta que lo revises otra vez."
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar la entrega web. Recarga la página.</Alerta>
      ) : datos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={PackageSearch} titulo="Nada se entrega solo por la web">
            Ningún plan activo se entrega desde Plataformas todavía.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <EntregaWeb
          servicios={datos}
          puedeGestionar={sesion.permisos.includes('cuentas.gestionar')}
          puedeRevelar={sesion.permisos.includes('cuentas.revelar')}
        />
      )}
    </>
  );
}
