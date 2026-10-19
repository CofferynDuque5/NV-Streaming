import { NOMBRES_COOKIE_SESION } from '@nv/shared';
import { cookies } from 'next/headers';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

/** Lectura desde componentes de servidor: reenvía solo la cookie de sesión a la API. */
export async function leerApi<T>(ruta: string): Promise<{ estado: number; datos: T | null }> {
  const almacen = await cookies();
  const cookie = NOMBRES_COOKIE_SESION.map((n) => {
    const valor = almacen.get(n)?.value;
    return valor ? `${n}=${valor}` : null;
  }).find(Boolean);
  if (!cookie) return { estado: 401, datos: null };

  const r = await fetch(`${API}/api/v1${ruta}`, { headers: { cookie }, cache: 'no-store' });
  return { estado: r.status, datos: r.ok ? ((await r.json()) as T) : null };
}
