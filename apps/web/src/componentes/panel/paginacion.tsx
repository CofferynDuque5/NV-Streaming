import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

/** Paginación con enlaces normales: funciona sin JavaScript y se puede compartir. */
export function Paginacion({
  ruta,
  parametros,
  pagina,
  porPagina,
  total,
}: {
  ruta: string;
  parametros: Record<string, string | undefined>;
  pagina: number;
  porPagina: number;
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const enlace = (p: number) => {
    const q = new URLSearchParams(
      Object.entries({ ...parametros, pagina: String(p) }).filter((e): e is [string, string] =>
        Boolean(e[1]),
      ),
    );
    return `${ruta}?${q}`;
  };
  const clase =
    'inline-flex h-9 items-center gap-1 rounded-lg border border-borde px-3 text-sm hover:bg-hundida';
  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-4 border-t border-borde px-5 py-3 text-sm text-tinta-suave sm:px-6"
    >
      <span>
        Página {pagina} de {paginas}
      </span>
      <div className="flex gap-2">
        {pagina > 1 && (
          <Link href={enlace(pagina - 1)} className={clase}>
            <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
          </Link>
        )}
        {pagina < paginas && (
          <Link href={enlace(pagina + 1)} className={clase}>
            Siguiente <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
