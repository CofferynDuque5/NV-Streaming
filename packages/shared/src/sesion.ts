/**
 * Nombre de la cookie de sesión. Con HTTPS se usa el prefijo `__Host-`, que
 * obliga al navegador a exigir Secure, Path=/ y sin Domain.
 */
export function nombreCookieSesion(seguro: boolean): string {
  return seguro ? '__Host-nv_sesion' : 'nv_sesion';
}

/** Todos los nombres posibles, para quien solo necesita saber si hay sesión. */
export const NOMBRES_COOKIE_SESION = ['__Host-nv_sesion', 'nv_sesion'] as const;
