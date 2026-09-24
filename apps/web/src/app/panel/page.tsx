import { rutaInicio } from '@nv/shared';
import { redirect } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';

/** Destino tras iniciar sesión: el panel de cada rol. */
export default async function Panel() {
  const sesion = await requerirSesion();
  redirect(rutaInicio(sesion.usuario.rol));
}
