import { NOMBRES_COOKIE_SESION } from '@nv/shared';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Comprobación optimista: sin cookie de sesión no tiene sentido pintar un
 * panel, así que se redirige al inicio de sesión recordando la página. La
 * validación real (sesión, 2FA, rol) la hacen el servidor de la web y la API.
 */
export function proxy(peticion: NextRequest) {
  const tieneSesion = NOMBRES_COOKIE_SESION.some((n) => peticion.cookies.has(n));
  if (tieneSesion) return NextResponse.next();
  const destino = new URL('/ingresar', peticion.url);
  const ruta = peticion.nextUrl.pathname;
  if (ruta !== '/panel') destino.searchParams.set('siguiente', ruta + peticion.nextUrl.search);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: [
    '/admin/:ruta*',
    '/revendedor/:ruta*',
    '/cuenta/:ruta*',
    '/ajustes/:ruta*',
    '/panel',
    '/configurar-2fa',
    '/verificacion-2fa',
  ],
};
