import { type Rol, rutaInicio } from '@nv/shared';

/** Solo se aceptan rutas internas: evita redirecciones abiertas a otros sitios. */
export function destinoSeguro(siguiente: string | null | undefined, rol: Rol): string {
  if (siguiente && /^\/(?![/\\])/.test(siguiente)) return siguiente;
  return rutaInicio(rol);
}
