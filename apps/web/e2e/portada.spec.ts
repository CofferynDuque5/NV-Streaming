import { expect, test } from '@playwright/test';

test('la portada presenta NV sin datos inventados y lleva al registro', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('NV Streaming');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('en regla');
  await expect(page.getByText(/Netflix|Disney|HBO|Spotify/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Crear mi cuenta' }).first().click();
  await expect(page).toHaveURL(/\/registro$/);
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
});

test('el registro valida en español y confirma el envío del correo', async ({ page }) => {
  await page.goto('/registro');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
  await page.getByLabel('Nombre').fill('Persona de Prueba');
  await page.getByLabel('Correo').fill(`e2e-${Date.now()}@nv.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill('Una frase larga y segura');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
});

test('un panel sin sesión lleva a ingresar y recuerda la página', async ({ page }) => {
  await page.goto('/admin/equipo');
  await expect(page).toHaveURL(/\/ingresar\?siguiente=%2Fadmin%2Fequipo/);
});
