import { readFileSync } from 'node:fs';
import { webcrypto as wc } from 'node:crypto';
import { canonicoGestor } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * «Migración a NV Streaming» del Gestor (archivo cifrado y con hashes): se verifica,
 * se abre con la frase, cuadra contra el Gestor y se importa a Plataformas.
 * El archivo de ejemplo lo generó la capa real del Gestor; aquí se le cambian los
 * correos para no chocar al reintentar y se vuelve a cifrar y firmar igual que el Gestor.
 */
test.beforeAll(() => reiniciarLimiteIngreso());

const FRASE = 'frase de prueba larga';
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('base64');
const sha = async (t: string) =>
  Buffer.from(await wc.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');

async function clave(sal: Uint8Array, iteraciones: number) {
  const base = await wc.subtle.importKey('raw', new TextEncoder().encode(FRASE), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return wc.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function migracionDePrueba(sufijo: string) {
  const ruta = new URL('../../../packages/shared/test/fixtures/migracion-v2.json', import.meta.url);
  const a = JSON.parse(readFileSync(ruta, 'utf8'));
  const s = a.manifiesto.credenciales;
  const k = await clave(Buffer.from(s.sal, 'base64'), s.iteraciones);
  const cred = JSON.parse(
    new TextDecoder().decode(
      await wc.subtle.decrypt(
        { name: 'AES-GCM', iv: Buffer.from(s.iv, 'base64') },
        k,
        Buffer.from(a.credenciales, 'base64'),
      ),
    ),
  );
  const renombrar = (u: string) => u.replace('@', `.${sufijo}@`);
  for (const c of Object.values(cred.cuentas) as { usuario?: string }[])
    if (c.usuario) c.usuario = renombrar(c.usuario);
  for (const c of Object.values(cred.perfiles) as { usuario?: string }[])
    if (c.usuario) c.usuario = renombrar(c.usuario);
  const iv = wc.getRandomValues(new Uint8Array(12));
  a.credenciales = b64(
    await wc.subtle.encrypt(
      { name: 'AES-GCM', iv },
      k,
      new TextEncoder().encode(JSON.stringify(cred)),
    ),
  );
  s.iv = b64(iv);
  s.sha256 = await sha(a.credenciales);
  const resto = { ...a.manifiesto };
  delete resto.sha256;
  a.manifiesto.sha256 = await sha(canonicoGestor(resto));
  return Buffer.from(JSON.stringify(a));
}

test('la migración cifrada del Gestor se verifica, se abre con la frase, cuadra y se importa', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sufijo = Date.now().toString(36);
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/cuentas/gestor');

  // Un archivo modificado a mano no se acepta.
  const bueno = await migracionDePrueba(sufijo);
  const alterado = JSON.parse(bueno.toString());
  alterado.secciones.cuentas[0].costo = 999;
  // La primera subida se reintenta: en un CI lento el campo puede existir antes de que React lo active.
  await expect(async () => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'alterado.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(alterado)),
    });
    await expect(page.getByText(/dañado o fue modificado \(no cuadra: cuentas\)/)).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 30_000 });

  await page.locator('input[type=file]').setInputFiles({
    name: 'nv-migracion.json',
    mimeType: 'application/json',
    buffer: bueno,
  });
  await expect(page.getByText(/migración del Gestor verificada/)).toBeVisible();
  const frase = page.getByLabel('Frase de la migración');
  await frase.fill('esta no es la frase');
  await page.getByRole('button', { name: 'Abrir migración' }).click();
  await expect(page.getByText('La frase no es la correcta.')).toBeVisible();
  await frase.fill(FRASE);
  await page.getByRole('button', { name: 'Abrir migración' }).click();

  // Cuadre contra el Gestor: todo coincide.
  const tabla = page.getByRole('table').filter({ hasText: 'Perfiles con cliente' });
  await expect(tabla.getByRole('row')).toHaveCount(5);
  await expect(tabla.getByText('≠')).toHaveCount(0);
  await expect(tabla.getByRole('row', { name: /Cuentas 3 3 3/ })).toBeVisible();

  // Netflix (2 cuentas, 3 perfiles, 2 clientes) pasa a un servicio y se importa.
  const netflix = page.getByRole('listitem').filter({ hasText: /^Netflix/ });
  await expect(netflix).toContainText(/2 cuentas · 7 perfiles · 2 clientes/);
  const servicio = netflix.getByLabel('Pasa al servicio');
  if (!(await servicio.inputValue())) await servicio.selectOption({ index: 1 });
  const plan = netflix.getByLabel('Plan de las suscripciones');
  if (!(await plan.inputValue())) await plan.selectOption({ index: 1 });
  await netflix.getByRole('button', { name: 'Simular' }).click();
  await netflix.getByRole('button', { name: 'Importar 2 cuentas' }).click();
  await expect(netflix.getByText('Importada')).toBeVisible();
});
