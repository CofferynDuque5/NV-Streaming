import type { Entorno } from '../config/entorno.js';

/** Sin latido en este tiempo, el panel da el trabajador por detenido. */
const LATIDO_VIGENTE_MS = 90_000;

/**
 * Con BASE_AHORRO el trabajador duerme TRABAJADOR_PAUSA_MINUTOS entre vueltas: su
 * latido es más espaciado y el panel debe esperarlo un poco más.
 */
export function latidoVigenteMs(
  e: Pick<Entorno, 'BASE_AHORRO' | 'TRABAJADOR_PAUSA_MINUTOS'>,
): number {
  return e.BASE_AHORRO ? (e.TRABAJADOR_PAUSA_MINUTOS * 60 + 120) * 1000 : LATIDO_VIGENTE_MS;
}

/** Espera tras el último aviso antes de llamar al trabajador: junta los avisos seguidos. */
const AGRUPAR_MS = 1000;
const TIEMPO_LIMITE_MS = 3000;

/**
 * Devuelve una función que avisa al trabajador (POST /despertar) de que puede haber
 * trabajo nuevo. Agrupa los avisos de un mismo segundo y nunca falla: si el trabajador
 * no contesta, lo hará en su próxima vuelta.
 */
export function crearDespertador(url: string, solicitar: typeof fetch = fetch): () => void {
  let pendiente: NodeJS.Timeout | null = null;
  return () => {
    if (pendiente) return;
    pendiente = setTimeout(() => {
      pendiente = null;
      solicitar(`${url}/despertar`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      })
        .then((r) => r.body?.cancel())
        .catch(() => undefined);
    }, AGRUPAR_MS);
    pendiente.unref();
  };
}
