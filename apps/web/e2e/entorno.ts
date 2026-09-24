import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Base de datos y clave de cifrado de las pruebas e2e (nunca la base de desarrollo). */
export function entornoE2e(): { url: string; clave: string } {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // En CI las variables vienen del flujo de trabajo.
  }
  const url = process.env.DATABASE_URL_E2E ?? process.env.DATABASE_URL_PRUEBAS;
  if (!url)
    throw new Error(
      'Define DATABASE_URL_E2E o DATABASE_URL_PRUEBAS para las pruebas de extremo a extremo.',
    );
  if (url === process.env.DATABASE_URL)
    throw new Error('Las pruebas e2e no pueden usar la base de datos de desarrollo.');
  process.env.CLAVE_CIFRADO_E2E ??= randomBytes(32).toString('base64');
  return { url, clave: process.env.CLAVE_CIFRADO_E2E };
}
