import { readFileSync } from 'node:fs';
import { type CatalogoMayorista, formatearMonto } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { generate } from 'otplib';
import { ARCHIVO_SECRETOS, entrarEquipo } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de la recarga. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');

/**
 * Entra con verificación en dos pasos ya configurada (por roles.spec.ts). Si el
 * código se rechaza por repetido (otra prueba entró en los últimos 30 s), espera
 * al siguiente periodo y lo intenta de nuevo.
 */
async function entrar(page: Page, correo: string, destino: RegExp) {
  await entrarEquipo(page, correo);
  for (let intento = 0; intento < 2; intento++) {
    const llego = await page
      .waitForURL(destino, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (llego) return;
    const secreto = (JSON.parse(readFileSync(ARCHIVO_SECRETOS, 'utf8')) as Record<string, string>)[
      correo
    ]!;
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1_000);
    await page
      .getByLabel('Código de 6 dígitos')
      .fill(await generate({ secret: secreto, epoch: Math.floor(Date.now() / 1000) + 30 }));
    await page.getByRole('button', { name: 'Verificar' }).click();
  }
  await expect(page).toHaveURL(destino);
}

// Se ejecuta después de roles.spec.ts (proyecto propio en playwright.config.ts):
// el revendedor y la administración ya tienen la verificación en dos pasos.
test('el revendedor recarga saldo, el equipo lo confirma y compra una activación', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const revendedor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // 1. El revendedor ve su saldo inicial (la semilla le acredita 25 USD) y reporta una recarga.
  await entrar(revendedor, 'revendedor@nv.test', /\/revendedor$/);
  await expect(revendedor.getByRole('heading', { name: /Hola, Revendedor/ })).toBeVisible();
  await expect(revendedor.getByText(usd(25), { exact: true })).toBeVisible();

  await revendedor.getByRole('link', { name: 'Saldo y recargas' }).first().click();
  await expect(revendedor.getByRole('heading', { name: 'Saldo y recargas' })).toBeVisible();
  await revendedor.getByLabel('Moneda en la que pagas').selectOption('USD');
  await expect(revendedor.getByText('Datos para pagar con Transferencia en dólares')).toBeVisible();
  await revendedor.getByLabel('Monto que pagaste (USD)').fill('10');
  await revendedor.getByLabel('Referencia (opcional)').fill('E2E-REV-001');
  await revendedor.locator('#comprobante-recarga').setInputFiles({
    name: 'recarga.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await revendedor.getByRole('button', { name: 'Reportar recarga' }).click();
  await expect(revendedor.getByText('Recibimos tu recarga')).toBeVisible();
  await expect(revendedor.getByText('En revisión').first()).toBeVisible();

  // 2. La administración la concilia desde la cola de recargas.
  await entrar(admin, 'admin@nv.test', /\/admin$/);
  await admin.goto('/admin/revendedores?vista=recargas');
  const recarga = admin
    .getByRole('listitem')
    .filter({ hasText: 'Streaming Demo C.A.' })
    .filter({ hasText: 'E2E-REV-001' });
  await expect(recarga).toBeVisible();
  await recarga.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(recarga.getByLabel('Monto recibido (USD)')).toHaveValue('10.00');
  await recarga.getByRole('button', { name: 'Confirmar recarga' }).click();
  await expect(admin.getByText('No hay recargas pendientes')).toBeVisible();

  // 3. El revendedor ve el saldo acreditado y compra una activación para un cliente nuevo.
  await revendedor.goto('/revendedor/saldo');
  await expect(revendedor.getByText(usd(35), { exact: true }).first()).toBeVisible();
  await expect(revendedor.getByText('Confirmada').first()).toBeVisible();

  const catalogo = (await (
    await revendedor.request.get('/api/v1/revendedor/catalogo')
  ).json()) as CatalogoMayorista;
  const plan = catalogo.planes[0]!;
  const saldoFinal = 35 - Number(plan.precioUsd);

  await revendedor.getByRole('link', { name: 'Catálogo mayorista' }).first().click();
  const tarjeta = revendedor
    .getByRole('listitem')
    .filter({ has: revendedor.getByRole('heading', { name: plan.nombre, exact: true }) });
  await tarjeta.getByRole('button', { name: 'Comprar' }).click();
  await tarjeta.getByLabel('Nombre del cliente').fill('Cliente de Reventa E2E');
  await tarjeta.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(tarjeta.getByText('Compra realizada')).toBeVisible();
  await expect(tarjeta.getByText(`Tu saldo ahora es ${usd(saldoFinal)}`)).toBeVisible();

  // 4. El saldo bajó y el cliente aparece en su cartera con el servicio activo.
  await revendedor.getByRole('link', { name: 'Resumen' }).first().click();
  await expect(revendedor).toHaveURL(/\/revendedor$/);
  await expect(revendedor.getByText(usd(saldoFinal), { exact: true })).toBeVisible();
  await revendedor.getByRole('link', { name: 'Mis clientes' }).first().click();
  const cliente = revendedor.getByRole('listitem').filter({ hasText: 'Cliente de Reventa E2E' });
  await expect(cliente.getByText('Activa').first()).toBeVisible();
  await revendedor.getByRole('link', { name: 'Mis compras' }).first().click();
  await expect(
    revendedor.getByRole('row').filter({ hasText: 'Cliente de Reventa E2E' }),
  ).toBeVisible();
});
