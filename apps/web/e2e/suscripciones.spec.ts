import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, enviarComprobante, ingresar, numeroFacturaEnPago } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de pago. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Se ejecuta después de roles.spec.ts: el equipo ya tiene la verificación en dos pasos.
test.describe.configure({ mode: 'serial' });

/** Abre el selector de moneda de la cabecera y devuelve sus opciones. */
async function menuMonedas(page: Page) {
  await page.getByRole('button', { name: /Cambiar moneda/ }).click();
  return page.getByRole('navigation', { name: 'Moneda' });
}

test('el catálogo público muestra los precios en la moneda elegida', async ({ page }) => {
  await page.goto('/catalogo?moneda=VES');
  await expect(page.getByRole('heading', { name: 'NV Cine' }).first()).toBeVisible();
  const monedas = await menuMonedas(page);
  await expect(monedas.getByRole('link', { name: /^VES/ })).toHaveAttribute('aria-current', 'true');
  // 5,99 USD × 150 = 898,50 Bs (tasa de demostración de la semilla).
  await expect(
    page
      .getByRole('main')
      .getByText(/898,50/)
      .first(),
  ).toBeVisible();
});

test('sin elegir moneda, muestra la del país de la conexión y recuerda la elegida', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'cf-ipcountry': 'CO' });
  await page.goto('/catalogo');
  let monedas = await menuMonedas(page);
  await expect(monedas.getByRole('link', { name: /^COP/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('parece que estás en Colombia')).toBeVisible();

  await monedas.getByRole('link', { name: /^EUR/ }).click();
  await expect(page).toHaveURL(/moneda=EUR/);
  await page.goto('/catalogo');
  monedas = await menuMonedas(page);
  await expect(monedas.getByRole('link', { name: /^EUR/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('parece que estás en')).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Paga tu factura' })).toBeVisible();
  const numero = await numeroFacturaEnPago(page);
  await enviarComprobante(page, /Pago Móvil/, '00123456', {
    name: 'pago.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });

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
  const servicio = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Individual' }),
  });
  await expect(servicio.getByText('Activa')).toBeVisible();
  await page.goto('/cuenta/facturas');
  await expect(page.getByRole('link').filter({ hasText: numero })).toContainText('Pagada');
});
