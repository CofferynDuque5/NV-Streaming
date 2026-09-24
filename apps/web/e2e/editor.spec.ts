import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo } from './ayudas';

// Proyecto «editor» (ver playwright.config.ts): corre después de roles.spec.ts, que deja
// configurada la verificación en dos pasos de administración.
test.describe.configure({ mode: 'serial' });

const ORIGINAL = 'Tu streaming, en regla y sin complicaciones.';
const NUEVO = 'Streaming autorizado, ahora editado desde el panel';

async function abrirPortada(page: Page) {
  await page.goto('/admin/sitio');
  await page.getByRole('link', { name: 'Editar NV Streaming (/)' }).click();
  await expect(page.getByRole('heading', { name: /Editar «NV Streaming»/ })).toBeVisible();
  await page.getByRole('button', { name: /^1 Portada/ }).click();
}

async function publicar(page: Page, nota: string) {
  await page.getByRole('button', { name: 'Publicar…' }).click();
  await page.getByLabel('Nota de la versión (opcional)').fill(nota);
  await page.getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText(/Publicada la versión \d+/)).toBeVisible();
}

test('administración edita la portada, la ve en la vista previa y la publica', async ({ page }) => {
  await entrarEquipo(page, 'admin@nv.test');
  await page.waitForURL(/\/admin$/);
  await abrirPortada(page);

  const vista = page.getByRole('region', { name: 'Vista previa' });
  await expect(vista.getByRole('heading', { name: ORIGINAL })).toBeVisible();

  await page.getByLabel('Título', { exact: true }).fill(NUEVO);
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await expect(vista.getByRole('heading', { name: NUEVO })).toBeVisible();

  // Anchos de la vista previa.
  await vista.getByRole('button', { name: 'Móvil' }).click();
  await expect(vista.getByRole('button', { name: 'Móvil' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await publicar(page, 'Prueba del editor');
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NUEVO);
  await expect(page).toHaveTitle('NV Streaming');

  // Vuelve a la versión original para no afectar a otras pruebas.
  await abrirPortada(page);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Versión 1' })
    .getByRole('button', { name: 'Copiar al borrador' })
    .click();
  await expect(page.getByText('La versión 1 está ahora en el borrador')).toBeVisible();
  await expect(vista.getByRole('heading', { name: ORIGINAL })).toBeVisible();
  await publicar(page, 'Portada original');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('en regla');
});
