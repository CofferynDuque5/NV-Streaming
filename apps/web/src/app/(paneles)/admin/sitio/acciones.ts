'use server';

import { updateTag } from 'next/cache';
import { ETIQUETA_SITIO } from '@/lib/sitio';
import { obtenerSesion } from '@/lib/sesion';

/**
 * Tras publicar, archivar o cambiar el tema (ya hechos en la API), descarta la
 * copia en caché del sitio para que el público vea el cambio en la siguiente
 * visita. Solo quien puede publicar puede pedirlo.
 */
export async function refrescarSitio(): Promise<boolean> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.pendiente || !sesion.permisos.includes('sitio.publicar')) return false;
  updateTag(ETIQUETA_SITIO);
  return true;
}
