import type { Adaptador, ResultadoEntrega } from './tipos.js';

/**
 * Entrega manual: la entrega queda pendiente y se avisa al equipo, que la
 * completa desde el panel con los pasos para activar el servicio y, si hace
 * falta, un enlace o un código oficial. El formulario rechaza cualquier cosa
 * que parezca un usuario y una contraseña.
 */
export class AdaptadorManual implements Adaptador {
  readonly adaptador = 'manual' as const;
  readonly transaccional = true;

  entregar(): Promise<ResultadoEntrega> {
    return Promise.resolve({
      estado: 'pendiente',
      reintentar: false,
      aviso: 'manual',
      mensaje: 'Esperando a que el equipo complete la entrega.',
    });
  }
}
