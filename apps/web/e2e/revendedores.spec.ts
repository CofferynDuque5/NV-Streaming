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
test('el revendedor recarga saldo, el equipo lo confirma, vende una activación y la renueva en lote', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const revendedor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();

  // 1. El revendedor ve su saldo inicial (la semilla le acredita 25 USD) y reporta una recarga.
  await entrar(revendedor, 'revendedor@nv.test', /\/revendedor$/);
  await expect(
    revendedor.getByRole('heading', { level: 1, name: 'Streaming Demo C.A.' }),
  ).toBeVisible();
  await expect(revendedor.getByText(/Hola, Revendedor/)).toBeVisible();
  await expect(revendedor.getByText(usd(25), { exact: true }).first()).toBeVisible();
  await expect(revendedor.getByText('Empieza en 3 pasos')).toBeVisible();

  await revendedor.getByRole('link', { name: 'Saldo y recargas' }).first().click();
  await expect(revendedor.getByRole('heading', { name: 'Saldo y recargas' })).toBeVisible();
  await revendedor
    .getByRole('group', { name: 'Moneda del pago' })
    .getByRole('button', { name: 'USD' })
    .click();
  await revendedor.getByRole('radio', { name: /Transferencia en dólares/ }).check();
  await revendedor.getByLabel('Referencia (opcional)').fill('E2E-REV-001');
  await revendedor.locator('input[type=file]').setInputFiles({
    name: 'recarga.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await revendedor.getByRole('button', { name: `Reportar recarga de ${usd(10)}` }).click();
  await expect(revendedor.getByRole('heading', { name: 'Recibimos tu recarga' })).toBeVisible();
  await expect(revendedor.locator('#contenido').getByText('1 recarga en revisión')).toBeVisible();

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

  // 3. El revendedor ve el saldo acreditado y vende una activación a un cliente nuevo.
  await revendedor.goto('/revendedor/saldo');
  await expect(revendedor.locator('[data-prueba="saldo"]')).toHaveText(usd(35));
  await expect(revendedor.getByText('Confirmada').first()).toBeVisible();

  const catalogo = (await (
    await revendedor.request.get('/api/v1/revendedor/catalogo')
  ).json()) as CatalogoMayorista;
  const plan = catalogo.planes[0]!;
  const nombrePlan = `${plan.servicio.nombre} ${plan.nombre}`;
  const precio = Number(plan.precioUsd);
  const saldoFinal = 35 - precio;

  await revendedor.getByRole('link', { name: 'Nueva venta' }).first().click();
  await expect(revendedor.getByRole('heading', { level: 1, name: 'Nueva venta' })).toBeVisible();
  await revendedor.getByRole('button', { name: `Vender ${nombrePlan}` }).click();
  const venta = revendedor.getByRole('dialog', { name: 'Nueva venta' });
  await venta.getByLabel('Nombre del cliente').fill('Cliente de Reventa E2E');
  await venta.getByRole('button', { name: `Vender por ${usd(precio)}` }).click();
  await expect(venta.getByText(`Listo: ${nombrePlan} para Cliente de Reventa E2E`)).toBeVisible();
  await expect(venta.getByText(`Te quedan ${usd(saldoFinal)}`)).toBeVisible();
  await expect(venta.getByRole('link', { name: 'Ver accesos' })).toBeVisible();
  await venta.getByRole('button', { name: 'Seguir vendiendo' }).click();
  await expect(venta).toBeHidden();

  // 4. El saldo bajó, la venta suma en el resumen y el cliente aparece en su cartera.
  await revendedor.getByRole('link', { name: 'Resumen' }).first().click();
  await expect(revendedor).toHaveURL(/\/revendedor$/);
  await expect(revendedor.getByText(usd(saldoFinal), { exact: true }).first()).toBeVisible();
  await expect(revendedor.getByText('Empieza en 3 pasos')).toHaveCount(0);
  await expect(revendedor.getByRole('img', { name: /Ventas por día/ })).toBeVisible();

  await revendedor.getByRole('link', { name: 'Clientes' }).first().click();
  await revendedor.getByRole('button', { name: 'Cliente de Reventa E2E' }).click();
  const ficha = revendedor.getByRole('dialog', { name: 'Cliente de Reventa E2E' });
  await expect(ficha.getByText('Activa').first()).toBeVisible();
  await expect(ficha.getByRole('link', { name: 'Vender otro plan a Cliente' })).toHaveAttribute(
    'href',
    /\/revendedor\/catalogo\?cliente=/,
  );
  await ficha.getByRole('button', { name: 'Cerrar' }).click();

  await revendedor.getByRole('link', { name: 'Ventas' }).first().click();
  await expect(
    revendedor.getByRole('row').filter({ hasText: 'Cliente de Reventa E2E' }),
  ).toBeVisible();

  // 5. Renovación en lote: elige el servicio, ve lo que le queda y lo renueva.
  await revendedor.goto('/revendedor/renovaciones?filtro=todos');
  await revendedor
    .getByRole('checkbox', { name: `Elegir Cliente de Reventa E2E · ${plan.servicio.nombre}` })
    .check();
  await expect(revendedor.getByText(`1 elegido · ${usd(precio)}`)).toBeVisible();
  await expect(revendedor.getByText(`Te quedan ${usd(saldoFinal - precio)}`)).toBeVisible();
  await revendedor.getByRole('button', { name: 'Renovar 1' }).click();
  await expect(
    revendedor.getByText(
      `Renovaste 1 servicio por ${usd(precio)}. Saldo: ${usd(saldoFinal - precio)}`,
    ),
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
  await anonimo.goto('/precios-e2e?moneda=USD');
  const mensual = anonimo
    .getByRole('article')
    .filter({ has: anonimo.getByRole('heading', { name: 'Mensual', exact: true }) });
  await expect(mensual.getByText(usd(5.99))).toBeVisible();
  await expect(mensual.getByRole('link', { name: 'Elegir este plan' })).toBeVisible();
  await expect(anonimo.getByText('Precio mayorista')).toHaveCount(0);
  // En el catálogo y el detalle: precio al público y carrito.
  await anonimo.goto('/catalogo?moneda=USD');
  const cineAnonimo = anonimo.getByRole('article').filter({ hasText: 'NV Cine' });
  await expect(cineAnonimo.getByText(usd(5.99))).toBeVisible();
  await expect(
    cineAnonimo.getByRole('button', { name: /Agregar NV Cine .* al carrito/ }),
  ).toBeVisible();
  await expect(anonimo.getByText('Tu precio')).toHaveCount(0);
  await anonimo.goto('/catalogo/nv-cine?moneda=USD');
  await expect(anonimo.getByRole('button', { name: 'Agregar al carrito' })).toBeVisible();
  await expect(anonimo.getByRole('link', { name: 'Comprar con saldo' })).toHaveCount(0);

  // El revendedor (nivel Plata) ve su precio mayorista, el público de referencia y su margen.
  await entrar(revendedor, 'revendedor@nv.test', /\/revendedor$/);
  const catalogo = (await (
    await revendedor.request.get('/api/v1/revendedor/catalogo')
  ).json()) as CatalogoMayorista;
  const plan = catalogo.planes.find((p) => p.nombre === 'Mensual')!;
  const margen = Number(plan.precioPublicoUsd) - Number(plan.precioUsd);

  // Catálogo: su precio en la tarjeta y la compra con saldo en lugar del carrito.
  await revendedor.goto('/catalogo?moneda=USD');
  await expect(revendedor.getByText('Tus precios de revendedor · Nivel Plata')).toBeVisible();
  const cine = revendedor.getByRole('article').filter({ hasText: plan.servicio.nombre });
  await expect(cine.getByText('Tu precio')).toBeVisible();
  await expect(cine.getByText(usd(Number(plan.precioUsd)))).toBeVisible();
  await expect(cine.getByRole('link', { name: /con saldo/ })).toHaveAttribute(
    'href',
    `/revendedor/catalogo?plan=${plan.id}`,
  );
  await expect(cine.getByRole('button', { name: /al carrito/ })).toHaveCount(0);

  // Detalle: precio mayorista del plan elegido; el plan anual no se revende.
  await revendedor.goto('/catalogo/nv-cine?moneda=USD');
  await expect(
    revendedor
      .getByRole('main')
      .getByText(usd(Number(plan.precioUsd)), { exact: true })
      .first(),
  ).toBeVisible();
  await expect(revendedor.getByRole('link', { name: 'Comprar con saldo' })).toHaveAttribute(
    'href',
    `/revendedor/catalogo?plan=${plan.id}`,
  );
  await expect(revendedor.getByRole('button', { name: 'Agregar al carrito' })).toHaveCount(0);
  await revendedor.getByRole('radio', { name: /1 año/ }).check();
  await expect(revendedor.getByText('Este plan no está disponible para reventa.')).toBeVisible();
  await expect(revendedor.getByRole('link', { name: 'Comprar con saldo' })).toHaveCount(0);

  for (const ruta of ['/precios-e2e']) {
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

  // "Comprar con saldo" lleva a Nueva venta con ese plan listo para vender.
  await tarjetaVes.getByRole('link', { name: 'Comprar con saldo' }).click();
  await expect(revendedor).toHaveURL(new RegExp(`/revendedor/catalogo\\?plan=${plan.id}$`));
  const venta = revendedor.getByRole('dialog', { name: 'Nueva venta' });
  await expect(venta.getByText(`${plan.servicio.nombre} ${plan.nombre}`).first()).toBeVisible();
  await expect(venta.getByLabel('Nombre del cliente')).toBeVisible();
});
