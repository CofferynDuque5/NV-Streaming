/**
 * superbackend.smoke.test.ts — Verifica el núcleo HTTP del "Super Backend"
 * SIN base de datos: rate limiting (429), caché TTL (memoize + invalidación),
 * y mapeo central de errores (AppError → statusCode + cuerpo). Ejecutar:
 *   npx tsx test/superbackend.smoke.test.ts
 */
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { rateLimit } from '../src/core/rate-limit.js';
import { CacheTTL } from '../src/core/cache.js';
import { errorHandler } from '../src/core/error-handler.js';
import { AppError, TooManyRequestsError } from '../src/core/errors.js';

let pass = 0, total = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  total++;
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + (e as Error).message); process.exitCode = 1; }
};

// --- Dobles mínimos de Express req/res -------------------------------------
function fakeReq(path = '/api/x', ip = '1.2.3.4'): Request {
  return { path, ip, socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
}
function fakeRes(): { res: Response; captura: { status?: number; body?: unknown; headers: Record<string, string> } } {
  const captura: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    headersSent: false,
    setHeader(n: string, v: string) { captura.headers[n.toLowerCase()] = v; },
    status(c: number) { captura.status = c; return this; },
    json(b: unknown) { captura.body = b; (this as { headersSent: boolean }).headersSent = true; return this; },
  } as unknown as Response;
  return { res, captura };
}

async function main(): Promise<void> {
  // --- Rate limiting: la petición nº (max+1) se corta con 429 ---------------
  await t('rateLimit: bloquea con 429 tras superar el máximo', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3 });
    const errores: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const { res } = fakeRes();
      mw(fakeReq('/api/login', '9.9.9.9'), res, (err?: unknown) => { if (err) errores.push(err); });
    }
    assert.equal(errores.length, 1, 'solo la 4ª debe fallar');
    assert.ok(errores[0] instanceof TooManyRequestsError);
    assert.equal((errores[0] as TooManyRequestsError).statusCode, 429);
  });

  await t('rateLimit: claves por IP son independientes', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 });
    let fallos = 0;
    for (const ip of ['10.0.0.1', '10.0.0.2']) {
      const { res } = fakeRes();
      mw(fakeReq('/api/otra', ip), res, (err?: unknown) => { if (err) fallos++; });
    }
    assert.equal(fallos, 0, 'IPs distintas no deben interferir');
  });

  // --- Caché TTL: memoiza y respeta invalidación ----------------------------
  await t('CacheTTL: obtenerO calcula una vez (cache hit)', async () => {
    const cache = new CacheTTL(1000);
    let cargas = 0;
    const cargar = async () => { cargas++; return { n: 42 }; };
    const a = await cache.obtenerO('k', cargar);
    const b = await cache.obtenerO('k', cargar);
    assert.equal(cargas, 1, 'la segunda lectura sale de caché');
    assert.deepEqual(a, b);
  });

  await t('CacheTTL: invalidar por prefijo fuerza recarga', async () => {
    const cache = new CacheTTL(1000);
    let cargas = 0;
    const cargar = async () => { cargas++; return cargas; };
    await cache.obtenerO('cms:list:ofertas', cargar);
    cache.invalidar('cms:list:ofertas');
    await cache.obtenerO('cms:list:ofertas', cargar);
    assert.equal(cargas, 2, 'tras invalidar debe recalcular');
  });

  await t('CacheTTL: expira por TTL', async () => {
    const cache = new CacheTTL(10);
    let cargas = 0;
    const cargar = async () => { cargas++; return cargas; };
    await cache.obtenerO('k', cargar);
    await new Promise((r) => setTimeout(r, 20));
    await cache.obtenerO('k', cargar);
    assert.equal(cargas, 2, 'tras expirar el TTL debe recalcular');
  });

  // --- Error handler central: AppError → status + cuerpo --------------------
  await t('errorHandler: AppError conserva statusCode y cuerpo', () => {
    const { res, captura } = fakeRes();
    const err = new AppError({ code: 'email_en_uso', message: 'Ese correo ya está registrado.', statusCode: 409 });
    errorHandler(err, fakeReq(), res, () => {});
    assert.equal(captura.status, 409);
    assert.deepEqual(captura.body, { error: 'email_en_uso', mensaje: 'Ese correo ya está registrado.' });
  });

  await t('errorHandler: error desconocido → 500 genérico (no filtra)', () => {
    const { res, captura } = fakeRes();
    errorHandler(new Error('detalle interno secreto'), fakeReq(), res, () => {});
    assert.equal(captura.status, 500);
    const body = captura.body as { error: string; mensaje: string };
    assert.equal(body.error, 'error_interno');
    assert.ok(!JSON.stringify(body).includes('secreto'), 'no debe filtrar el detalle interno');
  });

  console.log(`\n${pass}/${total} pruebas de Super Backend OK`);
  if (pass !== total) process.exitCode = 1;
}

void main();
