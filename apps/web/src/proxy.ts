import { COOKIE_MONEDA, esMoneda, NOMBRES_COOKIE_SESION } from '@nv/shared';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Comprobación optimista: sin cookie de sesión no tiene sentido pintar un
 * panel, así que se redirige al inicio de sesión recordando la página. La
 * validación real (sesión, 2FA, rol) la hacen el servidor de la web y la API.
 */
export function proxy(peticion: NextRequest) {
  const ruta = peticion.nextUrl.pathname;
  if (ruta === '/planes') return recordarMoneda(peticion, NextResponse.next());
  const tieneSesion = NOMBRES_COOKIE_SESION.some((n) => peticion.cookies.has(n));
  if (tieneSesion) return recordarMoneda(peticion, NextResponse.next());
  const destino = new URL('/ingresar', peticion.url);
  if (ruta !== '/panel') destino.searchParams.set('siguiente', ruta + peticion.nextUrl.search);
  return NextResponse.redirect(destino);
}

/** Si la persona eligió una moneda en el selector (?moneda=), se recuerda un año. */
function recordarMoneda(peticion: NextRequest, respuesta: NextResponse) {
  const moneda = peticion.nextUrl.searchParams.get('moneda');
  if (esMoneda(moneda) && peticion.cookies.get(COOKIE_MONEDA)?.value !== moneda) {
    respuesta.cookies.set(COOKIE_MONEDA, moneda, {
      path: '/',
      maxAge: 365 * 24 * 3600,
      sameSite: 'lax',
      secure: peticion.nextUrl.protocol === 'https:',
    });
  }
  return respuesta;
}

export const config = {
  matcher: [
    '/planes',
    '/admin/:ruta*',
    '/revendedor/:ruta*',
    '/cuenta/:ruta*',
    '/ajustes/:ruta*',
    '/panel',
    '/configurar-2fa',
    '/verificacion-2fa',
  ],
};
