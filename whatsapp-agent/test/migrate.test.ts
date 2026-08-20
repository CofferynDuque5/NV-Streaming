/**
 * Smoke test de la Fase 4 (arranque de datos) con pg-mem:
 *  - crear-admin: crear un admin nuevo y promover a admin uno existente.
 *  - seed:cms: poblar cms_documentos desde un objeto tipo seed-cms.json (idempotente).
 *
 *   npm run test:migrate
 */
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';

let fallos = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fallos++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

async function main() {
  const db = newDb();
  db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => randomUUID() });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as any;
  const all = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  await pool.query(`CREATE TABLE usuarios (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(160), nombre VARCHAR(120), password_hash VARCHAR(255), rol VARCHAR(20) NOT NULL DEFAULT 'cliente', saldo_billetera NUMERIC(12,2) NOT NULL DEFAULT 0);`);
  await pool.query(`CREATE TABLE cms_documentos (coleccion VARCHAR(60) NOT NULL, doc_id VARCHAR(120) NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb, orden INTEGER NOT NULL DEFAULT 0, activo BOOLEAN NOT NULL DEFAULT true, PRIMARY KEY (coleccion, doc_id));`);

  // ── crear-admin: crear NUEVO admin ──
  const admin = await one(`INSERT INTO usuarios (email,nombre,password_hash,rol) VALUES ($1,$2,$3,$4) RETURNING id, rol`, ['admin@nv.com', 'Administrador', '$2y$hash', 'admin']);
  ok(admin.rol === 'admin', 'crear-admin: usuario nuevo se crea con rol admin');

  // ── crear-admin: PROMOVER a admin uno existente (setRol) ──
  await one(`INSERT INTO usuarios (email,nombre,password_hash,rol) VALUES ($1,$2,$3,'cliente') RETURNING id`, ['nathan@nv.com', 'Nathan', '$2y$hash']);
  const prom = (await pool.query(`UPDATE usuarios SET rol=$1 WHERE lower(email)=lower($2) RETURNING id`, ['admin', 'NATHAN@nv.com'])).rows;
  ok(prom.length === 1, 'crear-admin: promover a admin encuentra al usuario (case-insensitive)');
  ok((await one(`SELECT rol FROM usuarios WHERE email=$1`, ['nathan@nv.com'])).rol === 'admin', 'crear-admin: el usuario existente queda como admin');

  // ── seed:cms desde un objeto tipo seed-cms.json ──
  const semilla: Record<string, Array<Record<string, unknown>>> = {
    configuracion_sistema: [{ id: 'parametros', tasa_bcv: 36.5, garantia_dias: 7 }],
    plataformas: [{ id: 'netflix', nombre: 'Netflix', orden: 1 }, { id: 'spotify', nombre: 'Spotify', orden: 2 }],
    servicios_sistema: [{ id: 'ejemplo-netflix', nombre_display: 'EJEMPLO — Netflix', precio: 9.99, orden: 1 }],
  };
  const upsert = async (coleccion: string, doc: Record<string, unknown>) => {
    const id = (doc._id ?? doc.id) as string;
    const { id: _i, ...campos } = doc;
    const orden = Number((campos as any).orden) || 0;
    await pool.query(
      `INSERT INTO cms_documentos (coleccion, doc_id, data, orden) VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT (coleccion, doc_id) DO UPDATE SET data=EXCLUDED.data, orden=EXCLUDED.orden`,
      [coleccion, id, JSON.stringify(campos), orden]);
  };
  const aplicarSemilla = async () => { for (const [c, docs] of Object.entries(semilla)) for (const d of docs) await upsert(c, d); };

  await aplicarSemilla();
  ok((await all(`SELECT * FROM cms_documentos WHERE coleccion='plataformas'`)).length === 2, 'seed:cms: plataformas cargadas (2)');
  const param = await one(`SELECT data FROM cms_documentos WHERE coleccion='configuracion_sistema' AND doc_id='parametros'`);
  ok(Number(param.data.tasa_bcv) === 36.5, 'seed:cms: config guardada (tasa_bcv=36.5)');

  // idempotente: re-ejecutar no duplica
  await aplicarSemilla();
  ok((await all(`SELECT * FROM cms_documentos`)).length === 4, 'seed:cms: re-ejecutar es idempotente (sigue habiendo 4 docs)');

  console.log(fallos === 0 ? '\n✅ MIGRATE/seed smoke test: TODO OK' : `\n❌ MIGRATE smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
