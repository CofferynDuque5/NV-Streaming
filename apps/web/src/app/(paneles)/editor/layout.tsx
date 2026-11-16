import { ROLES_EQUIPO } from '@nv/shared';
import type { ReactNode } from 'react';
import { MarcoEditorTienda, type PestanaEditor } from '@/componentes/editor-tienda/marco';
import { LogoTienda } from '@/componentes/logo';
import { Sello } from '@/componentes/panel/piezas-marco';
import { requerirSesion } from '@/lib/sesion';

/** Panel aparte para editar la tienda: páginas, servicios, apariencia y contacto. */
export default async function LayoutEditor({ children }: { children: ReactNode }) {
  const { permisos } = await requerirSesion({ roles: ROLES_EQUIPO });
  const sitio = permisos.includes('sitio.editar');
  const pestanas: PestanaEditor[] = [
    ...(sitio ? [{ etiqueta: 'Páginas', href: '/editor', icono: 'paginas' } as const] : []),
    ...(permisos.includes('catalogo.gestionar')
      ? [{ etiqueta: 'Servicios', href: '/editor/servicios', icono: 'servicios' } as const]
      : []),
    ...(sitio
      ? [
          { etiqueta: 'Apariencia', href: '/editor/apariencia', icono: 'apariencia' } as const,
          { etiqueta: 'Contacto y redes', href: '/editor/contacto', icono: 'contacto' } as const,
        ]
      : []),
  ];
  return (
    <MarcoEditorTienda
      pestanas={pestanas}
      marca={
        <>
          <LogoTienda compacto className="[&_img]:h-9 [&>span]:hidden" />
          <Sello>Editor</Sello>
        </>
      }
    >
      {children}
    </MarcoEditorTienda>
  );
}
