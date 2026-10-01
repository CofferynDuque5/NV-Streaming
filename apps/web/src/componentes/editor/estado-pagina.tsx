import type { PaginaSitioResumen } from '@nv/shared';
import { Insignia } from '@/componentes/ui/insignia';

/** Estado de publicación de una página del editor. */
export function EstadoPagina({ p }: { p: PaginaSitioResumen }) {
  if (p.archivada) return <Insignia>Archivada</Insignia>;
  if (!p.versionPublicada) return <Insignia tono="aviso">Sin publicar</Insignia>;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Insignia tono="exito">Publicada · v{p.versionPublicada.numero}</Insignia>
      {p.cambiosSinPublicar && <Insignia tono="marca">Cambios sin publicar</Insignia>}
    </span>
  );
}
