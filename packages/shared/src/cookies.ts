/**
 * Cookies y almacenamiento del navegador que usa la tienda (además de la
 * cookie de sesión de `sesion.ts` y la de la moneda de `ubicacion.ts`).
 * Las Políticas y términos los nombran desde aquí: si cambia uno, cambia el texto.
 */

/** Cookie que recuerda que se cerró la barra de la tasa del día. */
export const COOKIE_AVISO_TASA = 'nv_aviso_tasa';
/** Cuánto dura cerrada la barra de la tasa del día: 12 horas. */
export const DURACION_AVISO_TASA_SEGUNDOS = 12 * 3600;

/** Cuánto se recuerda la moneda elegida (cookie `nv_moneda`): un año. */
export const DURACION_COOKIE_MONEDA_SEGUNDOS = 365 * 24 * 3600;

/** Clave del almacenamiento local con los planes del carrito (nunca sus precios). */
export const CLAVE_CARRITO = 'nv-carrito';
