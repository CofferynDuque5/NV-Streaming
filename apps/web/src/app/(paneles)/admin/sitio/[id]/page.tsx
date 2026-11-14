import { permanentRedirect } from 'next/navigation';

/** El editor de páginas ahora vive en su propio panel. */
export default async function EditarPaginaAntes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/editor/paginas/${encodeURIComponent(id)}`);
}
