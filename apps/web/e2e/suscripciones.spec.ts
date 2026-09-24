import { expect, test } from '@playwright/test';
import { entrarEquipo, ingresar } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de pago. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Se ejecuta después de roles.spec.ts: el equipo ya tiene la verificación en dos pasos.
test.describe.configure({ mode: 'serial' });

test('la página pública muestra los planes en la moneda elegida', async ({ page }) => {
  await page.goto('/planes?moneda=VES');
  await expect(page.getByRole('heading', { name: 'NV Cine' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'VES' })).toHaveAttribute('aria-current', 'true');
  // 5,99 USD × 150 = 898,50 Bs (tasa de demostración de la semilla).
  await expect(page.getByText(/898,50/).first()).toBeVisible();
});

test('el cliente contrata un plan, paga en bolívares y el equipo concilia el pago', async ({
  page,
}) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole('heading', { name: 'Mensual' })).toBeVisible();

  await page.goto('/cuenta/planes?moneda=VES');
  const plan = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Individual' }),
  });
  await plan.getByRole('button', { name: 'Contratar' }).click();
  await plan.getByRole('button', { name: 'Confirmar y ver cómo pagar' }).click();

  await expect(page).toHaveURL(/\/cuenta\/facturas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /^Factura NV-/ })).toBeVisible();
  await expect(page.getByText('Datos para pagar con Pago Móvil')).toBeVisible();
  await page.getByLabel('Número de referencia').fill('00123456');
  await page.locator('input[type=file]').setInputFiles({
    name: 'pago.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(page.getByText('Recibimos tu comprobante')).toBeVisible();
  const numero = (await page.getByRole('heading', { name: /^Factura NV-/ }).innerText()).replace(
    'Factura ',
    '',
  );

  await page.goto('/cuenta');
  await expect(page.getByText('Estamos revisando tu pago')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();

  // Conciliación: el operador confirma el pago y el servicio queda activo.
  await entrarEquipo(page, 'operador@nv.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Cobros' }).first().click();
  await page.goto('/admin/cobros?vista=conciliar');
  const pago = page.getByRole('listitem').filter({ hasText: numero });
  await expect(pago.getByText('00123456')).toBeVisible();
  await pago.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await pago.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('No hay pagos pendientes de revisar')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await ingresar(page, 'cliente@nv.test');
  const servicio = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'Individual' }),
    })
    .last();
  await expect(servicio.getByText('Activa')).toBeVisible();
  await page.goto('/cuenta/facturas');
  await expect(page.getByRole('row').filter({ hasText: numero })).toContainText('Pagada');
});
