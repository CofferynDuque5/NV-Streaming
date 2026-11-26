import { type Permiso, type Rol, rutaInicio, type SesionActual } from '@nv/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/** Respuesta de la API a «¿quién soy?» (una sola consulta por render). */
const leerSesion = cache(() => leerApi<SesionActual>('/auth/sesion'));

/** Sesión de la petición actual, o null si no hay (o la API no respondió). */
export const obtenerSesion = cache(async (): Promise<SesionActual | null> => {
  const { estado, datos } = await leerSesion();
  return estado === 200 ? datos : null;
});

/**
 * Exige una sesión completa. Redirige a quien no la tiene, a quien le falta la
 * verificación en dos pasos y a quien no tiene el rol o el permiso pedidos.
 * La API vuelve a comprobarlo todo: esto solo decide qué pantalla mostrar.
 */
export async function requerirSesion(
  opciones: { roles?: readonly Rol[]; permiso?: Permiso } = {},
): Promise<SesionActual> {
  const { estado, datos: sesion } = await leerSesion();
  // Solo 401 significa «no hay sesión». Un 500 o un 503 es la base que no respondió a
  // tiempo: mandar a /ingresar parecía un cierre de sesión. Se muestra la página de
  // error con «Reintentar» y la sesión sigue viva.
  if (estado !== 200 && estado !== 401 && estado !== 403) {
    throw new Error(`La API no respondió al leer la sesión (${estado}).`);
  }
  if (estado !== 200 || !sesion) redirect('/ingresar');
  if (sesion.pendiente === 'configurar_2fa') redirect('/configurar-2fa');
  if (sesion.pendiente === 'verificar_2fa') redirect('/verificacion-2fa');
  if (opciones.roles && !opciones.roles.includes(sesion.usuario.rol))
    redirect(rutaInicio(sesion.usuario.rol));
  if (opciones.permiso && !sesion.permisos.includes(opciones.permiso))
    redirect(rutaInicio(sesion.usuario.rol));
  return sesion;
}
