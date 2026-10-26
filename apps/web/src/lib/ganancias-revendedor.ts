import type { GananciasRevendedor } from '@nv/shared';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

/**
 * Lo que gana un revendedor en cada nivel (página pública). `null` si la API no
 * respondió: la página lo dice en vez de inventar cifras.
 */
export async function leerGananciasRevendedor(): Promise<GananciasRevendedor | null> {
  try {
    const r = await fetch(`${API}/api/v1/sitio/publico/revendedores/ganancias`, {
      next: { revalidate: 300 },
    });
    return r.ok ? ((await r.json()) as GananciasRevendedor) : null;
  } catch {
    return null;
  }
}
