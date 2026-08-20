/**
 * Smoke test de documentos por usuario (Fase 2c) con pg-mem. Verifica el
 * AISLAMIENTO POR DUEÑO (un cliente solo ve lo suyo), la vista admin (todo),
 * la creación por el cliente y el upsert admin.
 *
 *   npm run test:userdocs
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
  const all = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  await pool.query(`CREATE TABLE docs_usuario (
    coleccion VARCHAR(60) NOT NULL, doc_id VARCHAR(120) NOT NULL, uid_usuario UUID,
    data JSONB NOT NULL DEFAULT '{}'::jsonb, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (coleccion, doc_id));`);

  const uidA = randomUUID(), uidB = randomUUID();
  const upsert = (coleccion: string, id: string, uid: string | null, data: Record<string, unknown>) =>
    pool.query(`INSERT INTO docs_usuario (coleccion, doc_id, uid_usuario, data) VALUES ($1,$2,$3,$4::jsonb)
                ON CONFLICT (coleccion, doc_id) DO UPDATE SET data=EXCLUDED.data, uid_usuario=COALESCE(EXCLUDED.uid_usuario, docs_usuario.uid_usuario)`,
      [coleccion, id, uid, JSON.stringify(data)]);
  const mios = (coleccion: string, uid: string) => all(`SELECT doc_id, uid_usuario, data FROM docs_usuario WHERE coleccion=$1 AND uid_usuario=$2`, [coleccion, uid]);
  const todos = (coleccion: string) => all(`SELECT doc_id FROM docs_usuario WHERE coleccion=$1`, [coleccion]);

  // Admin asigna suscripciones a A y B
  await upsert('suscripciones', 'sus_A1', uidA, { servicio: 'netflix', perfil: 'Perfil 1', estado: 'activo', precioVenta: 9.99 });
  await upsert('suscripciones', 'sus_A2', uidA, { servicio: 'spotify', estado: 'activo', precioVenta: 5.99 });
  await upsert('suscripciones', 'sus_B1', uidB, { servicio: 'disney', estado: 'activo', precioVenta: 8.99 });

  const deA = await mios('suscripciones', uidA);
  ok(deA.length === 2, 'el cliente A ve SOLO sus 2 suscripciones');
  ok(deA.every((d) => d.uid_usuario === uidA), 'ninguna suscripción ajena se cuela');
  ok((await mios('suscripciones', uidB)).length === 1, 'el cliente B ve solo la suya (1)');
  ok((await todos('suscripciones')).length === 3, 'el admin ve las 3');

  // Cliente A abre un ticket de soporte
  await upsert('tickets_soporte', 'tk_1', uidA, { asunto: 'No entra Netflix', estado: 'abierto', mensajes: [{ de: 'cliente', texto: 'No puedo entrar' }] });
  ok((await mios('tickets_soporte', uidA)).length === 1, 'A ve su ticket');
  ok((await mios('tickets_soporte', uidB)).length === 0, 'B NO ve el ticket de A');

  // Admin responde (upsert conserva el dueño con COALESCE aunque no reenvíe uid)
  await upsert('tickets_soporte', 'tk_1', null, { asunto: 'No entra Netflix', estado: 'respondido', mensajes: [{ de: 'cliente', texto: 'No puedo entrar' }, { de: 'soporte', texto: 'Te reenvío credenciales' }] });
  const tkA = await mios('tickets_soporte', uidA);
  ok(tkA.length === 1 && (tkA[0].data as any).estado === 'respondido', 'admin responde y el ticket SIGUE siendo de A (dueño conservado)');

  console.log(fallos === 0 ? '\n✅ USERDOCS smoke test: TODO OK' : `\n❌ USERDOCS smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
