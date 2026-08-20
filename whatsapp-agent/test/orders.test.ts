/**
 * Smoke test de pedidos (Fase 2b) con pg-mem. Verifica el SQL de OrdersRepository:
 * crear (pendiente por defecto), listar por usuario/estado y transición de estado
 * con validación (CHECK de estados).
 *
 *   npm run test:orders
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

  await pool.query(`CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid_cliente UUID, email_cliente VARCHAR(160), id_servicio VARCHAR(80) NOT NULL,
    precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0), metodo_pago VARCHAR(40),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','entregado')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);

  const uid = randomUUID();
  const p1 = await one(`INSERT INTO pedidos (uid_cliente,email_cliente,id_servicio,precio,metodo_pago) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [uid, 'c@ej.com', 'netflix', 9.99, 'zelle']);
  ok(p1.estado === 'pendiente', 'pedido nuevo nace en estado pendiente');
  ok(Number(p1.precio) === 9.99, 'precio guardado con decimales correctos');

  await one(`INSERT INTO pedidos (uid_cliente,id_servicio,precio) VALUES ($1,$2,$3) RETURNING id`, [uid, 'spotify', 5.99]);
  ok((await all(`SELECT * FROM pedidos WHERE uid_cliente=$1`, [uid])).length === 2, 'listar por usuario devuelve sus 2 pedidos');
  ok((await all(`SELECT * FROM pedidos WHERE estado='pendiente'`)).length === 2, 'listar por estado pendiente devuelve 2');

  // transición de estado válida
  const upd = await one(`UPDATE pedidos SET estado=$1 WHERE id=$2 RETURNING *`, ['aprobado', p1.id]);
  ok(upd.estado === 'aprobado', 'cambiar estado a aprobado funciona');
  ok((await all(`SELECT * FROM pedidos WHERE estado='pendiente'`)).length === 1, 'ahora queda 1 pendiente');

  // estado inválido rechazado por el CHECK
  let rechazado = false;
  try { await pool.query(`UPDATE pedidos SET estado=$1 WHERE id=$2`, ['banana', p1.id]); }
  catch { rechazado = true; }
  ok(rechazado, 'estado inválido ("banana") lo rechaza el CHECK de la BD');

  // precio negativo rechazado
  let negRech = false;
  try { await pool.query(`INSERT INTO pedidos (id_servicio,precio) VALUES ($1,$2)`, ['x', -5]); }
  catch { negRech = true; }
  ok(negRech, 'precio negativo lo rechaza el CHECK de la BD');

  console.log(fallos === 0 ? '\n✅ ORDERS smoke test: TODO OK' : `\n❌ ORDERS smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
