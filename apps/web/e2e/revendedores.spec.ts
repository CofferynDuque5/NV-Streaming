import { type CatalogoMayorista, formatearMonto, type PaginaSitioDetalle } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de la recarga. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');

/** Entra con la verificación en dos pasos que configuró roles.spec.ts. */
async function entrar(page: Page, correo: string, destino: RegExp) {
  await entrarEquipo(page, correo);
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

test('el revendedor ve sus precios mayoristas en el sitio público; el resto, los del público', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const anonimo = await (await browser.newContext()).newPage();
  const revendedor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // Una página del editor con el bloque de planes (la portada de la semilla no lo tiene).
  await entrar(admin, 'admin@nv.test', /\/admin$/);
  const origen = { origin: new URL(admin.url()).origin };
  const creada = (await (
    await admin.request.post('/api/v1/sitio/paginas', {
      headers: origen,
      data: { ruta: '/precios-e2e', titulo: 'Precios E2E' },
    })
  ).json()) as PaginaSitioDetalle;
  const guardado = await admin.request.put(`/api/v1/sitio/paginas/${creada.id}/borrador`, {
    headers: origen,
    data: {
      titulo: 'Precios E2E',
      bloques: [{ id: 'planese2e', tipo: 'planes', titulo: 'Nuestros planes' }],
      borradorActualizadoEn: creada.borradorActualizadoEn,
    },
  });
  expect(guardado.ok()).toBe(true);
  const publicada = await admin.request.post(`/api/v1/sitio/paginas/${creada.id}/publicar`, {
    headers: origen,
    data: {},
  });
  expect(publicada.ok()).toBe(true);

  // Sin sesión: precios al público y el botón de siempre.
  for (const ruta of ['/planes?moneda=USD', '/precios-e2e?moneda=USD']) {
    await anonimo.goto(ruta);
    const mensual = anonimo
      .getByRole('article')
      .filter({ has: anonimo.getByRole('heading', { name: 'Mensual', exact: true }) });
    await expect(mensual.getByText(usd(5.99))).toBeVisible();
    await expect(mensual.getByRole('link', { name: 'Elegir este plan' })).toBeVisible();
    await expect(anonimo.getByText('Precio mayorista')).toHaveCount(0);
  }

  // El revendedor (nivel Plata) ve su precio mayorista, el público de referencia y su margen.
  await entrar(revendedor, 'revendedor@nv.test', /\/revendedor$/);
  const catalogo = (await (
    await revendedor.request.get('/api/v1/revendedor/catalogo')
  ).json()) as CatalogoMayorista;
  const plan = catalogo.planes.find((p) => p.nombre === 'Mensual')!;
  const margen = Number(plan.precioPublicoUsd) - Number(plan.precioUsd);

  for (const ruta of ['/planes', '/precios-e2e']) {
    await revendedor.goto(`${ruta}?moneda=USD`);
    await expect(revendedor.getByText('Tus precios de revendedor · Nivel Plata')).toBeVisible();
    await expect(revendedor.getByRole('link', { name: /Elegir este plan/ })).toHaveCount(0);
    const tarjeta = revendedor
      .getByRole('article')
      .filter({ has: revendedor.getByRole('heading', { name: plan.nombre, exact: true }) });
    await expect(tarjeta.getByText('Precio mayorista')).toBeVisible();
    await expect(tarjeta.getByText(usd(Number(plan.precioUsd)), { exact: true })).toBeVisible();
    await expect(
      tarjeta.getByText(usd(Number(plan.precioPublicoUsd)), { exact: true }),
    ).toBeVisible();
    await expect(tarjeta.getByText(usd(margen), { exact: true })).toBeVisible();
    // Los planes que no se revenden no aparecen.
    await expect(revendedor.getByRole('heading', { name: 'Anual', exact: true })).toHaveCount(0);
    await expect(
      revendedor.getByText('Algunos planes no están disponibles para reventa'),
    ).toBeVisible();
  }

  // En bolívares: el equivalente con la tasa de hoy.
  await revendedor.getByRole('link', { name: 'VES', exact: true }).click();
  await expect(revendedor).toHaveURL(/moneda=VES/);
  const tarjetaVes = revendedor
    .getByRole('article')
    .filter({ has: revendedor.getByRole('heading', { name: plan.nombre, exact: true }) });
  await expect(
    tarjetaVes.getByText(formatearMonto(plan.precioVes!, 'VES'), { exact: true }),
  ).toBeVisible();

  // "Comprar con saldo" lleva al catálogo mayorista con ese plan listo para comprar.
  await tarjetaVes.getByRole('link', { name: 'Comprar con saldo' }).click();
  await expect(revendedor).toHaveURL(new RegExp(`/revendedor/catalogo\\?plan=${plan.id}$`));
  await expect(
    revendedor.getByText(`Comprar ${plan.servicio.nombre} · ${plan.nombre}`),
  ).toBeVisible();
  await expect(revendedor.getByLabel('Nombre del cliente')).toBeVisible();
});
