/**
 * seed.ts — Hidratación de arranque con datos REALES mínimos (idempotente).
 *
 * Deja la aplicación lista para probarse "desde cero" sin datos falsos:
 *   1) CMS (cms_documentos) desde seed-cms.json → contenido de tienda.
 *   2) Catálogo real: tabla `planes` (precios) por plataforma.
 *   3) Admin (opcional): crea/promueve un administrador SOLO si defines
 *      SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno (nunca hardcodeado).
 *
 * NO inserta clientes, pedidos, ventas ni credenciales de streaming: esos son
 * datos reales de operación. El stock real se carga en el panel de admin.
 *
 * Uso:
 *   npm run migrate        # 1º aplica el esquema
 *   npm run seed           # 2º hidrata (este script)
 *   # o de una vez:  npm run hydrate
 *
 * Precios de arranque: valores representativos que el titular debe confirmar en
 * el panel; se pueden ajustar aquí o en `planes`.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { CmsRepository } from '../db/repositories/cms.repo.js';
import { PlansRepository } from '../db/repositories/plans.repo.js';
import { UsersRepository } from '../db/repositories/users.repo.js';
import { closePool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/** Catálogo real mínimo: un plan mensual por plataforma. Precios ajustables. */
const PLANES: ReadonlyArray<{ plataformaId: string; nombre: string; precio: number }> = [
  { plataformaId: 'netflix', nombre: 'Netflix — 1 mes', precio: 5.99 },
  { plataformaId: 'disney', nombre: 'Disney+ — 1 mes', precio: 4.99 },
  { plataformaId: 'max', nombre: 'Max — 1 mes', precio: 4.49 },
  { plataformaId: 'prime', nombre: 'Prime Video — 1 mes', precio: 3.99 },
  { plataformaId: 'spotify', nombre: 'Spotify Premium — 1 mes', precio: 3.49 },
  { plataformaId: 'chatgpt', nombre: 'ChatGPT Plus — 1 mes', precio: 9.99 },
];

async function seedCms(): Promise<number> {
  const file = process.env.SEED_CMS_FILE || 'seed-cms.json';
  let raw: string;
  try { raw = await readFile(file, 'utf8'); }
  catch { logger.warn(`(CMS) ${file} no encontrado — omito el contenido de tienda.`); return 0; }
  const data = JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>;
  let total = 0;
  for (const [coleccion, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) continue;
    for (const doc of docs) {
      const id = (doc._id ?? doc.id) as string | undefined;
      if (!id) continue;
      await CmsRepository.upsert(coleccion, String(id), doc);
      total++;
    }
  }
  logger.info(`(CMS) ${total} documentos upserted.`);
  return total;
}

async function seedPlanes(): Promise<number> {
  // Idempotente: si ya hay un plan activo para la plataforma, no duplica.
  let creados = 0;
  for (const p of PLANES) {
    const existente = await PlansRepository.findActiveByPlatform(p.plataformaId);
    if (existente) continue;
    await PlansRepository.crear({ plataformaId: p.plataformaId, nombre: p.nombre, precio: p.precio, moneda: 'USD', duracionDias: 30, activo: true });
    creados++;
  }
  logger.info(`(Planes) ${creados} plan(es) creado(s); ${PLANES.length - creados} ya existían.`);
  return creados;
}

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  if (!email) {
    logger.info('(Admin) Omitido: define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD, o usa `npm run crear-admin`.');
    return;
  }
  const existente = await UsersRepository.findByEmail(email);
  if (existente) {
    await UsersRepository.setRol(email, 'admin');
    logger.info(`(Admin) ${email} promovido a administrador.`);
    return;
  }
  if (password.length < 8) {
    logger.warn('(Admin) SEED_ADMIN_PASSWORD debe tener ≥ 8 caracteres — admin no creado.');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await UsersRepository.createWebUser({ email, nombre: 'Administrador', passwordHash, rol: 'admin' });
  logger.info(`(Admin) Administrador ${email} creado.`);
}

async function main(): Promise<void> {
  logger.info('🌱 Hidratando NV Streaming con datos reales mínimos…');
  await seedCms();
  await seedPlanes();
  await seedAdmin();
  logger.info('✅ Seed completado. La app ya puede probarse desde cero (el stock real se carga en el panel).');
}

main()
  .catch((err) => { logger.error({ err }, '❌ Falló el seed'); process.exitCode = 1; })
  .finally(() => closePool());
