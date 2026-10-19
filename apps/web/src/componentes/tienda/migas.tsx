import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/** Migas de pan: dónde está la visita dentro de la tienda. */
export function Migas({ pasos }: { pasos: { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Estás en" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-tinta-tenue">
        {pasos.map((p, i) => (
          <li key={p.texto} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {p.href ? (
              <Link href={p.href} className="hover:text-tinta hover:underline">
                {p.texto}
              </Link>
            ) : (
              <span aria-current="page" className="text-tinta">
                {p.texto}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
