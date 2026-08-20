/**
 * Pruebas de la pasarela de pago con repos y sender falsos (sin red ni BD).
 * Ejecutar:  npm run test:payments
 */
import assert from 'node:assert/strict';
import { registrarPago, confirmarPago, rechazarPago, type PaymentDeps } from '../src/modules/payments/payments.service.js';
import type { Pago, Plan, Usuario } from '../src/db/models.js';
import type { ConfirmacionResultado } from '../src/db/repositories/payments.repo.js';
import type { Sender } from '../src/services/whatsapp.service.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const USER: Usuario = { id: 'u1', id_whatsapp: '584160000000', nombre: 'Nathan', email: null, creado_en: new Date(), actualizado_en: new Date() };
const PLAN: Plan = { id: 'plan1', plataforma_id: 'netflix', nombre: 'Netflix Premium', precio: '5.99', moneda: 'USD', duracion_dias: 30, activo: true };
const pagoFijo = (over: Partial<Pago> = {}): Pago => ({
  id: 'pg1', usuario_id: 'u1', suscripcion_id: 'sub1', plataforma_id: 'netflix', plan_id: 'plan1',
  metodo: 'pago_movil', monto: '5.99', moneda: 'USD', referencia: null, comprobante_url: null,
  estado: 'pendiente', motivo_rechazo: null, confirmado_por: null, creado_en: new Date(), confirmado_en: null, ...over,
});

function makeDeps(over: Partial<{
  create: PaymentDeps['payments']['create'];
  confirmAndRenew: PaymentDeps['payments']['confirmAndRenew'];
  reject: PaymentDeps['payments']['reject'];
  findPlan: PaymentDeps['plans']['findActiveByPlatform'];
  findUser: PaymentDeps['users']['findByWhatsapp'];
  sent: { to: string; body: string }[];
  facturas: { to: string; factura: import('../src/modules/billing/invoice.js').Factura }[];
}> = {}): PaymentDeps {
  const sent = over.sent ?? [];
  const facturas = over.facturas ?? [];
  const sender: Sender = { sendText: async (to, body) => { sent.push({ to, body }); return { id: 'x' }; } };
  return {
    payments: {
      create: over.create ?? (async (input) => pagoFijo({ ...input, id: 'pgNEW', monto: input.monto })),
      confirmAndRenew: over.confirmAndRenew ?? (async () => null),
      reject: over.reject ?? (async () => null),
    },
    plans: { findActiveByPlatform: over.findPlan ?? (async () => PLAN) },
    users: { findByWhatsapp: over.findUser ?? (async () => USER) },
    sender,
    email: {
      enviar: async () => ({ id: 'e' }),
      enviarBienvenida: async () => ({ id: 'e' }),
      enviarFactura: async (to, factura) => { facturas.push({ to, factura }); return { id: 'e' }; },
    },
    metodoInfo: (m) => (m === 'pago_movil' ? { nombre: 'Pago Móvil', instrucciones: 'Paga a V-123 · 0412…' } : null),
  };
}

/* ── 1) Registrar: monto del plan (BD) + instrucciones del método ── */
await t('registrarPago crea pendiente con monto del plan e instrucciones', async () => {
  const deps = makeDeps();
  const r = await registrarPago({ whatsappId: '584160000000', servicio: 'netflix', metodo: 'pago_movil', suscripcionId: 'sub1' }, deps);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.monto, '5.99');       // desde el plan, no inventado
    assert.equal(r.metodo_nombre, 'Pago Móvil');
    assert.match(r.instrucciones, /V-123/);
    assert.equal(r.pago.estado, 'pendiente');
  }
});

/* ── 2) Método inválido / servicio sin plan → rechaza registro ── */
await t('registrarPago con servicio sin plan → ok:false', async () => {
  const deps = makeDeps({ findPlan: async () => null });
  const r = await registrarPago({ whatsappId: '584160000000', servicio: 'inexistente', metodo: 'pago_movil' }, deps);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'servicio_sin_plan');
});

/* ── 3) Confirmar: renueva y notifica al cliente ── */
await t('confirmarPago → renueva, avisa por WhatsApp y envía factura por correo', async () => {
  const sent: { to: string; body: string }[] = [];
  const facturas: { to: string; factura: import('../src/modules/billing/invoice.js').Factura }[] = [];
  const resultado: ConfirmacionResultado = {
    pago_id: 'pg1', usuario_id: 'u1', id_whatsapp: '584160000000', email: 'cliente@nv.com',
    cliente_nombre: 'Nathan', plataforma_id: 'netflix', plan_nombre: 'Netflix Premium',
    monto: '5.99', moneda: 'USD', metodo: 'pago_movil', suscripcion_id: 'sub1',
    nueva_fecha_vencimiento: new Date('2026-08-14T00:00:00Z'),
    perfil: 'Perfil 3', asignado: true, sin_stock: false,
  };
  const deps = makeDeps({ sent, facturas, confirmAndRenew: async (id, admin) => { assert.equal(id, 'pg1'); assert.equal(admin, 'op1'); return resultado; } });
  const r = await confirmarPago('pg1', 'op1', deps);
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.body, /Pago confirmado/);
  assert.match(sent[0]!.body, /2026-08-14/);
  assert.match(sent[0]!.body, /Perfil asignado: Perfil 3/);  // asignación automática
  // Factura por correo.
  assert.equal(facturas.length, 1);
  assert.equal(facturas[0]!.to, 'cliente@nv.com');
  assert.equal(facturas[0]!.factura.monto, '5.99');
  assert.equal(facturas[0]!.factura.vencimiento, '2026-08-14');
});

/* ── 3.b) Sin stock → cola de espera, aviso amable, sin mensaje de "confirmado" ── */
await t('confirmarPago sin stock → lista de espera + factura, no promete acceso', async () => {
  const sent: { to: string; body: string }[] = [];
  const facturas: { to: string; factura: import('../src/modules/billing/invoice.js').Factura }[] = [];
  const resultado: ConfirmacionResultado = {
    pago_id: 'pg9', usuario_id: 'u1', id_whatsapp: '584160000000', email: 'cliente@nv.com',
    cliente_nombre: 'Nathan', plataforma_id: 'netflix', plan_nombre: 'Netflix Premium',
    monto: '5.99', moneda: 'USD', metodo: 'binance', suscripcion_id: null,
    nueva_fecha_vencimiento: null, perfil: null, asignado: false, sin_stock: true,
  };
  const deps = makeDeps({ sent, facturas, confirmAndRenew: async () => resultado });
  const r = await confirmarPago('pg9', 'op1', deps);
  assert.equal(r.ok, true);
  assert.match(sent[0]!.body, /LISTA DE ESPERA/i);
  assert.ok(!/Pago confirmado!/.test(sent[0]!.body), 'no debe prometer acceso inmediato');
  assert.equal(facturas.length, 1, 'igual envía la factura como comprobante');
});

/* ── 4) Confirmar dos veces / inexistente → 409 (idempotente) ── */
await t('confirmarPago no pendiente → ok:false, sin notificar', async () => {
  const sent: { to: string; body: string }[] = [];
  const deps = makeDeps({ sent, confirmAndRenew: async () => null });
  const r = await confirmarPago('pgX', 'op1', deps);
  assert.equal(r.ok, false);
  assert.equal(sent.length, 0);
});

/* ── 5) Rechazar: notifica el motivo ── */
await t('rechazarPago → marca rechazado y avisa el motivo', async () => {
  const sent: { to: string; body: string }[] = [];
  const deps = makeDeps({ sent, reject: async (id, _admin, motivo) => { assert.equal(id, 'pg1'); assert.match(motivo, /borroso/); return { id_whatsapp: '584160000000', plataforma_id: 'netflix' }; } });
  const r = await rechazarPago('pg1', 'op1', 'comprobante borroso', deps);
  assert.equal(r.ok, true);
  assert.match(sent[0]!.body, /No pudimos validar/);
  assert.match(sent[0]!.body, /borroso/);
});

console.log(`\n${pass}/${total} pruebas de pagos OK`);
