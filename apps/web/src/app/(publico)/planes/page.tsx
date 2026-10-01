import { permanentRedirect } from 'next/navigation';

/**
 * La antigua página de planes ahora es el catálogo. Se conserva la moneda (y
 * el universo, si venía) para que los enlaces viejos sigan funcionando.
 */
export default async function Planes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const destino = new URLSearchParams();
  for (const clave of ['moneda', 'categoria', 'q']) {
    const v = p[clave];
    if (typeof v === 'string' && v) destino.set(clave, v);
  }
  const consulta = destino.toString();
  permanentRedirect(consulta ? `/catalogo?${consulta}` : '/catalogo');
}
