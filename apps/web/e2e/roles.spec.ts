import { expect, test } from '@playwright/test';
import { generate } from 'otplib';
import { configurarDosPasos, ingresar } from './ayudas';

test('administración: 2FA obligatoria, equipo, auditoría y nuevo ingreso con código', async ({
  page,
}) => {
  await ingresar(page, 'admin@nv.test');
  const secreto = await configurarDosPasos(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: /Hola, Administración/ })).toBeVisible();
  await expect(page.getByText('Aún no hay datos que medir')).toBeVisible();

  await page.getByRole('link', { name: 'Equipo y usuarios' }).first().click();
  for (const rol of ['admin', 'operador', 'ventas', 'revendedor', 'cliente']) {
    await expect(page.getByRole('row').filter({ hasText: `${rol}@nv.test` })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Invitar persona' })).toBeVisible();

  await page.getByRole('link', { name: 'Auditoría' }).first().click();
  await expect(page.getByText('Verificación en dos pasos activada').first()).toBeVisible();

  // Cerrar sesión y volver a entrar: ahora pide el código.
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page).toHaveURL(/\/ingresar/);
  await ingresar(page, 'admin@nv.test');
  await expect(page).toHaveURL(/\/verificacion-2fa/);
  await page
    .getByLabel('Código de 6 dígitos')
    .fill(await generate({ secret: secreto, epoch: Math.floor(Date.now() / 1000) + 30 }));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('operador: ve el equipo pero no puede invitar ni ver la auditoría', async ({ page }) => {
  await ingresar(page, 'operador@nv.test');
  await configurarDosPasos(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Equipo y usuarios' }).first().click();
  await expect(page.getByRole('heading', { name: 'Equipo y usuarios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invitar persona' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
  await page.goto('/admin/auditoria');
  await expect(page).toHaveURL(/\/admin$/);
});

test('ventas: panel de administración sin gestión de usuarios', async ({ page }) => {
  await ingresar(page, 'ventas@nv.test');
  await configurarDosPasos(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'Equipo y usuarios' })).toHaveCount(0);
});

test('revendedor: 2FA obligatoria y su propio panel', async ({ page }) => {
  await ingresar(page, 'revendedor@nv.test');
  await configurarDosPasos(page);
  await expect(page).toHaveURL(/\/revendedor$/);
  await expect(page.getByText('Sin saldo todavía')).toBeVisible();
  await expect(page.getByText('Panel de revendedor').first()).toBeVisible();
});
