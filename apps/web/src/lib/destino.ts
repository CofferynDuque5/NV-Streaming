import { type Rol, rutaInicio } from '@nv/shared';

const ORIGEN_PRUEBA = 'http://nv.invalid';

/**
 * Solo se aceptan rutas internas: evita redirecciones abiertas a otros sitios.
 * El navegador quita tabuladores y saltos de línea de las URL («/\t/sitio» sería
 * «//sitio», otro sitio), así que se rechazan los caracteres de control y la
 * barra invertida, y la ruta debe quedarse en el mismo origen.
 */
export function destinoSeguro(siguiente: string | null | undefined, rol: Rol): string {
  if (
    siguiente &&
    /^\/(?![/\\])/.test(siguiente) &&
    !/[\u0000-\u001f\u007f\\]/.test(siguiente) &&
    URL.canParse(siguiente, ORIGEN_PRUEBA) &&
    new URL(siguiente, ORIGEN_PRUEBA).origin === ORIGEN_PRUEBA
  ) {
    return siguiente;
  }
  return rutaInicio(rol);
}
