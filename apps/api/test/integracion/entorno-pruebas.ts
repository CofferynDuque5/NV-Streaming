import { fileURLToPath } from 'node:url';

/** Lee el .env de la raíz si existe (sin sobrescribir lo que ya venga del entorno, como en CI). */
export function cargarVariables(): string {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
  } catch {
    // Sin .env: en CI las variables vienen del flujo de trabajo.
  }
  const url = process.env['DATABASE_URL_PRUEBAS'];
  if (!url)
    throw new Error('Define DATABASE_URL_PRUEBAS para ejecutar las pruebas de integración.');
  if (url === process.env['DATABASE_URL']) {
    throw new Error(
      'DATABASE_URL_PRUEBAS no puede ser la misma base que DATABASE_URL: las pruebas la vacían.',
    );
  }
  return url;
}
