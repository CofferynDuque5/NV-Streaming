import type { PaginaSitioResumen, TemaSitio } from '@nv/shared';
import { ChevronRight, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EstadoPagina } from '@/componentes/editor/estado-pagina';
import { NuevaPagina, SelectorTema } from '@/componentes/editor/paginas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Editor visual' };

export default async function EditorVisual() {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const puedePublicar = sesion.permisos.includes('sitio.publicar');
  const [{ datos: paginas }, { datos: tema }] = await Promise.all([
    leerApi<PaginaSitioResumen[]>('/sitio/paginas'),
    leerApi<TemaSitio>('/sitio/tema'),
  ]);

  return (
    <>
      <CabeceraPagina
        titulo="Editor visual"
        descripcion={
          puedePublicar
            ? 'Edita las páginas del sitio con bloques, revisa cómo quedan y publícalas. Cada publicación guarda una versión a la que puedes volver.'
            : 'Edita los borradores de las páginas del sitio. Administración revisa y publica los cambios.'
        }
        acciones={<NuevaPagina />}
      />

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Páginas"
          descripcion="La página «/» es la portada. Las demás se publican en su ruta."
        />
        {!paginas ? (
          <div className="p-5 sm:p-6">
            <Alerta tono="peligro">No pudimos cargar las páginas. Recarga la página.</Alerta>
          </div>
        ) : paginas.length === 0 ? (
          <EstadoVacio icono={FileText} titulo="Todavía no hay páginas">
            Crea la primera con «Nueva página».
          </EstadoVacio>
        ) : (
          <ul className="divide-y divide-borde">
            {paginas.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/sitio/${p.id}`}
                  aria-label={`Editar ${p.titulo} (${p.ruta})`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-hundida/60 sm:px-6"
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate font-medium">{p.titulo}</span>
                      <span className="font-mono text-xs text-tinta-tenue">{p.ruta}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-tinta-tenue">
                      <EstadoPagina p={p} />
                      {p.borradorActualizadoEn && (
                        <span>Borrador guardado {haceCuanto(p.borradorActualizadoEn)}</span>
                      )}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-tinta-tenue" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Tema del sitio"
          descripcion="Colores de marca y acento del sitio público, dentro de la identidad de NV. Todas las paletas cumplen el contraste mínimo de accesibilidad (WCAG AA)."
        />
        <div className="p-5 sm:p-6">
          {tema ? (
            <SelectorTema tema={tema} puedeCambiar={puedePublicar} />
          ) : (
            <Alerta tono="peligro">No pudimos cargar el tema. Recarga la página.</Alerta>
          )}
        </div>
      </Tarjeta>
    </>
  );
}
