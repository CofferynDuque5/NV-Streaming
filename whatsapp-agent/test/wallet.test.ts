/**
 * Smoke test de la billetera (Fase 2b) con Postgres en memoria (pg-mem).
 * Verifica la CORRECCIÓN DEL DINERO replicando el SQL de WalletRepository:
 * aprobar acredita exactamente una vez, la doble aprobación no duplica saldo,
 * el libro mayor cuadra y un débito sin fondos se rechaza.
 *
 *   npm run test:wallet
 */
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { normalizarMetodoRecarga } from '../src/config/payment-methods.js';

let fallos = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fallos++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

async function main() {
  const db = newDb();
  db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => randomUUID() });
  // Postgres real trae date_trunc; pg-mem no, así que lo registramos para el test.
  db.public.registerFunction({
    name: 'date_trunc', args: [DataType.text, DataType.timestamptz], returns: DataType.timestamptz,
    implementation: (unit: string, ts: Date) => { const d = new Date(ts); return unit === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1) : d; },
  });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as any;
  const all = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  await pool.query(`CREATE TABLE usuarios (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(160), saldo_billetera NUMERIC(12,2) NOT NULL DEFAULT 0);`);
  await pool.query(`CREATE TABLE recargas_billetera (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), uid_usuario UUID NOT NULL, monto NUMERIC(12,2) NOT NULL, metodo_pago VARCHAR(40), estado VARCHAR(20) NOT NULL DEFAULT 'pendiente', aprobado_por UUID);`);
  await pool.query(`CREATE TABLE movimientos_billetera (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), uid_usuario UUID NOT NULL, tipo VARCHAR(10) NOT NULL, monto NUMERIC(12,2) NOT NULL, descripcion TEXT, referencia VARCHAR(120), saldo_posterior NUMERIC(12,2) NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`);

  // ── Validación/normalización del método de recarga (pura) ──
  ok(normalizarMetodoRecarga('binance_pay') === 'binance', 'alias binance_pay → binance');
  ok(normalizarMetodoRecarga('Pago Movil') === 'pago_movil', 'alias "Pago Movil" → pago_movil');
  ok(normalizarMetodoRecarga('transfer') === 'transferencia', 'alias transfer → transferencia');
  ok(normalizarMetodoRecarga('zelle') === 'zelle', 'zelle se mantiene');
  ok(normalizarMetodoRecarga('bitcoin') === null, 'método desconocido → null (se rechaza)');
  ok(normalizarMetodoRecarga('') === null, 'método vacío → null');

  const uid = (await one(`INSERT INTO usuarios (email, saldo_billetera) VALUES ($1,0) RETURNING id`, ['cliente@ej.com'])).id;
  const recId = (await one(`INSERT INTO recargas_billetera (uid_usuario, monto, metodo_pago) VALUES ($1,$2,$3) RETURNING id`, [uid, 50, 'zelle'])).id;

  // aprobarRecarga (mismo SQL que el repo)
  async function aprobar(id: string): Promise<boolean> {
    const rec = await one(`SELECT * FROM recargas_billetera WHERE id=$1 AND estado='pendiente' FOR UPDATE`, [id]);
    if (!rec) return false; // ya procesada → no acredita (evita doble crédito)
    const u = await one(`SELECT saldo_billetera FROM usuarios WHERE id=$1 FOR UPDATE`, [rec.uid_usuario]);
    const nuevo = Number(u.saldo_billetera) + Number(rec.monto);
    await pool.query(`UPDATE usuarios SET saldo_billetera=$1 WHERE id=$2`, [nuevo, rec.uid_usuario]);
    await pool.query(`UPDATE recargas_billetera SET estado='aprobado' WHERE id=$1`, [id]);
    await pool.query(`INSERT INTO movimientos_billetera (uid_usuario,tipo,monto,descripcion,referencia,saldo_posterior) VALUES ($1,'ingreso',$2,$3,$4,$5)`, [rec.uid_usuario, rec.monto, 'Recarga aprobada', id, nuevo]);
    return true;
  }
  async function debitar(id: string, monto: number): Promise<boolean> {
    const u = await one(`SELECT saldo_billetera FROM usuarios WHERE id=$1 FOR UPDATE`, [id]);
    if (Number(u.saldo_billetera) < monto) return false; // saldo insuficiente
    const nuevo = Number(u.saldo_billetera) - monto;
    await pool.query(`UPDATE usuarios SET saldo_billetera=$1 WHERE id=$2`, [nuevo, id]);
    await pool.query(`INSERT INTO movimientos_billetera (uid_usuario,tipo,monto,descripcion,referencia,saldo_posterior) VALUES ($1,'egreso',$2,$3,$4,$5)`, [id, monto, 'Compra', 'ped_1', nuevo]);
    return true;
  }
  const saldo = async () => Number((await one(`SELECT saldo_billetera FROM usuarios WHERE id=$1`, [uid])).saldo_billetera);

  // 1) aprobar la recarga
  ok(await aprobar(recId), 'aprobar recarga pendiente devuelve true');
  ok(await saldo() === 50, 'saldo acreditado exactamente (0 → 50)');
  const mov1 = await all(`SELECT * FROM movimientos_billetera WHERE uid_usuario=$1`, [uid]);
  ok(mov1.length === 1 && mov1[0].tipo === 'ingreso' && Number(mov1[0].saldo_posterior) === 50, 'libro mayor: 1 ingreso con saldo_posterior=50');
  ok((await one(`SELECT estado FROM recargas_billetera WHERE id=$1`, [recId])).estado === 'aprobado', 'recarga queda en estado aprobado');

  // 2) DOBLE APROBACIÓN no debe duplicar el saldo
  ok(!(await aprobar(recId)), 'segunda aprobación de la MISMA recarga se rechaza');
  ok(await saldo() === 50, 'saldo sigue en 50 (sin doble crédito)');

  // 3) débito válido
  ok(await debitar(uid, 30), 'débito de 30 con saldo suficiente OK');
  ok(await saldo() === 20, 'saldo 50 → 20 tras débito');

  // 4) débito sin fondos se rechaza
  ok(!(await debitar(uid, 100)), 'débito de 100 sin fondos se rechaza');
  ok(await saldo() === 20, 'saldo intacto (20) tras débito rechazado');

  const movs = await all(`SELECT * FROM movimientos_billetera WHERE uid_usuario=$1 ORDER BY creado_en`, [uid]);
  ok(movs.length === 2, 'libro mayor con 2 asientos (1 ingreso + 1 egreso), sin fantasmas');

  // 4b) TRANSFERENCIA entre usuarios (mismo SQL que WalletRepository.transferir).
  //     Usuarios propios (A=40, B=0) para no alterar las stats de `uid`.
  const uidA = (await one(`INSERT INTO usuarios (email, saldo_billetera) VALUES ($1,40) RETURNING id`, ['tra@ej.com'])).id;
  const uidB = (await one(`INSERT INTO usuarios (email, saldo_billetera) VALUES ($1,0) RETURNING id`, ['trb@ej.com'])).id;
  async function transferir(origen: string, emailDest: string, monto: number): Promise<string | true> {
    const dest = await one(`SELECT id, saldo_billetera FROM usuarios WHERE lower(email)=lower($1) LIMIT 1`, [emailDest]);
    if (!dest) return 'destino_no_encontrado';
    if (dest.id === origen) return 'destino_invalido';
    const o = await one(`SELECT saldo_billetera FROM usuarios WHERE id=$1 FOR UPDATE`, [origen]);
    if (Number(o.saldo_billetera) < monto) return 'saldo_insuficiente';
    await pool.query(`UPDATE usuarios SET saldo_billetera=saldo_billetera-$2 WHERE id=$1`, [origen, monto]);
    await pool.query(`UPDATE usuarios SET saldo_billetera=saldo_billetera+$2 WHERE id=$1`, [dest.id, monto]);
    return true;
  }
  const saldoDe = async (id: string) => Number((await one(`SELECT saldo_billetera FROM usuarios WHERE id=$1`, [id])).saldo_billetera);
  ok((await transferir(uidA, 'trb@ej.com', 15)) === true, 'transferencia de 15 A→B OK');
  ok(await saldoDe(uidA) === 25 && await saldoDe(uidB) === 15, 'saldos tras transferir: A 40→25, B 0→15');
  ok((await transferir(uidA, 'trb@ej.com', 999)) === 'saldo_insuficiente', 'transferencia sin fondos se rechaza');
  ok((await transferir(uidA, 'tra@ej.com', 1)) === 'destino_invalido', 'transferencia a sí mismo se rechaza');
  ok(await saldoDe(uidA) === 25 && await saldoDe(uidB) === 15, 'saldos intactos tras transferencias rechazadas');

  // 5) STATS SECUNDARIAS (mismo SQL que WalletRepository.estadisticas)
  //    Dejamos una recarga PENDIENTE de 15 → debe contar como "reservado".
  await one(`INSERT INTO recargas_billetera (uid_usuario, monto, metodo_pago) VALUES ($1,$2,$3) RETURNING id`, [uid, 15, 'pagomovil']);
  const stats = await one(
    `SELECT
       COALESCE((SELECT SUM(monto) FROM recargas_billetera WHERE uid_usuario=$1 AND estado='pendiente'),0)                              AS reservado,
       COALESCE((SELECT SUM(monto) FROM movimientos_billetera WHERE uid_usuario=$1 AND tipo='egreso' AND creado_en >= date_trunc('month', now())),0) AS gastado_mes,
       COALESCE((SELECT COUNT(*) FROM movimientos_billetera WHERE uid_usuario=$1),0)                                                     AS total_mov`,
    [uid]);
  ok(Number(stats.reservado) === 15, 'stats.reservado = recargas pendientes (15)');
  ok(Number(stats.gastado_mes) === 30, 'stats.gastadoMes = egresos del mes (30)');
  ok(Number(stats.total_mov) === 2, 'stats.totalMovimientos = 2');
  const s = await saldo();
  const denom = Number(stats.gastado_mes) + s;
  const uso = denom > 0 ? Math.round((Number(stats.gastado_mes) / denom) * 1000) / 10 : 0;
  ok(uso === 60, 'stats.usoSaldo = gastado/(gastado+saldo) = 30/50 = 60%');

  console.log(fallos === 0 ? '\n✅ WALLET smoke test: TODO OK' : `\n❌ WALLET smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
