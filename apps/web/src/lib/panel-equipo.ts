import type { CentroEquipo } from '@nv/shared';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/**
 * Centro del equipo (colas, cifras de módulos y estado del sistema). El marco
 * lo usa para las insignias y la página de inicio para todo lo demás: se pide
 * una sola vez por petición.
 */
export const leerCentro = cache(async (): Promise<CentroEquipo | null> => {
  const { datos } = await leerApi<CentroEquipo>('/metricas/centro');
  return datos;
});
