/**
 * Pruebas del agente sin red ni BD: cliente LLM falso (scriptado) + repos falsos.
 * Cubre el bucle agéntico y la LÓGICA DE CONTROL de entrega de credenciales.
 * Ejecutar:  npm run test:agent
 */
import assert from 'node:assert/strict';
import { createAgent, type ChatClient } from '../src/modules/agent/agent.service.js';
import {
  executeTool, verificarEstadoSuscripcion, obtenerCredencialesPerfil, consultarInventario, type ToolDeps,
} from '../src/modules/agent/tools.js';
import type { Usuario } from '../src/db/models.js';
import type { SuscripcionServicio } from '../src/db/repositories/subscriptions.repo.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const USER: Usuario = { id: 'u1', id_whatsapp: '584160000000', nombre: 'Nathan', email: null, creado_en: new Date(), actualizado_en: new Date() };
const AHORA = new Date('2026-07-15T00:00:00Z');

// Suscripción base (activa + pagada + vigente); se ajusta por prueba.
const susBase = (over: Partial<SuscripcionServicio> = {}): SuscripcionServicio => ({
  plataforma_id: 'netflix', estado: 'activa', pagada: true,
  fecha_vencimiento: new Date('2026-08-01T00:00:00Z'),
  correo: 'cuenta@nv.com', contrasena_cifrada: 'CIFRADO', perfil: 'Perfil 1', pin: '1234',
  plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD', ...over,
});

// Construye ToolDeps con defaults + overrides.
function makeDeps(over: {
  findByWhatsapp?: ToolDeps['users']['findByWhatsapp'];
  detailed?: ToolDeps['subs']['findActiveDetailedByUser'];
  forService?: ToolDeps['subs']['findForService'];
  stockAll?: ToolDeps['accounts']['countAvailableByPlatform'];
  stockFor?: ToolDeps['accounts']['countAvailableFor'];
  decrypt?: ToolDeps['decrypt'];
} = {}): ToolDeps {
  return {
    users: { findByWhatsapp: over.findByWhatsapp ?? (async () => USER) },
    subs: {
      findActiveDetailedByUser: over.detailed ?? (async () => []),
      findForService: over.forService ?? (async () => null),
    },
    accounts: {
      countAvailableByPlatform: over.stockAll ?? (async () => [{ plataforma_id: 'netflix', disponibles: 3 }, { plataforma_id: 'disney', disponibles: 0 }]),
      countAvailableFor: over.stockFor ?? (async (p) => (p === 'netflix' ? 3 : 0)),
    },
    decrypt: over.decrypt ?? ((s) => (s === 'CIFRADO' ? 'clave-secreta' : null)),
    now: () => AHORA,
  };
}

function fakeClient(script: unknown[]): ChatClient {
  let i = 0;
  return { chat: { completions: { create: async () => ({ choices: [{ message: script[i++] }] }) as never } } };
}

/* ── 1) Bucle agéntico: tool_call → backend ejecuta → texto final ── */
await t('bucle: tool_call → ejecuta backend → respuesta final', async () => {
  let llamada = false;
  const deps = makeDeps({ detailed: async () => { llamada = true; return [
    { plataforma_id: 'netflix', estado: 'activa', fecha_vencimiento: new Date('2026-08-01'), renovacion_automatica: false, dias_restantes: 10, plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD' },
  ]; } });
  const client = fakeClient([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'verificarEstadoSuscripcion', arguments: '{}' } }] },
    { role: 'assistant', content: 'Tu Netflix Premium está activo y vence en 10 días.' },
  ]);
  const out = await createAgent({ client, deps, model: 'test' }).responder('¿cómo va mi suscripción?', { whatsappId: '584160000000' });
  assert.equal(llamada, true);
  assert.match(out, /10 días/);
});

/* ── 2) ACTIVA + PAGADA + VIGENTE → expone credenciales ── */
await t('activa + pagada + vigente → expone correo, contraseña y perfil', async () => {
  const deps = makeDeps({ forService: async () => susBase() });
  const r = (await obtenerCredencialesPerfil('584160000000', 'Netflix', deps)) as Record<string, unknown>;
  assert.equal(r['encontrado'], true);
  assert.equal(r['correo'], 'cuenta@nv.com');
  assert.equal(r['contrasena'], 'clave-secreta');
  assert.equal(r['perfil'], 'Perfil 1');
});

/* ── 3) VENCIDA → bloquea entrega y guía al pago (sin filtrar credenciales) ── */
await t('vencida → entrega_bloqueada + guiar_al_pago, sin credenciales', async () => {
  const deps = makeDeps({ forService: async () => susBase({ estado: 'vencida', fecha_vencimiento: new Date('2026-07-01T00:00:00Z') }) });
  const r = (await obtenerCredencialesPerfil('584160000000', 'Netflix', deps)) as Record<string, unknown>;
  assert.equal(r['encontrado'], false);
  assert.equal(r['entrega_bloqueada'], true);
  assert.equal(r['motivo'], 'suscripcion_vencida');
  assert.equal(r['accion_sugerida'], 'guiar_al_pago');
  assert.equal(r['precio'], '5.99');            // dato de BD para guiar al pago
  assert.ok(!('contrasena' in r) && !('correo' in r), 'NO debe exponer credenciales');
});

/* ── 4) Vigente pero PAGO PENDIENTE → bloquea igual ── */
await t('pago pendiente (no pagada) → entrega_bloqueada + guiar_al_pago', async () => {
  const deps = makeDeps({ forService: async () => susBase({ pagada: false }) });
  const r = (await obtenerCredencialesPerfil('584160000000', 'Netflix', deps)) as Record<string, unknown>;
  assert.equal(r['encontrado'], false);
  assert.equal(r['motivo'], 'pago_pendiente');
  assert.equal(r['accion_sugerida'], 'guiar_al_pago');
  assert.ok(!('contrasena' in r));
});

/* ── 5) Sin suscripción → no inventar, ofrecer compra ── */
await t('sin suscripción → encontrado:false, ofrecer_compra', async () => {
  const deps = makeDeps({ forService: async () => null });
  const r = (await executeTool('obtenerCredencialesPerfil', { servicio: 'Netflix' }, { whatsappId: '584160000000' }, deps)) as Record<string, unknown>;
  assert.equal(r['encontrado'], false);
  assert.equal(r['motivo'], 'sin_suscripcion');
  assert.equal(r['accion_sugerida'], 'ofrecer_compra');
  assert.ok(!('contrasena' in r));
});

/* ── 6) Seguridad: el whatsappId del contexto se impone sobre el del modelo ── */
await t('inyección de whatsappId: usa ctx, ignora el del modelo', async () => {
  let visto = '';
  const deps = makeDeps({ findByWhatsapp: async (id) => { visto = id; return USER; } });
  await executeTool('obtenerCredencialesPerfil', { servicio: 'Netflix', whatsappId: '000ATACANTE' }, { whatsappId: '584160000000' }, deps);
  assert.equal(visto, '584160000000');
});

/* ── 7) verificarEstadoSuscripcion sin suscripciones ── */
await t('estado sin suscripciones → encontrado:false, lista vacía', async () => {
  const deps = makeDeps({ detailed: async () => [] });
  const r = (await verificarEstadoSuscripcion('584160000000', deps)) as { encontrado: boolean; suscripciones: unknown[] };
  assert.equal(r.encontrado, false);
  assert.deepEqual(r.suscripciones, []);
});

/* ── 8) Inventario: stock de un servicio concreto ── */
await t('consultarInventario(servicio) → disponibles + hay_stock', async () => {
  const deps = makeDeps({ stockFor: async (p) => (p === 'netflix' ? 4 : 0) });
  const r = (await consultarInventario('Netflix', deps)) as { ok: boolean; servicio: string; disponibles: number; hay_stock: boolean };
  assert.equal(r.ok, true);
  assert.equal(r.servicio, 'netflix');
  assert.equal(r.disponibles, 4);
  assert.equal(r.hay_stock, true);
});

/* ── 9) Inventario completo (todas las plataformas) ── */
await t('consultarInventario() → inventario completo con total', async () => {
  const deps = makeDeps({ stockAll: async () => [{ plataforma_id: 'netflix', disponibles: 3 }, { plataforma_id: 'disney', disponibles: 2 }] });
  const r = (await executeTool('consultarInventario', {}, { whatsappId: '584160000000' }, deps)) as { inventario: unknown[]; total_disponibles: number };
  assert.equal(r.total_disponibles, 5);
  assert.equal(r.inventario.length, 2);
});

/* ── 10) verificarEstadoSuscripcion expone el perfil asignado ── */
await t('verificarEstadoSuscripcion incluye el perfil privado', async () => {
  const deps = makeDeps({ detailed: async () => [
    { plataforma_id: 'netflix', estado: 'activa', pagada: true, fecha_vencimiento: new Date('2026-08-01'), renovacion_automatica: false, dias_restantes: 12, perfil: 'Perfil 3', plan_nombre: 'Netflix Premium', plan_precio: '5.99', plan_moneda: 'USD' },
  ] });
  const r = (await verificarEstadoSuscripcion('584160000000', deps)) as { encontrado: boolean; suscripciones: { perfil: string }[] };
  assert.equal(r.encontrado, true);
  assert.equal(r.suscripciones[0]!.perfil, 'Perfil 3');
});

console.log(`\n${pass}/${total} pruebas del agente OK`);
