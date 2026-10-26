import type { LicenciaPublica } from '@nv/shared';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/** Licencia de la instalación: el marco la usa para el aviso y la página para el detalle. */
export const leerLicencia = cache(async (): Promise<LicenciaPublica | null> => {
  const { datos } = await leerApi<LicenciaPublica>('/licencia');
  return datos;
});
