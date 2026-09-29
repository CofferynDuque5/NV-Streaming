import type { PanelCliente } from '@nv/shared';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/**
 * Menú de la cuenta del cliente (revendedor que la gestiona y pendientes). El
 * marco y la página lo leen en la misma petición: se pide una sola vez.
 */
export const leerPanelCliente = cache(async (): Promise<PanelCliente | null> => {
  const { datos } = await leerApi<PanelCliente>('/mi/panel');
  return datos;
});
