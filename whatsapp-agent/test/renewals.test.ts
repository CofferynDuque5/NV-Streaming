/**
 * Pruebas del ciclo de renovaciones con repos y sender falsos (sin red ni BD).
 * Ejecutar:  npm run test:renewals
 */
import assert from 'node:assert/strict';
import { runRenewalCycle, type RenewalDeps } from '../src/modules/renewals/renewals.service.js';
import type { SuscripcionCobro } from '../src/db/repositories/subscriptions.repo.js';
import type { Sender } from '../src/services/whatsapp.service.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const AHORA = new Date('2026-07-15T00:00:00Z');
const cobro = (over: Partial<SuscripcionCobro> = {}): SuscripcionCobro => ({
  id: 's1', plataforma_id: 'netflix', renovacion_automatica: false,
  fecha_vencimiento: new Date('2026-07-10T00:00:00Z'), id_whatsapp: '584160000000',
  cliente_nombre: 'Nathan', plan_nombre: 'Netflix Premium', plan_precio: '5.99',
  plan_moneda: 'USD', plan_duracion: 30, ...over,
});

function harness(over: {
  due?: SuscripcionCobro[]; soon?: SuscripcionCobro[];
} = {}) {
  const sent: { to: string; body: string }[] = [];
  const renovados: { id: string; dias: number }[] = [];
  let expiredIds: string[] = [];
  const sender: Sender = { sendText: async (to, body) => { sent.push({ to, body }); return { id: 'x' }; } };
  const deps: RenewalDeps = {
    now: () => AHORA,
    sender,
    subs: {
      findDueActive: async () => over.due ?? [],
      findExpiringSoon: async () => over.soon ?? [],
      markExpired: async (ids) => { expiredIds = ids; return ids.length; },
      renovar: async (id, dias) => { renovados.push({ id, dias }); return new Date('2026-08-14T00:00:00Z'); },
    },
  };
  return { deps, sent, renovados, get expiredIds() { return expiredIds; } };
}

/* ── 1) Vencida sin auto-renovación → se marca vencida y se guía al pago ── */
await t('vencida (no auto) → markExpired + mensaje de pago con precio de BD', async () => {
  const h = harness({ due: [cobro({ id: 'sV', renovacion_automatica: false })] });
  const r = await runRenewalCycle(3, h.deps);
  assert.equal(r.vencidas, 1);
  assert.equal(r.renovadas, 0);
  assert.deepEqual(h.expiredIds, ['sV']);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0]!.body, /venció/);
  assert.match(h.sent[0]!.body, /5\.99 USD/); // precio desde la BD, no inventado
});

/* ── 2) Vencida con auto-renovación → renueva y avisa (no se marca vencida) ── */
await t('vencida (auto) → renovar por duracion del plan + aviso, no expira', async () => {
  const h = harness({ due: [cobro({ id: 'sA', renovacion_automatica: true, plan_duracion: 30 })] });
  const r = await runRenewalCycle(3, h.deps);
  assert.equal(r.renovadas, 1);
  assert.equal(r.vencidas, 0);
  assert.deepEqual(h.renovados, [{ id: 'sA', dias: 30 }]);
  assert.deepEqual(h.expiredIds, []);
  assert.match(h.sent[0]!.body, /Renovamos/);
});

/* ── 3) Por vencer → recordatorio de pago ── */
await t('por vencer → recordatorio con fecha y precio', async () => {
  const h = harness({ soon: [cobro({ id: 'sS', fecha_vencimiento: new Date('2026-07-17T00:00:00Z') })] });
  const r = await runRenewalCycle(3, h.deps);
  assert.equal(r.recordatorios, 1);
  assert.match(h.sent[0]!.body, /vence el 2026-07-17/);
  assert.match(h.sent[0]!.body, /5\.99 USD/);
});

/* ── 4) Mezcla: expira una, renueva otra, recuerda a una tercera ── */
await t('ciclo mixto: 1 vencida + 1 auto-renovada + 1 recordatorio', async () => {
  const h = harness({
    due: [cobro({ id: 'a', renovacion_automatica: false }), cobro({ id: 'b', renovacion_automatica: true })],
    soon: [cobro({ id: 'c', fecha_vencimiento: new Date('2026-07-16T00:00:00Z') })],
  });
  const r = await runRenewalCycle(3, h.deps);
  assert.deepEqual(r, { vencidas: 1, renovadas: 1, recordatorios: 1 });
  assert.deepEqual(h.expiredIds, ['a']);
  assert.equal(h.sent.length, 3);
});

console.log(`\n${pass}/${total} pruebas de renovaciones OK`);
