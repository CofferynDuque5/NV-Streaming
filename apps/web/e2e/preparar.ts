import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARCHIVO_PASOS, ARCHIVO_SECRETOS } from './ayudas';
import { entornoE2e } from './entorno';

/** Deja la base de pruebas limpia y sembrada con un usuario por rol. */
export default function preparar(): void {
  const { url, clave } = entornoE2e();
  rmSync(ARCHIVO_SECRETOS, { force: true });
  rmSync(ARCHIVO_PASOS, { force: true });
  const opciones = {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    // La misma clave que la API: la semilla cifra los códigos de demostración con ella.
    env: { ...process.env, DATABASE_URL: url, CLAVE_CIFRADO: clave, NODE_ENV: 'test' as const },
    stdio: 'inherit' as const,
  };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], opciones);
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/vaciar-pruebas.ts'], opciones);
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], opciones);
}
