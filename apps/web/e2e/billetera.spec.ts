import { formatearMonto } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { entrarEquipo, ingresar } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de la recarga. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');

// Se ejecuta después de roles.spec.ts (proyecto propio): administración ya tiene la
// verificación en dos pasos.
test('el cliente arma un carrito, recarga su billetera y el pedido se paga al confirmarla', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const cliente = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // 1. El cliente agrega dos planes al carrito desde el detalle del servicio.
  await ingresar(cliente, 'cliente@nv.test');
  await expect(cliente).toHaveURL(/\/cuenta$/);
  await cliente.goto('/catalogo/nv-cine?moneda=USD');
  for (const duracion of ['3 meses', '1 año']) {
    await cliente.getByRole('radio', { name: new RegExp(duracion) }).check();
    await cliente.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(cliente.getByRole('button', { name: 'En el carrito' })).toBeVisible();
  }
  await expect(cliente.getByRole('button', { name: 'Carrito, 2 planes' })).toBeVisible();

  // 2. En el carrito: sin saldo, elige "recargar y pagar".
  await cliente.goto('/carrito?moneda=USD');
  const total = 15.99 + 54.99;
  await expect(cliente.getByText(usd(total), { exact: true }).first()).toBeVisible();
  await expect(cliente.getByRole('radio', { name: /Pagar con mi saldo/ })).toBeDisabled();
  await expect(cliente.getByRole('radio', { name: /Recargar y pagar/ })).toBeChecked();
  await cliente.getByRole('button', { name: 'Hacer el pedido y recargar' }).click();
  await expect(cliente.getByRole('heading', { name: /Pedido PED-\d{6} creado/ })).toBeVisible();
  await cliente.getByRole('link', { name: 'Reportar mi recarga' }).click();

  // 3. Reporta la recarga por lo que falta, ligada al pedido.
  await expect(cliente).toHaveURL(/\/cuenta\/billetera\?pedido=/);
  await expect(cliente.getByText(/Pedido PED-\d{6} por pagar/)).toBeVisible();
  await cliente.getByLabel('Moneda en la que pagas').selectOption('USD');
  await expect(cliente.getByLabel('Monto que pagaste (USD)')).toHaveValue(total.toFixed(2));
  await cliente.getByLabel('Referencia (opcional)').fill('E2E-BIL-001');
  await cliente.locator('#comprobante-recarga').setInputFiles({
    name: 'recarga.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await cliente.getByRole('button', { name: 'Reportar recarga' }).click();
  await expect(cliente.getByText('Recibimos tu recarga')).toBeVisible();

  // 4. La administración la concilia desde Cobros.
  await entrarEquipo(admin, 'admin@nv.test');
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto('/admin/cobros?vista=billeteras');
  const recarga = admin.getByRole('listitem').filter({ hasText: 'E2E-BIL-001' });
  await expect(recarga).toBeVisible();
  await expect(recarga.getByText(/Para el pedido PED-/)).toBeVisible();
  await recarga.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(recarga.getByLabel('Monto recibido (USD)')).toHaveValue(total.toFixed(2));
  await recarga.getByRole('button', { name: 'Confirmar recarga' }).click();
  await expect(admin.getByText('No hay recargas pendientes')).toBeVisible();

  // 5. El pedido quedó pagado con el saldo y la billetera vuelve a cero.
  await cliente.goto('/cuenta/carrito');
  const pedido = cliente.getByRole('link', { name: /Pedido PED-\d{6} · 2 planes/ });
  await expect(pedido.getByText('Pagado')).toBeVisible();
  await pedido.click();
  await expect(cliente.getByRole('heading', { name: /^¡Pedido PED-\d{6} pagado!$/ })).toBeVisible();
  await cliente.goto('/cuenta/billetera');
  await expect(cliente.locator('[data-prueba="saldo"]')).toHaveText(usd(0));
  await expect(cliente.getByText('Pago de factura').first()).toBeVisible();
});
