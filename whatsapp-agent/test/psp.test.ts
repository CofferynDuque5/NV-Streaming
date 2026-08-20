/**
 * Pruebas del cobro automático (webhook PSP) con firmas HMAC reales y deps
 * falsas. Requiere BINANCE_PAY_SECRET y PAGO_MOVIL_WEBHOOK_SECRET en el entorno.
 * Ejecutar:  npm run test:psp
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { procesarNotificacionPSP, type PSPDeps } from '../src/modules/payments/psp/psp.service.js';
import type { HeadersLike } from '../src/modules/payments/psp/types.js';
import type { Pago } from '../src/db/models.js';

const BINANCE_SECRET = process.env['BINANCE_PAY_SECRET']!;
const PM_SECRET = process.env['PAGO_MOVIL_WEBHOOK_SECRET']!;

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const PAGO: Pago = {
  id: 'pg1', usuario_id: 'u1', suscripcion_id: 'sub1', plataforma_id: 'netflix', plan_id: 'plan1',
  metodo: 'binance', monto: '5.99', moneda: 'USD', referencia: 'REF123', comprobante_url: null,
  estado: 'pendiente', motivo_rechazo: null, confirmado_por: null, proveedor: null, id_externo: null,
  creado_en: new Date(), confirmado_en: null,
};

function headers(map: Record<string, string>): HeadersLike {
  return { get: (n) => map[n.toLowerCase()] };
}

function binanceReq(bodyObj: unknown, secret = BINANCE_SECRET) {
  const raw = Buffer.from(JSON.stringify(bodyObj));
  const timestamp = '1700000000000', nonce = 'nonce123';
  const payload = `${timestamp}\n${nonce}\n${raw.toString('utf8')}\n`;
  const sig = crypto.createHmac('sha512', secret).update(payload).digest('hex').toUpperCase();
  return { raw, headers: headers({ 'binancepay-timestamp': timestamp, 'binancepay-nonce': nonce, 'binancepay-signature': sig }), body: bodyObj };
}
const binanceBody = (over: Record<string, unknown> = {}) => ({
  bizType: 'PAY', bizId: 123, bizStatus: 'PAY_SUCCESS',
  data: JSON.stringify({ merchantTradeNo: 'REF123', transactionId: 'TX1', totalFee: '5.99', currency: 'USDT', ...over }),
});

function pmReq(bodyObj: unknown, secret = PM_SECRET) {
  const raw = Buffer.from(JSON.stringify(bodyObj));
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { raw, headers: headers({ 'x-nvpay-signature': sig }), body: bodyObj };
}

function makeDeps(over: Partial<{ seen: Set<string>; pago: Pago | null; strict: boolean; confirmed: { pagoId: string; actor: string }[] }> = {}): PSPDeps {
  const seen = over.seen ?? new Set<string>();
  const confirmed = over.confirmed ?? [];
  return {
    payments: {
      externalAlreadyProcessed: async (id) => seen.has(id),
      findPendingByReferencia: async (ref) => (over.pago !== undefined ? over.pago : (ref === 'REF123' ? PAGO : null)),
      markExternalSeen: async () => { /* noop */ },
    },
    confirmar: async (pagoId, actor) => { confirmed.push({ pagoId, actor }); return { ok: true }; },
    strictAmount: over.strict ?? true,
  };
}

/* ── 1) Binance válido → confirma automáticamente ── */
await t('Binance PAY_SUCCESS válido → llama a confirmarPago', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = binanceReq(binanceBody());
  const r = await procesarNotificacionPSP('binance', raw, h, body, makeDeps({ confirmed }));
  assert.equal(r.status, 200);
  assert.equal(r.motivo, 'confirmado');
  assert.deepEqual(confirmed, [{ pagoId: 'pg1', actor: 'psp:binance' }]);
});

/* ── 2) Firma inválida → 401, no confirma ── */
await t('firma inválida → 401 y NO confirma', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, body } = binanceReq(binanceBody());
  const bad = headers({ 'binancepay-timestamp': '1', 'binancepay-nonce': 'x', 'binancepay-signature': 'DEADBEEF' });
  const r = await procesarNotificacionPSP('binance', raw, bad, body, makeDeps({ confirmed }));
  assert.equal(r.status, 401);
  assert.equal(r.motivo, 'firma_invalida');
  assert.equal(confirmed.length, 0);
});

/* ── 3) Transacción duplicada → idempotente, no confirma ── */
await t('id_externo ya procesado → duplicado, no reconfirma', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = binanceReq(binanceBody());
  const r = await procesarNotificacionPSP('binance', raw, h, body, makeDeps({ seen: new Set(['TX1']), confirmed }));
  assert.equal(r.motivo, 'duplicado');
  assert.equal(confirmed.length, 0);
});

/* ── 4) Sin pago pendiente para la referencia → no confirma ── */
await t('referencia sin pago pendiente → pago_no_encontrado', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = binanceReq(binanceBody({ merchantTradeNo: 'OTRA' }));
  const r = await procesarNotificacionPSP('binance', raw, h, body, makeDeps({ pago: null, confirmed }));
  assert.equal(r.motivo, 'pago_no_encontrado');
  assert.equal(confirmed.length, 0);
});

/* ── 5) Monto insuficiente → no confirma ── */
await t('monto menor al esperado → monto_no_coincide, no confirma', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = binanceReq(binanceBody({ totalFee: '2.00' }));
  const r = await procesarNotificacionPSP('binance', raw, h, body, makeDeps({ confirmed }));
  assert.equal(r.motivo, 'monto_no_coincide');
  assert.equal(confirmed.length, 0);
});

/* ── 6) bizStatus no exitoso → ignora ── */
await t('Binance estado no exitoso → pago_no_exitoso', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const body = { ...binanceBody(), bizStatus: 'PAY_CLOSED' };
  const { raw, headers: h } = binanceReq(body);
  const r = await procesarNotificacionPSP('binance', raw, h, body, makeDeps({ confirmed }));
  assert.equal(r.motivo, 'pago_no_exitoso');
  assert.equal(confirmed.length, 0);
});

/* ── 7) Pago Móvil (VES) válido, modo NO estricto → confirma por referencia ── */
await t('Pago Móvil VES aprobado (lenient) → confirma por referencia', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = pmReq({ id: 'PM1', referencia: 'REF123', monto: 360.5, moneda: 'VES', estado: 'aprobado' });
  const r = await procesarNotificacionPSP('pago_movil', raw, h, body, makeDeps({ strict: false, confirmed }));
  assert.equal(r.motivo, 'confirmado');
  assert.deepEqual(confirmed, [{ pagoId: 'pg1', actor: 'psp:pago_movil' }]);
});

/* ── 8) Pago Móvil (VES) en modo estricto vs plan USD → no confirma ── */
await t('Pago Móvil VES vs plan USD (estricto) → monto_no_coincide', async () => {
  const confirmed: { pagoId: string; actor: string }[] = [];
  const { raw, headers: h, body } = pmReq({ id: 'PM2', referencia: 'REF123', monto: 360.5, moneda: 'VES', estado: 'aprobado' });
  const r = await procesarNotificacionPSP('pago_movil', raw, h, body, makeDeps({ strict: true, confirmed }));
  assert.equal(r.motivo, 'monto_no_coincide');
  assert.equal(confirmed.length, 0);
});

/* ── 9) Proveedor desconocido → 404 ── */
await t('proveedor desconocido → 404', async () => {
  const r = await procesarNotificacionPSP('paypal', Buffer.from('{}'), headers({}), {}, makeDeps());
  assert.equal(r.status, 404);
});

console.log(`\n${pass}/${total} pruebas de PSP OK`);
