/**
 * Runner de migración mínimo: aplica `schema.sql` (idempotente).
 * Uso:  npm run migrate
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './pool.js';
import { logger } from '../utils/logger.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Localiza schema.sql tanto en dev (src/db) como en prod (dist/db). En prod, el
 * build copia schema.sql junto al JS compilado (script `copy:assets`); si aun así
 * no estuviera, cae al fichero fuente. Así `migrate:prod` no falla por el .sql.
 */
async function leerSchema(): Promise<string> {
  const candidatos = [
    join(here, 'schema.sql'),               // junto al fichero (src/db o dist/db)
    join(here, '..', '..', 'src', 'db', 'schema.sql'), // fallback desde dist/db → src/db
  ];
  for (const ruta of candidatos) {
    try { return await readFile(ruta, 'utf8'); } catch { /* siguiente candidato */ }
  }
  throw new Error(`No se encontró schema.sql. Buscado en:\n  ${candidatos.join('\n  ')}`);
}

async function main(): Promise<void> {
  const sql = await leerSchema();
  logger.info('Aplicando schema.sql…');
  await pool.query(sql);
  logger.info('✅ Esquema aplicado correctamente.');
}

main()
  .catch((err) => { logger.error({ err }, '❌ Falló la migración'); process.exitCode = 1; })
  .finally(() => closePool());
