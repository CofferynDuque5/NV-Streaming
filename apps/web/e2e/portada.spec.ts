import { expect, test } from '@playwright/test';

test('la portada presenta NV con datos reales y lleva al catálogo', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('NV Streaming');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('en un solo portal');
  // Solo los servicios del catálogo: nada de marcas de ejemplo.
  await expect(page.getByText(/Netflix|Disney|HBO|Spotify/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Todos los servicios' })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'NV Cine' }).first()).toBeVisible();
  // Los métodos de pago son los activos del panel.
  await expect(page.getByRole('heading', { name: 'Métodos de pago' })).toBeVisible();
  await page.getByRole('link', { name: 'Explorar servicios' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo el catálogo');
});

test('el registro valida en español y confirma el envío del correo', async ({ page }) => {
  await page.goto('/registro');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
  await page.getByLabel('Nombre').fill('Persona de Prueba');
  await page.getByLabel('Correo').fill(`e2e-${Date.now()}@nv.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill('Una frase larga y segura');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
});

test('un panel sin sesión lleva a ingresar y recuerda la página', async ({ page }) => {
  await page.goto('/admin/equipo');
  await expect(page).toHaveURL(/\/ingresar\?siguiente=%2Fadmin%2Fequipo/);
});

test('la web envía su política de seguridad de contenido y las páginas la cumplen', async ({
  page,
}) => {
  // Cualquier recurso o script que la política bloquee queda anotado aquí.
  await page.addInitScript(() => {
    const w = window as unknown as { violacionesCsp: string[] };
    w.violacionesCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.violacionesCsp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const respuesta = await page.goto('/');
  const politica = respuesta?.headers()['content-security-policy'] ?? '';
  expect(politica).toContain("default-src 'self'");
  expect(politica).toContain("object-src 'none'");
  expect(politica).toContain("base-uri 'self'");
  expect(politica).toContain("frame-ancestors 'none'");
  for (const ruta of ['/', '/catalogo', '/ingresar', '/registro', '/politicas']) {
    if (ruta !== '/') await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { violacionesCsp: string[] }).violacionesCsp),
    ).toEqual([]);
  }
});
