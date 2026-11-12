import type { ElementoPapelera } from '@nv/shared';
import type { Metadata } from 'next';
import { Papelera } from '@/componentes/admin/papelera';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Papelera' };

export default async function PaginaPapelera() {
  const { permisos } = await requerirSesion({ permiso: 'auditoria.ver' });
  const { datos } = await leerApi<ElementoPapelera[]>('/papelera');

  return (
    <>
      <CabeceraPagina
        titulo="Papelera"
        descripcion="Nada se borra del todo: los clientes archivados, las cuentas retiradas y las plataformas apagadas quedan aquí con su historial, para restaurarlos."
      />
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar la papelera. Recarga la página.</Alerta>
      ) : (
        <Papelera
          elementos={datos}
          puede={{
            cliente: permisos.includes('clientes.gestionar'),
            cuenta: permisos.includes('cuentas.gestionar'),
            plataforma: permisos.includes('catalogo.gestionar'),
          }}
        />
      )}
    </>
  );
}
