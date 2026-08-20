/**
 * Pruebas del envío por WhatsApp Cloud API con un `fetch` falso (sin red).
 * Ejecutar:  npm run test:whatsapp
 */
import assert from 'node:assert/strict';
import { createWhatsAppSender } from '../src/services/whatsapp.service.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

await t('sendText arma la petición correcta y devuelve el message id', async () => {
  let captured: { url: string; init: { method: string; headers: Record<string, string>; body: string } } | null = null;
  const fakeFetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    captured = { url, init };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.OUT1' }] }), text: async () => '' };
  };
  const sender = createWhatsAppSender({ fetchImpl: fakeFetch as never, token: 'TOK', phoneNumberId: '123', apiVersion: 'v21.0' });
  const res = await sender.sendText('584160000000', 'Hola 👋');

  assert.equal(res?.id, 'wamid.OUT1');
  assert.ok(captured, 'debió llamarse a fetch');
  assert.equal(captured!.url, 'https://graph.facebook.com/v21.0/123/messages');
  assert.equal(captured!.init.method, 'POST');
  assert.equal(captured!.init.headers['Authorization'], 'Bearer TOK');
  const body = JSON.parse(captured!.init.body) as { to: string; type: string; text: { body: string } };
  assert.equal(body.to, '584160000000');
  assert.equal(body.type, 'text');
  assert.equal(body.text.body, 'Hola 👋');
});

await t('sin token configurado → no envía y devuelve null (modo degradado)', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; };
  const sender = createWhatsAppSender({ fetchImpl: fakeFetch as never, token: '', phoneNumberId: '' });
  const res = await sender.sendText('584160000000', 'x');
  assert.equal(res, null);
  assert.equal(called, false, 'no debe llamar a la API sin credenciales');
});

await t('respuesta de error de la API → devuelve null', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'invalid token' });
  const sender = createWhatsAppSender({ fetchImpl: fakeFetch as never, token: 'BAD', phoneNumberId: '123' });
  assert.equal(await sender.sendText('584160000000', 'x'), null);
});

await t('sendTemplate arma el payload de plantilla con parámetros de body', async () => {
  let captured: { url: string; body: string } | null = null;
  const fakeFetch = async (url: string, init: { body: string }) => {
    captured = { url, body: init.body };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.TPL1' }] }), text: async () => '' };
  };
  const sender = createWhatsAppSender({ fetchImpl: fakeFetch as never, token: 'TOK', phoneNumberId: '123', apiVersion: 'v21.0' });
  const res = await sender.sendTemplate('584160000000', 'vencimiento_perfil', 'es', ['Nathan', 'Netflix Premium', 'Perfil 1', '3', '2026-07-18']);

  assert.equal(res?.id, 'wamid.TPL1');
  const body = JSON.parse(captured!.body) as {
    type: string; template: { name: string; language: { code: string }; components: { type: string; parameters: { type: string; text: string }[] }[] };
  };
  assert.equal(body.type, 'template');
  assert.equal(body.template.name, 'vencimiento_perfil');
  assert.equal(body.template.language.code, 'es');
  const params = body.template.components[0]!.parameters.map((p) => p.text);
  assert.deepEqual(params, ['Nathan', 'Netflix Premium', 'Perfil 1', '3', '2026-07-18']);
});

console.log(`\n${pass}/${total} pruebas de WhatsApp OK`);
