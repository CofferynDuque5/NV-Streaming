import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { generate } from 'otplib';

/** Secretos TOTP que crean las pruebas, para volver a entrar en otra prueba. Se borra al preparar. */
export const ARCHIVO_SECRETOS = 'test-results/secretos-2fa.json';

function leerSecretos(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(ARCHIVO_SECRETOS, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export const CONTRASENA_DEMO = 'NvDemo-2026!';

export async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_DEMO);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Recorre la configuración obligatoria de la verificación en dos pasos. */
export async function configurarDosPasos(page: Page, correo?: string) {
  await expect(page).toHaveURL(/\/configurar-2fa/);
  await page.getByRole('button', { name: 'Generar código QR' }).click();
  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  await page.getByText('¿No puedes escanearlo?').click();
  const secreto = (await page.locator('details code').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de 6 dígitos').fill(await generate({ secret: secreto }));
  await page.getByRole('button', { name: 'Activar verificación' }).click();
  await expect(page.getByText('Verificación en dos pasos activada')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Códigos de respaldo' }).getByRole('listitem'),
  ).toHaveCount(10);
  await page.getByLabel('Ya guardé mis códigos de respaldo').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (correo) {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(ARCHIVO_SECRETOS, JSON.stringify({ ...leerSecretos(), [correo]: secreto }));
  }
  return secreto;
}

/**
 * Entra con una persona del equipo: configura la verificación en dos pasos si
 * es la primera vez o usa el secreto guardado por una prueba anterior (con el
 * código del periodo siguiente, para no repetir uno ya usado).
 */
export async function entrarEquipo(page: Page, correo: string) {
  await ingresar(page, correo);
  await page.waitForURL(/\/(configurar-2fa|verificacion-2fa|admin|revendedor)/);
  if (page.url().includes('/configurar-2fa')) {
    await configurarDosPasos(page, correo);
  } else if (page.url().includes('/verificacion-2fa')) {
    const secreto = leerSecretos()[correo];
    if (!secreto) throw new Error(`No hay secreto 2FA guardado para ${correo}.`);
    await page
      .getByLabel('Código de 6 dígitos')
      .fill(await generate({ secret: secreto, epoch: Math.floor(Date.now() / 1000) + 30 }));
    await page.getByRole('button', { name: 'Verificar' }).click();
  }
}
