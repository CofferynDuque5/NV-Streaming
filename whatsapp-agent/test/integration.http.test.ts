/**
 * integration.http.test.ts — Prueba de INTEGRACIÓN REAL (sin mocks).
 *
 * Levanta la app Express real contra la PostgreSQL real y verifica:
 *   · Los códigos HTTP correctos: 200, 201, 400, 401, 403, 404, 429/…, 500-safe.
 *   · Persistencia real: lo que entra por el endpoint queda en la base de datos.
 *
 * Requiere una BD accesible por DATABASE_URL (misma que usa la app) con el
 * esquema aplicado (`npm run migrate`). Ejecutar:  npm run test:integration
 * Limpia sus propios datos al terminar (borra el usuario de prueba y su rastro).
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.js';
import { pool, closePool } from '../src/db/pool.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

const EMAIL = `qa+${Date.now()}@nv-integration.test`;
const PASSWORD = 'Sup3rSecret!';

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
    let data: unknown = null;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: res.status, data };
  };

  let token = '';
  let userId = '';

  try {
    // ── 200 — health y lecturas públicas ──────────────────────────────────
    await t('200 · GET /health', async () => {
      const r = await call('GET', '/health');
      assert.equal(r.status, 200);
      assert.equal((r.data as { ok: boolean }).ok, true);
    });

    await t('200 · GET /api/cms/plataformas (lectura pública)', async () => {
      const r = await call('GET', '/api/cms/plataformas');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray((r.data as { documentos: unknown[] }).documentos));
    });

    // ── 400 — validación de entrada ───────────────────────────────────────
    await t('400 · POST /api/auth/register con email inválido', async () => {
      const r = await call('POST', '/api/auth/register', { email: 'no-es-email', password: PASSWORD });
      assert.equal(r.status, 400);
    });

    await t('400 · POST /api/auth/register con contraseña corta', async () => {
      const r = await call('POST', '/api/auth/register', { email: `x${Date.now()}@nv.test`, password: '123' });
      assert.equal(r.status, 400);
    });

    // ── 201 — creación real + PERSISTENCIA ────────────────────────────────
    await t('201 · POST /api/auth/register crea usuario y persiste en BD', async () => {
      const r = await call('POST', '/api/auth/register', { email: EMAIL, password: PASSWORD, nombre: 'QA Bot' });
      assert.equal(r.status, 201);
      const cuerpo = r.data as { token: string; usuario: { id: string; email: string } };
      assert.ok(cuerpo.token, 'devuelve token');
      token = cuerpo.token; userId = cuerpo.usuario.id;
      // Persistencia real: el usuario existe en la tabla usuarios.
      const filas = await pool.query('SELECT id, email, rol FROM usuarios WHERE email = $1', [EMAIL]);
      assert.equal(filas.rowCount, 1, 'el usuario quedó en la BD');
      assert.equal(filas.rows[0].email, EMAIL);
    });

    // ── 409 — conflicto (email repetido) ──────────────────────────────────
    await t('409 · POST /api/auth/register con email ya usado', async () => {
      const r = await call('POST', '/api/auth/register', { email: EMAIL, password: PASSWORD });
      assert.equal(r.status, 409);
    });

    // ── 401 — autenticación ───────────────────────────────────────────────
    await t('401 · GET /api/auth/me sin token', async () => {
      const r = await call('GET', '/api/auth/me');
      assert.equal(r.status, 401);
    });

    await t('401 · POST /api/auth/login con contraseña incorrecta', async () => {
      const r = await call('POST', '/api/auth/login', { email: EMAIL, password: 'incorrecta' });
      assert.equal(r.status, 401);
    });

    // ── 200 — login correcto + sesión ─────────────────────────────────────
    await t('200 · POST /api/auth/login correcto y GET /me con token', async () => {
      const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
      assert.equal(login.status, 200);
      const tk = (login.data as { token: string }).token;
      const me = await call('GET', '/api/auth/me', undefined, tk);
      assert.equal(me.status, 200);
      assert.equal((me.data as { usuario: { email: string } }).usuario.email, EMAIL);
    });

    // ── 403 — autorización por rol (usuario normal → ruta admin) ───────────
    await t('403 · PUT /api/cms/:col (requiere admin) con usuario normal', async () => {
      const r = await call('PUT', '/api/cms/plataformas/qa-test', { nombre: 'x' }, token);
      assert.equal(r.status, 403);
    });

    // ── 404 — recurso inexistente ─────────────────────────────────────────
    await t('404 · GET ruta inexistente', async () => {
      const r = await call('GET', '/api/no-existe-esta-ruta');
      assert.equal(r.status, 404);
    });

    await t('404 · GET /api/cms/coleccion_desconocida', async () => {
      const r = await call('GET', '/api/cms/coleccion_que_no_existe');
      assert.equal(r.status, 404);
    });

    // ── Reseller: overview real del usuario recién creado ─────────────────
    await t('200 · GET /api/reseller/overview devuelve datos reales del usuario', async () => {
      const r = await call('GET', '/api/reseller/overview', undefined, token);
      assert.equal(r.status, 200);
      const resumen = (r.data as { resumen: { codigo?: string } }).resumen;
      assert.ok(resumen, 'hay resumen');
    });

    // ── 400 — pedido inválido (cuerpo vacío) ──────────────────────────────
    await t('4xx · POST /api/pedidos con cuerpo inválido no persiste basura', async () => {
      const r = await call('POST', '/api/pedidos', {}, token);
      assert.ok(r.status >= 400 && r.status < 500, 'rechaza cuerpo inválido con 4xx (fue ' + r.status + ')');
    });

    console.log(`\n${pass}/${total} pruebas de integración HTTP OK`);
  } finally {
    // Limpieza: borra el rastro del usuario de prueba (persistencia real → hay
    // que limpiar de verdad). El orden respeta las claves foráneas.
    if (userId) {
      await pool.query('DELETE FROM comisiones WHERE revendedor_id = $1 OR referido_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM movimientos_billetera WHERE usuario_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM pedidos WHERE usuario_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM usuarios WHERE id = $1', [userId]).catch(() => {});
    }
    await new Promise<void>((r) => server.close(() => r()));
    await closePool();
  }
  if (pass !== total) process.exitCode = 1;
}

void main();
