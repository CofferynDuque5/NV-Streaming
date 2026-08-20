/**
 * Pruebas del aviso de vencimiento a EXACTAMENTE N días (Template Message),
 * con repo y sender de plantillas falsos. Ejecutar:  npm run test:reminders
 */
import assert from 'node:assert/strict';
import { runExpiryReminders, buildTemplateParams, type ReminderDeps } from '../src/modules/reminders/expiry-reminder.service.js';
import type { VencimientoProximo } from '../src/db/repositories/subscriptions.repo.js';
import type { TemplateSender } from '../src/services/whatsapp.service.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const AHORA = new Date('2026-07-15T00:00:00Z');
const venc = (over: Partial<VencimientoProximo> = {}): VencimientoProximo => ({
  id: 's1', plataforma_id: 'netflix', fecha_vencimiento: new Date('2026-07-18T00:00:00Z'),
  id_whatsapp: '584160000000', cliente_nombre: 'Nathan', perfil: 'Perfil 1',
  plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD', ...over,
});

function harness(rows: VencimientoProximo[], sendResult: { id: string } | null = { id: 'wamid.X' }) {
  const calls: { to: string; name: string; lang: string; params: string[] }[] = [];
  let diasPedidos = -1;
  const sender: TemplateSender = { sendTemplate: async (to, name, lang, params) => { calls.push({ to, name, lang, params }); return sendResult; } };
  const deps: ReminderDeps = {
    now: () => AHORA,
    sender,
    templateName: 'vencimiento_perfil',
    languageCode: 'es',
    subs: { findExpiringExactlyInDays: async (_now, dias) => { diasPedidos = dias; return rows; } },
  };
  return { deps, calls, get diasPedidos() { return diasPedidos; } };
}

/* ── 1) Consulta EXACTAMENTE por N días y envía una plantilla por suscripción ── */
await t('envía template a cada suscripción que vence en exactamente 3 días', async () => {
  const h = harness([venc({ id: 'a', id_whatsapp: '58411' }), venc({ id: 'b', id_whatsapp: '58422' })]);
  const r = await runExpiryReminders(3, h.deps);
  assert.equal(h.diasPedidos, 3, 'debe consultar exactamente 3 días');
  assert.deepEqual(r, { encontradas: 2, enviadas: 2, fallidas: 0 });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0]!.name, 'vencimiento_perfil');
  assert.equal(h.calls[0]!.lang, 'es');
});

/* ── 2) Parámetros del body incluyen el perfil privado y la fecha ── */
await t('parámetros del template: nombre, servicio, perfil, días, fecha', async () => {
  const params = buildTemplateParams(venc(), 3);
  assert.deepEqual(params, ['Nathan', 'Netflix Premium', 'Perfil 1', '3', '2026-07-18']);
});

/* ── 3) Sin coincidencias → no envía nada ── */
await t('sin suscripciones a 3 días → 0 enviadas', async () => {
  const h = harness([]);
  const r = await runExpiryReminders(3, h.deps);
  assert.deepEqual(r, { encontradas: 0, enviadas: 0, fallidas: 0 });
  assert.equal(h.calls.length, 0);
});

/* ── 4) Fallo de envío se contabiliza ── */
await t('si el envío falla → cuenta en fallidas', async () => {
  const h = harness([venc()], null);
  const r = await runExpiryReminders(3, h.deps);
  assert.deepEqual(r, { encontradas: 1, enviadas: 0, fallidas: 1 });
});

console.log(`\n${pass}/${total} pruebas de avisos de vencimiento OK`);
