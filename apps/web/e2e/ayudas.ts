import { expect, type Page } from '@playwright/test';
import { generate } from 'otplib';

export const CONTRASENA_DEMO = 'NvDemo-2026!';

export async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_DEMO);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Recorre la configuración obligatoria de la verificación en dos pasos. */
export async function configurarDosPasos(page: Page) {
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
  return secreto;
}
