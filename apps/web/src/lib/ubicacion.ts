import { COOKIE_MONEDA, detectarUbicacion, type Ubicacion } from '@nv/shared';
import { cookies, headers } from 'next/headers';

/**
 * Moneda sugerida para quien visita: la que eligió antes (cookie) o la del país
 * de su conexión (cabecera de la CDN) o del idioma de su navegador. Solo se usa
 * el país, nunca la ubicación exacta.
 */
export async function ubicacionVisitante(): Promise<Ubicacion> {
  const [cabeceras, almacen] = await Promise.all([headers(), cookies()]);
  return detectarUbicacion(cabeceras, almacen.get(COOKIE_MONEDA)?.value);
}
