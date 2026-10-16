import { type Permiso, type Rol, rutaInicio, type SesionActual } from '@nv/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/** Sesión de la petición actual (una sola consulta a la API por render). */
export const obtenerSesion = cache(async (): Promise<SesionActual | null> => {
  const { estado, datos } = await leerApi<SesionActual>('/auth/sesion');
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
  const sesion = await obtenerSesion();
  if (!sesion) redirect('/ingresar');
  if (sesion.pendiente === 'configurar_2fa') redirect('/configurar-2fa');
  if (sesion.pendiente === 'verificar_2fa') redirect('/verificacion-2fa');
  if (opciones.roles && !opciones.roles.includes(sesion.usuario.rol))
    redirect(rutaInicio(sesion.usuario.rol));
  if (opciones.permiso && !sesion.permisos.includes(opciones.permiso))
    redirect(rutaInicio(sesion.usuario.rol));
  return sesion;
}
