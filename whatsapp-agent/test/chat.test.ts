/**
 * Pruebas del enrutador de intenciones (MessageHandler) SIN red ni BD:
 * repositorios falsos inyectados. Verifica que cada intención dispara la
 * consulta/mutación real correcta y responde con datos, no strings quemados.
 * Ejecutar:  npm run test:chat
 */
import assert from 'node:assert/strict';
import { MessageHandler, normalizar } from '../src/modules/chat/message-handler.js';
import type { Usuario } from '../src/db/models.js';
import type { SuscripcionDetallada, SuscripcionServicio } from '../src/db/repositories/subscriptions.repo.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const USER: Usuario = { id: 'u1', id_whatsapp: '584160000000', nombre: 'Rouse Duque', email: 'r@x.com', creado_en: new Date(), actualizado_en: new Date() };
// Fecha de vencimiento RELATIVA (12 días en el futuro): así la prueba no caduca
// con el paso del tiempo. Antes era una fecha fija ('2026-08-01') que "vencía"
// y hacía fallar el caso de soporte una vez pasado ese día.
const EN_12_DIAS = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
const subDet = (o: Partial<SuscripcionDetallada> = {}): SuscripcionDetallada => ({
  plataforma_id: 'netflix', estado: 'activa', pagada: true, fecha_vencimiento: EN_12_DIAS,
  renovacion_automatica: false, dias_restantes: 12, perfil: 'Perfil 1', plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD', ...o,
});
const subServ = (o: Partial<SuscripcionServicio> = {}): SuscripcionServicio => ({
  id: 's1', plataforma_id: 'netflix', estado: 'activa', pagada: true, fecha_vencimiento: EN_12_DIAS,
  correo: 'c@nv.com', contrasena_cifrada: 'X', perfil: 'Perfil 1', pin: '1234', plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD', ...o,
});

// Fábrica de handler con repos falsos y espías de llamadas.
function crear(over: any = {}) {
  const llamadas: any = { renovar: null };
  const deps: any = {
    users: { findByWhatsapp: async (id: string) => (over.user === null ? null : (over.user ?? USER)), upsertByWhatsapp: async () => USER },
    subs: {
      findActiveDetailedByUser: async () => over.subs ?? [subDet()],
      findForService: async (_u: string, p: string) => (over.sub === null ? null : (over.sub ?? subServ({ plataforma_id: p }))),
      renovar: async (id: string, dias: number) => { llamadas.renovar = { id, dias }; return new Date('2026-09-01'); },
    },
    accounts: { countAvailableFor: async () => over.stock ?? 5 },
    plans: { allActive: async () => over.plans ?? [{ plataforma_id: 'netflix', nombre: 'Netflix Premium', precio: '5.99', moneda: 'USD' }] },
  };
  return { h: new MessageHandler(deps), llamadas };
}

console.log('\n== MessageHandler (enrutador de intenciones · datos reales) ==');

await t('normalizar: minúsculas y sin acentos', () => {
  assert.equal(normalizar('  NO PUEDO Entrar a NETFLIX  '), 'no puedo entrar a netflix');
  assert.equal(normalizar('Renovación'), 'renovacion');
});

await t('saludo → intent saludo con menú', async () => {
  const { h } = crear();
  const r = await h.procesar({ message: 'hola', userId: '584160000000' });
  assert.equal(r.intent, 'saludo');
  assert.ok((r.reply.actions || []).length >= 3);
});

await t('/saldo con usuario → lista suscripciones reales', async () => {
  const { h } = crear({ subs: [subDet(), subDet({ plataforma_id: 'spotify', plan_nombre: 'Spotify', dias_restantes: 3 })] });
  const r = await h.procesar({ message: '/saldo', userId: '584160000000' });
  assert.equal(r.intent, 'saldo');
  assert.ok(r.reply.text.includes('Netflix Premium') && r.reply.text.includes('Spotify'));
  assert.equal((r.datos as unknown[]).length, 2);
});

await t('/saldo sin usuario → estado guest (no inventa)', async () => {
  const { h } = crear({ user: null });
  const r = await h.procesar({ message: 'mi saldo', userId: 'guest_123' });
  assert.equal(r.intent, 'saldo');
  assert.ok(/no encuentro/i.test(r.reply.text));
});

await t('soporte "no puedo entrar a netflix" → tarjeta de servicio real', async () => {
  const { h } = crear();
  const r = await h.procesar({ message: 'no puedo entrar a netflix', userId: '584160000000' });
  assert.equal(r.intent, 'soporte');
  assert.equal((r.reply.card as any).titulo, 'Netflix Premium');
  assert.ok((r.reply.actions || []).some((a) => a.comando.includes('/codigo')));
});

await t('soporte sin plataforma → pide aclarar', async () => {
  const { h } = crear();
  const r = await h.procesar({ message: 'tengo un problema', userId: '584160000000' });
  assert.equal(r.intent, 'soporte');
  assert.ok(/con qué servicio/i.test(r.reply.text));
});

await t('/renovar netflix → MUTACIÓN real (renovar por id) + nueva fecha', async () => {
  const { h, llamadas } = crear();
  const r = await h.procesar({ message: '/renovar netflix', userId: '584160000000' });
  assert.equal(r.intent, 'renovar');
  assert.deepEqual(llamadas.renovar, { id: 's1', dias: 30 });     // llamó a subs.renovar con el id real
  assert.ok(/Renovación aplicada/i.test(r.reply.text));
});

await t('/catalogo → precios reales desde planes', async () => {
  const { h } = crear();
  const r = await h.procesar({ message: '/catalogo', userId: null });
  assert.equal(r.intent, 'catalogo');
  assert.ok(r.reply.text.includes('5.99'));
});

await t('texto sin intención → fallback a ayuda (nunca respuesta inventada)', async () => {
  const { h } = crear();
  const r = await h.procesar({ message: 'asdf qwer', userId: null });
  assert.equal(r.intent, 'ayuda');
});

console.log(`\n${pass}/${total} pruebas de chat OK`);
