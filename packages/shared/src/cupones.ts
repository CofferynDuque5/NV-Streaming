/*
 * Formato de los códigos de cupón, sin dependencias (ni zod): lo usan el
 * esquema de la API y la validación en vivo del carrito en el navegador.
 */

/** Letras, números, guiones y guiones bajos; de 3 a 40 caracteres (ya en mayúsculas). */
export const PATRON_CUPON = /^[A-Z0-9_-]{3,40}$/;

export const MENSAJE_CUPON = 'El cupón usa letras, números, guiones (3 a 40).';
