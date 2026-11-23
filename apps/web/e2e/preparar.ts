import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARCHIVO_PASOS, ARCHIVO_SECRETOS, ejecutarSql } from './ayudas';
import { entornoE2e } from './entorno';

/** Deja la base de pruebas limpia y sembrada con un usuario por rol. */
export default function preparar(): void {
  const { url, clave } = entornoE2e();
  rmSync(ARCHIVO_SECRETOS, { force: true });
  rmSync(ARCHIVO_PASOS, { force: true });
  // Datos de la API guardados por Next en otra ejecución (otra base): se descartan.
  rmSync(fileURLToPath(new URL('../.next/cache/fetch-cache', import.meta.url)), {
    recursive: true,
    force: true,
  });
  const opciones = {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    // La misma clave que la API: la semilla cifra los códigos de demostración con ella.
    env: { ...process.env, DATABASE_URL: url, CLAVE_CIFRADO: clave, NODE_ENV: 'test' as const },
    stdio: 'inherit' as const,
  };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], opciones);
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/vaciar-pruebas.ts'], opciones);
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], opciones);
  // En producción la web solo entrega lo que el equipo revisó y marcó como apto. Las pruebas
  // compran con los perfiles que crean o liberan otras pruebas: en esta base todo perfil libre
  // queda marcado (las pruebas de integración cubren la revisión manual).
  ejecutarSql(`
    CREATE OR REPLACE FUNCTION e2e_perfil_apto_al_crear() RETURNS trigger AS $$
    BEGIN
      IF NEW.estado = 'libre' THEN NEW.apto_web := true; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS e2e_perfil_apto_al_crear ON perfiles_cuenta;
    CREATE TRIGGER e2e_perfil_apto_al_crear BEFORE INSERT OR UPDATE ON perfiles_cuenta
      FOR EACH ROW EXECUTE FUNCTION e2e_perfil_apto_al_crear();
  `);
}
