/**
 * Contador de cambios de este proceso: sube al empezar y al terminar cada petición
 * que modifica datos. Las lecturas que se guardan unos segundos en memoria (como el
 * centro del equipo) solo reutilizan un resultado si el contador no se movió, así
 * nadie ve una cifra vieja justo después de crear, aprobar o borrar algo.
 */
let version = 0;

export const versionDatos = (): number => version;

export function marcarCambioDatos(): void {
  version += 1;
}

export const esMetodoDeLectura = (metodo: string): boolean =>
  metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS';
