import { COOKIE_MONEDA, detectarUbicacion, monedaDePais, type Ubicacion } from '@nv/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

/** País por IP ya consultado (la misma persona navega varias páginas seguidas). */
const recordados = new Map<string, string | null>();
const MAX_RECORDADOS = 5000;

/** IP del visitante que pone Caddy (la real, tomada de Cloudflare si viene de ahí). */
function ipVisitante(cabeceras: Headers): string | null {
  const directa = cabeceras.get('x-real-ip')?.trim();
  if (directa) return directa;
  return cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

/**
 * País de la IP con la base que trae la API (sin servicios externos). Si la API
 * tarda o falla, se sigue sin país: nunca bloquea la página más de un instante.
 */
async function paisPorIp(ip: string): Promise<string | null> {
  if (recordados.has(ip)) return recordados.get(ip) ?? null;
  let pais: string | null = null;
  try {
    const r = await fetch(`${API}/api/v1/ubicacion/pais?ip=${encodeURIComponent(ip)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(800),
    });
    if (r.ok) pais = ((await r.json()) as { pais: string | null }).pais;
  } catch {
    return null;
  }
  if (recordados.size >= MAX_RECORDADOS) recordados.clear();
  recordados.set(ip, pais);
  return pais;
}

/**
 * Moneda sugerida para quien visita: la que eligió antes (cookie) o la del país
 * de su conexión. El país sale de la cabecera de Cloudflare y, si no viene (proxy
 * apagado o geolocalización desactivada), de la IP con la base de la API. Al
 * final, del idioma del navegador. Solo se usa el país, nunca la ubicación exacta.
 */
export const ubicacionVisitante = cache(async (): Promise<Ubicacion> => {
  const [cabeceras, almacen] = await Promise.all([headers(), cookies()]);
  const elegida = almacen.get(COOKIE_MONEDA)?.value;
  const base = detectarUbicacion(cabeceras, elegida);
  if (base.origen === 'conexion' || (base.origen === 'eleccion' && base.pais)) return base;
  const ip = ipVisitante(cabeceras);
  const pais = ip ? await paisPorIp(ip) : null;
  if (!pais) return base;
  if (base.origen === 'eleccion') return { ...base, pais };
  return { pais, moneda: monedaDePais(pais), origen: 'conexion' };
});
