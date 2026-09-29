import { formatearMonto } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { ingresar } from './ayudas';

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');

/** Nombres de los servicios del catálogo, en el orden en que se ven. */
async function servicios(page: Page) {
  return page.getByRole('main').getByRole('article').getByRole('heading').allTextContents();
}

test('el catálogo filtra por universo, duración y búsqueda, ordena y guarda los filtros en la URL', async ({
  page,
}) => {
  await page.goto('/catalogo?moneda=USD');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo el catálogo');
  const universos = page.getByRole('navigation', { name: 'Filtrar por universo' });
  const filtros = page.getByRole('complementary', { name: 'Filtros' });
  const cine = page.getByRole('article').filter({ hasText: 'NV Cine' });
  const musica = page.getByRole('article').filter({ hasText: 'NV Música' });

  // Precios de la API en la moneda elegida (el plan más barato de cada servicio).
  await expect(cine.getByText(usd(5.99))).toBeVisible();
  await expect(musica.getByText(usd(3.49))).toBeVisible();

  // Universo.
  await universos.getByRole('button', { name: /^Música/ }).click();
  await expect(page).toHaveURL(/categoria=musica/);
  await expect(musica).toBeVisible();
  await expect(cine).toHaveCount(0);
  await universos.getByRole('button', { name: /^Todo/ }).click();
  await expect(page).not.toHaveURL(/categoria=/);
  await expect(cine).toBeVisible();

  // Orden por precio.
  await page.getByLabel('Ordenar por').selectOption('menor');
  await expect(page).toHaveURL(/orden=menor/);
  let nombres = await servicios(page);
  expect(nombres.indexOf('NV Música')).toBeLessThan(nombres.indexOf('NV Cine'));
  await page.getByLabel('Ordenar por').selectOption('mayor');
  nombres = await servicios(page);
  expect(nombres.indexOf('NV Cine')).toBeLessThan(nombres.indexOf('NV Música'));

  // Duración: solo los servicios con un plan de un año, con el precio de ese plan.
  await filtros.getByRole('button', { name: '1 año', exact: true }).click();
  await expect(page).toHaveURL(/duracion=12-mes/);
  await expect(cine.getByText(usd(54.99))).toBeVisible();
  await expect(musica).toHaveCount(0);
  await page.getByRole('button', { name: 'Quitar filtro 1 año' }).click();
  await expect(musica).toBeVisible();

  // Búsqueda y estado vacío.
  await filtros.getByLabel('Buscar').fill('música');
  await expect(cine).toHaveCount(0);
  await expect(musica).toBeVisible();
  await filtros.getByLabel('Buscar').fill('no existe');
  await expect(page.getByText('No encontramos servicios con esos filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(cine).toBeVisible();
  await expect(musica).toBeVisible();

  // Los filtros de la URL se aplican al abrir la página.
  await page.goto('/catalogo?moneda=USD&categoria=streaming&vista=lista');
  await expect(universos.getByRole('button', { name: /^Streaming/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Ver en lista' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(musica).toHaveCount(0);

  // La búsqueda de la cabecera lleva al catálogo filtrado.
  const buscador = page.getByRole('banner').getByRole('combobox').first();
  await buscador.fill('cine');
  await buscador.press('Enter');
  await expect(page).toHaveURL(/\/catalogo\/nv-cine|\/catalogo\?q=cine/);
});

test('/planes lleva al catálogo con la misma moneda', async ({ page }) => {
  await page.goto('/planes?moneda=VES');
  await expect(page).toHaveURL(/\/catalogo\?moneda=VES$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo el catálogo');
});

test('en el detalle se elige un plan real y se agrega al carrito', async ({ page }) => {
  await page.goto('/catalogo?moneda=USD');
  await page
    .getByRole('article')
    .filter({ hasText: 'NV Cine' })
    .getByRole('link', { name: /Ver detalles/ })
    .click();
  await expect(page).toHaveURL(/\/catalogo\/nv-cine/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('NV Cine');
  await expect(page.getByRole('navigation', { name: 'Estás en' })).toContainText('Streaming');

  // Cada opción es un plan del servicio con el precio que calculó la API.
  const trimestral = page.getByRole('radio', { name: /3 meses/ });
  await expect(page.getByRole('radio')).toHaveCount(3);
  await trimestral.check();
  await expect(page).toHaveURL(/plan=[0-9a-f-]{36}/);
  await expect(page.getByRole('main').getByText(usd(15.99), { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'está en tu carrito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carrito, 1 plan' })).toBeVisible();
  // El mismo plan no se repite.
  await page.getByRole('button', { name: 'En el carrito' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Ese plan ya está en tu carrito' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carrito, 1 plan' })).toBeVisible();

  // El plan elegido se recuerda al volver a abrir el enlace.
  await page.reload();
  await expect(trimestral).toBeChecked();

  // «Comprar ahora» lleva a contratar ese plan desde el panel.
  const plan = new URL(page.url()).searchParams.get('plan');
  await expect(page.getByRole('link', { name: 'Comprar ahora' })).toHaveAttribute(
    'href',
    `/cuenta/planes?plan=${plan}&moneda=USD`,
  );

  // Un servicio que no existe no inventa nada.
  const r = await page.goto('/catalogo/no-existe');
  expect(r?.status()).toBe(404);
});

test('el selector de moneda cambia todos los precios a la moneda elegida', async ({ page }) => {
  await page.goto('/catalogo/nv-cine?moneda=USD');
  await expect(page.getByRole('main').getByText(usd(5.99), { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: /Cambiar moneda/ }).click();
  const menu = page.getByRole('navigation', { name: 'Moneda' });
  await expect(menu.getByRole('link', { name: /^USD/ })).toHaveAttribute('aria-current', 'true');
  await menu.getByRole('link', { name: /^VES/ }).click();

  await expect(page).toHaveURL(/\/catalogo\/nv-cine\?moneda=VES/);
  // 5,99 USD × 150 = 898,50 Bs (tasa de demostración de la semilla), calculado por la API.
  await expect(
    page.getByRole('main').getByText(formatearMonto('898.50', 'VES'), { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Moneda: .*Bol/ })).toBeVisible();

  // La moneda elegida se recuerda en las demás páginas.
  await page.goto('/catalogo');
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: 'NV Cine' })
      .getByText(formatearMonto('898.50', 'VES')),
  ).toBeVisible();
});

test('el carrito lateral se abre desde la cabecera, agrega, quita y deshace', async ({ page }) => {
  await page.goto('/catalogo?moneda=USD');
  const carrito = page.getByRole('dialog', { name: 'Tu carrito' });

  // Vacío: lleva al catálogo y ofrece lo más pedido.
  await page.getByRole('button', { name: 'Carrito, 0 planes' }).click();
  await expect(carrito).toBeVisible();
  await expect(carrito.getByText('0 de 5 planes')).toBeVisible();
  await expect(carrito.getByText('Tu carrito está vacío')).toBeVisible();
  await expect(carrito.getByRole('link', { name: 'Ver catálogo' })).toBeVisible();
  await carrito.getByRole('button', { name: 'Agregar NV Cine' }).click();

  // Con un plan: su precio de catálogo como referencia (sin sesión), espacios y sugerencias.
  await expect(carrito.getByText('1 de 5 planes')).toBeVisible();
  await expect(carrito.getByText('Te quedan 4')).toBeVisible();
  const cine = carrito.getByRole('listitem').filter({ hasText: 'NV Cine' });
  await expect(cine.getByText('Recién agregado')).toBeVisible();
  await expect(cine.getByText(usd(5.99), { exact: true })).toBeVisible();
  await expect(carrito.getByText('Son los precios del catálogo, como referencia.')).toBeVisible();
  await expect(carrito.getByText('Complétalo')).toBeVisible();

  // Cambiar la duración cambia el plan (otro id, el precio que calculó la API).
  await cine.getByLabel('Plan de NV Cine').selectOption({ label: '3 meses' });
  await expect(cine.getByText(usd(15.99), { exact: true })).toBeVisible();

  // Quitar y deshacer.
  await cine.getByRole('button', { name: 'Quitar NV Cine del carrito' }).click();
  await expect(carrito.getByText('Tu carrito está vacío')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(carrito.getByText('1 de 5 planes')).toBeVisible();
  await expect(carrito.getByRole('listitem').filter({ hasText: 'NV Cine' })).toBeVisible();

  // «Ir a pagar» lleva a la página del carrito; Escape cierra.
  await expect(carrito.getByRole('link', { name: 'Ir a pagar' })).toHaveAttribute(
    'href',
    '/carrito?moneda=USD',
  );
  await page.keyboard.press('Escape');
  await expect(carrito).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Carrito, 1 plan' })).toBeVisible();
});

test('con sesión de cliente, el carrito lateral cotiza en la API y muestra el saldo', async ({
  page,
}) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto('/catalogo/nv-musica?moneda=USD');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await page.getByRole('status').getByRole('button', { name: 'Ver carrito' }).click();
  const carrito = page.getByRole('dialog', { name: 'Tu carrito' });
  await expect(carrito.getByText('Subtotal')).toBeVisible();
  await expect(carrito.getByText(usd(3.49), { exact: true }).first()).toBeVisible();
  await expect(carrito.getByText(/Tu saldo:/)).toBeVisible();
  await carrito.getByRole('button', { name: 'Seguir comprando' }).click();
  await expect(carrito).toHaveCount(0);
});
