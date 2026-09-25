import {
  type MedioSitio,
  type PaginaSitioDetalle,
  PALETA_PREDETERMINADA,
  type TemaSitio,
  uuidSchema,
} from '@nv/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditorPagina } from '@/componentes/editor/editor';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';
import { leerCatalogo } from '@/lib/sitio';

export const metadata: Metadata = { title: 'Editar página' };

export default async function EditarPagina({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const [pagina, medios, tema, catalogo] = await Promise.all([
    leerApi<PaginaSitioDetalle>(`/sitio/paginas/${id}`),
    leerApi<MedioSitio[]>('/sitio/medios'),
    leerApi<TemaSitio>('/sitio/tema'),
    leerCatalogo(),
  ]);
  if (pagina.estado === 404) notFound();
  if (!pagina.datos) {
    return (
      <Alerta tono="peligro">No pudimos cargar la página. Recarga para intentarlo de nuevo.</Alerta>
    );
  }

  return (
    <EditorPagina
      inicial={pagina.datos}
      mediosIniciales={medios.datos ?? []}
      catalogo={catalogo}
      paleta={tema.datos?.paleta ?? PALETA_PREDETERMINADA}
      puedePublicar={sesion.permisos.includes('sitio.publicar')}
    />
  );
}
