import { ETIQUETAS_ROL, type PaginaSitioResumen, type TemaSitio } from '@nv/shared';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import {
  ContactoSitioSeccion,
  PaginasSitio,
  PaletaSitioSeccion,
} from '@/componentes/editor/paginas';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Sitio y páginas' };

export default async function SitioYPaginas() {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const puedePublicar = sesion.permisos.includes('sitio.publicar');
  const [{ datos: paginas }, { datos: tema }] = await Promise.all([
    leerApi<PaginaSitioResumen[]>('/sitio/paginas'),
    leerApi<TemaSitio>('/sitio/tema'),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)] break-words">Sitio y páginas</h1>
          <p className="text-tinta-suave">
            Las páginas de la tienda, su paleta de colores y tus datos de contacto.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-borde-fuerte bg-marca/12 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-[#c7d2fe]">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {ETIQUETAS_ROL[sesion.usuario.rol]}
        </span>
      </div>

      {paginas ? (
        <PaginasSitio iniciales={paginas} puedePublicar={puedePublicar} />
      ) : (
        <Alerta tono="peligro">No pudimos cargar las páginas. Recarga la página.</Alerta>
      )}

      {tema ? (
        <>
          <PaletaSitioSeccion tema={tema} puedeCambiar={puedePublicar} />
          <ContactoSitioSeccion contacto={tema.contacto} puedeCambiar={puedePublicar} />
        </>
      ) : (
        <Alerta tono="peligro">
          No pudimos cargar la paleta ni el contacto. Recarga la página.
        </Alerta>
      )}

      <p className="text-xs text-tinta-tenue">
        La cabecera, el pie y los menús de la tienda no se editan aquí.
      </p>
    </>
  );
}
