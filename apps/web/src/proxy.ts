import { COOKIE_MONEDA, esMoneda, NOMBRES_COOKIE_SESION } from '@nv/shared';
import { type NextRequest, NextResponse } from 'next/server';

/** Rutas de los paneles: sin cookie de sesión se redirige al inicio de sesión. */
const PANELES = [
  '/admin',
  '/revendedor',
  '/cuenta',
  '/ajustes',
  '/panel',
  '/configurar-2fa',
  '/verificacion-2fa',
];

function esPanel(ruta: string) {
  return PANELES.some((p) => ruta === p || ruta.startsWith(`${p}/`));
}

/**
 * Comprobación optimista: sin cookie de sesión no tiene sentido pintar un
 * panel, así que se redirige al inicio de sesión recordando la página. La
 * validación real (sesión, 2FA, rol) la hacen el servidor de la web y la API.
 * En toda la web, la moneda elegida con ?moneda= se recuerda en una cookie.
 */
export function proxy(peticion: NextRequest) {
  const ruta = peticion.nextUrl.pathname;
  if (esPanel(ruta) && !NOMBRES_COOKIE_SESION.some((n) => peticion.cookies.has(n))) {
    const destino = new URL('/ingresar', peticion.url);
    if (ruta !== '/panel') destino.searchParams.set('siguiente', ruta + peticion.nextUrl.search);
    return NextResponse.redirect(destino);
  }
  return recordarMoneda(peticion);
}

/**
 * Si la persona eligió una moneda en el selector (?moneda=), se recuerda un año.
 * La cookie también se pasa a esta misma petición, para que la cabecera y los
 * precios de la página la usen desde ya.
 */
function recordarMoneda(peticion: NextRequest) {
  const moneda = peticion.nextUrl.searchParams.get('moneda');
  if (!esMoneda(moneda) || peticion.cookies.get(COOKIE_MONEDA)?.value === moneda) {
    return NextResponse.next();
  }
  peticion.cookies.set(COOKIE_MONEDA, moneda);
  const respuesta = NextResponse.next({ request: { headers: peticion.headers } });
  respuesta.cookies.set(COOKIE_MONEDA, moneda, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
    secure: peticion.nextUrl.protocol === 'https:',
  });
  return respuesta;
}

export const config = {
  // Todo menos la API, los archivos de Next y los archivos estáticos (con extensión).
  matcher: ['/((?!api/|_next/|.*\\.[a-z0-9]+$).*)'],
};
