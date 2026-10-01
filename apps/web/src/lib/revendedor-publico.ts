import type { CatalogoMayorista } from '@nv/shared';
import { leerApi } from './api-servidor';
import { obtenerSesion } from './sesion';

/**
 * Precios que ve un revendedor con sesión en el sitio público. Se consulta en
 * cada petición con su cookie y sin caché: nunca se guarda ni se sirve a otra
 * persona. Para cualquier otra visita es `null` y el sitio muestra los precios
 * al público de siempre.
 */
export type VistaMayorista =
  | { estado: 'ok'; catalogo: CatalogoMayorista & { nivel: { id: string; nombre: string } } }
  | { estado: 'sin_nivel' }
  | { estado: 'no_disponible' }
  | { estado: 'error' };

export async function vistaMayorista(): Promise<VistaMayorista | null> {
  let sesion: Awaited<ReturnType<typeof obtenerSesion>>;
  try {
    sesion = await obtenerSesion();
  } catch {
    return null;
  }
  if (!sesion || sesion.pendiente || sesion.usuario.rol !== 'revendedor') return null;
  try {
    const r = await leerApi<CatalogoMayorista>('/revendedor/catalogo');
    if (r.estado === 403 || r.estado === 404) return { estado: 'no_disponible' };
    if (!r.datos) return { estado: 'error' };
    const { nivel } = r.datos;
    if (!nivel) return { estado: 'sin_nivel' };
    return { estado: 'ok', catalogo: { ...r.datos, nivel } };
  } catch {
    return { estado: 'error' };
  }
}
