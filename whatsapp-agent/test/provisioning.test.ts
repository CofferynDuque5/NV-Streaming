/**
 * Smoke test del aprovisionamiento compra→streaming (pg-mem). Replica el SQL de
 * SubscriptionsRepository.provisionarCompra: asigna un perfil libre, crea la
 * suscripción activa, marca la cuenta 'asignada', y al agotarse el stock deja al
 * cliente en cola de espera (sin doble asignación de la misma cuenta).
 *
 *   npx tsx test/provisioning.test.ts
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

  await pool.query(`CREATE TABLE cuentas_streaming (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), plataforma_id VARCHAR(60), correo VARCHAR(160), perfil VARCHAR(60), estado VARCHAR(20) NOT NULL DEFAULT 'disponible', creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);
  await pool.query(`CREATE TABLE suscripciones (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID, cuenta_streaming_id UUID, plataforma_id VARCHAR(60), plan_id UUID, estado VARCHAR(20) NOT NULL DEFAULT 'activa', pagada BOOLEAN, fecha_inicio TIMESTAMPTZ, fecha_vencimiento TIMESTAMPTZ, renovacion_automatica BOOLEAN, creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);
  await pool.query(`CREATE TABLE cola_espera (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID, plataforma_id VARCHAR(60), plan_id UUID, creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);
  await pool.query(`CREATE TABLE alertas_admin (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tipo VARCHAR(40), mensaje TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);

  const planId = randomUUID();
  const venc = new Date('2026-09-10T00:00:00Z'); // vencimiento fijo (evita interval de pg-mem)

  // provisionarCompra (misma lógica que el repo; sin SKIP LOCKED, innecesario en el test).
  async function provisionar(usuarioId: string, plataformaId: string, pedidoId: string) {
    const libre = await all(`SELECT id, perfil FROM cuentas_streaming WHERE plataforma_id=$1 AND estado='disponible' ORDER BY creado_en ASC LIMIT 1`, [plataformaId]);
    if (libre.length) {
      const c = libre[0];
      await pool.query(`UPDATE cuentas_streaming SET estado='asignada' WHERE id=$1`, [c.id]);
      const ins = await one(
        `INSERT INTO suscripciones (usuario_id,cuenta_streaming_id,plataforma_id,plan_id,estado,pagada,fecha_inicio,fecha_vencimiento,renovacion_automatica)
         VALUES ($1,$2,$3,$4,'activa',TRUE,now(),$5,FALSE) RETURNING id`,
        [usuarioId, c.id, plataformaId, planId, venc]);
      return { asignado: true, sin_stock: false, suscripcion_id: ins.id, perfil: c.perfil };
    }
    await pool.query(`INSERT INTO cola_espera (usuario_id,plataforma_id,plan_id) VALUES ($1,$2,$3)`, [usuarioId, plataformaId, planId]);
    await pool.query(`INSERT INTO alertas_admin (tipo,mensaje) VALUES ('sin_stock',$1)`, [`Sin stock de ${plataformaId}: cliente ${usuarioId} en cola (pedido ${pedidoId}).`]);
    return { asignado: false, sin_stock: true, suscripcion_id: null, perfil: null };
  }

  // Stock: 2 cuentas Netflix disponibles.
  await pool.query(`INSERT INTO cuentas_streaming (plataforma_id,correo,perfil) VALUES ('netflix','a@ct.com','Perfil-A')`);
  await pool.query(`INSERT INTO cuentas_streaming (plataforma_id,correo,perfil) VALUES ('netflix','b@ct.com','Perfil-B')`);
  const u1 = randomUUID(), u2 = randomUUID(), u3 = randomUUID();

  // 1) primera compra → asigna Perfil-A, crea suscripción activa
  const r1 = await provisionar(u1, 'netflix', 'ped1');
  ok(r1.asignado === true && r1.perfil === 'Perfil-A', 'compra 1: asigna el primer perfil libre (Perfil-A)');
  const s1 = await one(`SELECT estado, pagada, cuenta_streaming_id FROM suscripciones WHERE id=$1`, [r1.suscripcion_id]);
  ok(s1.estado === 'activa' && s1.pagada === true, 'compra 1: suscripción queda activa y pagada');
  ok((await one(`SELECT estado FROM cuentas_streaming WHERE perfil='Perfil-A'`)).estado === 'asignada', 'compra 1: la cuenta A pasa a asignada');

  // 2) segunda compra → asigna la OTRA cuenta (Perfil-B), no la misma
  const r2 = await provisionar(u2, 'netflix', 'ped2');
  ok(r2.asignado === true && r2.perfil === 'Perfil-B', 'compra 2: asigna el segundo perfil (Perfil-B), no reusa A');
  ok((await all(`SELECT id FROM cuentas_streaming WHERE plataforma_id='netflix' AND estado='disponible'`)).length === 0, 'ya no queda stock disponible de netflix');

  // 3) tercera compra sin stock → cola de espera, sin suscripción nueva
  const r3 = await provisionar(u3, 'netflix', 'ped3');
  ok(r3.sin_stock === true && r3.suscripcion_id === null, 'compra 3: sin stock → no asigna, va a cola de espera');
  ok((await all(`SELECT id FROM cola_espera WHERE usuario_id=$1`, [u3])).length === 1, 'compra 3: queda registrada en cola_espera');
  ok((await all(`SELECT id FROM alertas_admin WHERE tipo='sin_stock'`)).length === 1, 'compra 3: genera alerta de stock para el admin');
  ok((await all(`SELECT id FROM suscripciones`)).length === 2, 'total suscripciones = 2 (solo las que tuvieron stock)');

  console.log(fallos === 0 ? '\n✅ PROVISIONING smoke test: TODO OK' : `\n❌ PROVISIONING smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
