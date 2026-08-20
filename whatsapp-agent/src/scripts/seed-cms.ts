/**
 * Puebla el CMS (cms_documentos) desde un fichero JSON. Idempotente: usa upsert,
 * así que re-ejecutarlo no duplica. Úsalo para dejar el contenido de arranque
 * (config, plataformas, métodos de pago, FAQ y tu catálogo real).
 *
 *   npm run seed:cms -- [ruta.json]     (por defecto: seed-cms.json)
 *
 * Formato del JSON:
 *   { "coleccion": [ { "id": "netflix", ...campos }, ... ], ... }
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { CmsRepository } from '../db/repositories/cms.repo.js';
import { closePool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const file = process.argv[2] || 'seed-cms.json';
  const raw = await readFile(file, 'utf8');
  const data = JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>;
  let total = 0;
  for (const [coleccion, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) continue;
    let n = 0;
    for (const doc of docs) {
      const id = (doc._id ?? doc.id) as string | undefined;
      if (!id) { logger.warn({ coleccion, doc }, 'documento sin id — omitido'); continue; }
      await CmsRepository.upsert(coleccion, String(id), doc);
      n++; total++;
    }
    logger.info(`  ${coleccion}: ${n} documento(s)`);
  }
  logger.info(`✅ Seed CMS aplicado desde ${file}: ${total} documentos.`);
}

main()
  .catch((err) => { logger.error({ err }, '❌ Falló el seed del CMS'); process.exitCode = 1; })
  .finally(() => closePool());
