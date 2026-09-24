import { expect, test } from '@playwright/test';
import { ingresar } from './ayudas';

test('el cliente entra a su cuenta y no puede abrir la administración', async ({ page }) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText('Todavía no tienes servicios')).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto('/revendedor');
  await expect(page).toHaveURL(/\/cuenta$/);
});

test('contraseña incorrecta muestra un error claro', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill('cliente@nv.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('no-es-esta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' }),
  ).toBeVisible();
});
