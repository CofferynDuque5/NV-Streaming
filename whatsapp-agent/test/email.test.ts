/**
 * Pruebas de correos (bienvenida + factura) con un transporte SMTP falso.
 * Ejecutar:  npm run test:email
 */
import assert from 'node:assert/strict';
import { createEmailService, type EmailTransport } from '../src/services/email.service.js';
import { construirFactura, facturaHtml, facturaNumero } from '../src/modules/billing/invoice.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

function fakeTransport() {
  const sent: (Parameters<EmailTransport['sendMail']>[0])[] = [];
  const transport: EmailTransport = { sendMail: async (m) => { sent.push(m); return { messageId: 'MID1' }; } };
  return { sent, transport };
}

/* ── 1) Bienvenida: incluye enlace a T&C + adjunto + asunto ── */
await t('enviarBienvenida → T&C (enlace + adjunto) y asunto correcto', async () => {
  const { sent, transport } = fakeTransport();
  const svc = createEmailService({ transport, from: 'NV <no-reply@nv.com>', termsUrl: 'https://nv.com/terminos', empresa: 'NV Stream' });
  const r = await svc.enviarBienvenida('cliente@correo.com', 'Nathan');
  assert.equal(r?.id, 'MID1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, 'cliente@correo.com');
  assert.equal(sent[0]!.from, 'NV <no-reply@nv.com>');
  assert.match(sent[0]!.subject, /Bienvenido/);
  assert.match(sent[0]!.html, /https:\/\/nv\.com\/terminos/);
  assert.match(sent[0]!.html, /Nathan/);
  assert.equal(sent[0]!.attachments?.[0]?.filename, 'Terminos-y-Condiciones.html');
});

/* ── 2) Factura: builder + HTML con servicio, monto y vencimiento ── */
await t('construirFactura + facturaHtml → datos correctos', async () => {
  const f = construirFactura({
    pagoId: 'abcd1234-5678', fecha: new Date('2026-07-16T00:00:00Z'),
    cliente_nombre: 'Nathan', cliente_email: 'cliente@correo.com',
    servicio: 'netflix', plan: 'Netflix Premium', monto: '5.99', moneda: 'USD',
    vencimiento: new Date('2026-08-15T00:00:00Z'), metodo: 'pago_movil',
  });
  assert.match(f.numero, /^NV-20260716-ABCD1234$/);
  assert.equal(f.fecha, '2026-07-16');
  assert.equal(f.vencimiento, '2026-08-15');
  const html = facturaHtml(f);
  assert.match(html, /Netflix Premium/);
  assert.match(html, /5\.99 USD/);
  assert.match(html, /2026-08-15/);
});

/* ── 3) enviarFactura → asunto con número de factura ── */
await t('enviarFactura → asunto con el número de factura', async () => {
  const { sent, transport } = fakeTransport();
  const svc = createEmailService({ transport });
  const f = construirFactura({ pagoId: 'pg1', fecha: new Date('2026-07-16T00:00:00Z'), cliente_email: 'c@c.com', servicio: 'netflix', plan: 'Netflix Premium', monto: '5.99', moneda: 'USD', vencimiento: new Date('2026-08-15T00:00:00Z') });
  await svc.enviarFactura('c@c.com', f);
  assert.match(sent[0]!.subject, new RegExp(f.numero));
});

/* ── 4) Sin SMTP configurado → degrada (devuelve null, no lanza) ── */
await t('sin transporte SMTP → enviarBienvenida devuelve null', async () => {
  const svc = createEmailService({ transport: undefined });
  // En el entorno de test SMTP_HOST está vacío → realTransport() es null.
  const r = await svc.enviarBienvenida('x@y.com', null);
  assert.equal(r, null);
});

/* ── 5) facturaNumero es determinista ── */
await t('facturaNumero determinista para el mismo pago/fecha', async () => {
  const d = new Date('2026-07-16T10:00:00Z');
  assert.equal(facturaNumero('abcd1234-xyz', d), facturaNumero('abcd1234-xyz', d));
});

console.log(`\n${pass}/${total} pruebas de correo OK`);
