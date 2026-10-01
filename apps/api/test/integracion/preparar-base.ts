import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargarVariables } from './entorno-pruebas.js';

/** Aplica las migraciones a la base de datos de pruebas antes de ejecutar la suite. */
export default function prepararBase(): void {
  const url = cargarVariables();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
