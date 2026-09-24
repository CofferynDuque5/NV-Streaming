import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, ingresar } from './ayudas';

// Se ejecuta después de roles.spec.ts (proyecto propio en playwright.config.ts): la
// administración ya tiene la verificación en dos pasos. La pasarela de pruebas está
// activa en la API fuera de producción.
test.describe.configure({ mode: 'serial' });

const METODO = 'Pago en línea de prueba';
let facturaPagada = '';

async function entrarAdmin(page: Page) {
  await entrarEquipo(page, 'admin@nv.test');
  await expect(page).toHaveURL(/\/admin$/);
}

/** Contrata un plan en dólares y devuelve el número de la factura emitida. */
async function contratarEnDolares(page: Page, plan: string): Promise<string> {
  await page.goto('/cuenta/planes?moneda=USD');
  const tarjeta = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: plan, exact: true }),
  });
  await tarjeta.getByRole('button', { name: 'Contratar' }).click();
  await tarjeta.getByRole('button', { name: 'Confirmar y ver cómo pagar' }).click();
  await expect(page).toHaveURL(/\/cuenta\/facturas\/[0-9a-f-]{36}$/);
  const titulo = page.getByRole('heading', { name: /^Factura NV-/ });
  await expect(titulo).toBeVisible();
  return (await titulo.innerText()).replace('Factura ', '');
}

test('administración crea un método de pago en línea con la pasarela de pruebas', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarAdmin(page);
  await page.goto('/admin/finanzas');
  await page.getByRole('button', { name: 'Nuevo método' }).click();
  await page.getByRole('radio', { name: /Pago en línea/ }).check();
  await page.getByLabel('Pasarela', { exact: true }).selectOption('sandbox');
  // Las monedas se limitan a las de la pasarela: nunca bolívares.
  const moneda = page.getByLabel('Moneda', { exact: true });
  await expect(moneda.locator('option[value="VES"]')).toHaveCount(0);
  await moneda.selectOption('USD');
  await page.getByLabel('Nombre').fill(METODO);
  await page.getByRole('button', { name: 'Crear método' }).click();
  const fila = page.getByRole('listitem').filter({ hasText: METODO });
  await expect(fila.getByText('Pago en línea · Pasarela de pruebas')).toBeVisible();
});

test('el cliente paga en línea, guarda el método y autoriza el cobro automático', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  facturaPagada = await contratarEnDolares(page, 'Trimestral');

  const formulario = page.getByRole('form', { name: 'Pagar en línea' });
  await formulario.getByRole('radio', { name: new RegExp(METODO) }).check();
  await expect(formulario.getByText('NV Streaming nunca los ve ni los guarda')).toBeVisible();
  // El pago manual sigue disponible debajo.
  await expect(page.getByRole('heading', { name: 'O paga por transferencia' })).toBeVisible();

  await formulario.getByLabel('Guardar este método para cobros automáticos').check();
  await expect(formulario.getByText(/autorizo a NV Streaming a cobrar/)).toBeVisible();
  const pagar = formulario.getByRole('button', { name: /en línea$/ });
  await expect(pagar).toBeDisabled();
  await formulario.getByLabel('Acepto y autorizo los cobros automáticos').check();
  await pagar.click();

  // Pasarela de pruebas: página aparte y claramente falsa.
  await expect(page).toHaveURL(/\/pago-sandbox\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Entorno de pruebas: no se cobra dinero real')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pasarela de pruebas' })).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar' }).click();

  await expect(page).toHaveURL(/\/cuenta\/pagos\/retorno\?intento=/);
  await expect(page.getByRole('heading', { name: '¡Pago aprobado!' })).toBeVisible();
  await expect(page.getByText('Guardamos tu método de pago')).toBeVisible();
  await page.getByRole('link', { name: 'Ver la factura' }).click();
  await expect(page.getByText('Factura pagada')).toBeVisible();
  await expect(page.getByText(/Pago en línea \(Pasarela de pruebas\)/)).toBeVisible();

  // La suscripción queda activa y el método aparece en «Mis métodos de pago».
  await page.goto('/cuenta');
  const servicio = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Trimestral', exact: true }) })
    .last();
  await expect(servicio.getByText('Activa', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Mis métodos de pago' }).first().click();
  await expect(page).toHaveURL(/\/cuenta\/metodos-pago$/);
  const metodo = page.getByRole('listitem').filter({ hasText: 'Pasarela de pruebas · USD' });
  await expect(metodo).toHaveCount(1);
  await expect(metodo.getByText('Autorizado', { exact: true })).toBeVisible();
  await metodo.getByText('Texto que aceptaste').click();
  await expect(metodo.getByText(/autorizo a NV Streaming a cobrar/)).toBeVisible();
  await expect(metodo.getByRole('button', { name: /^Revocar/ })).toBeVisible();
});

test('el cliente apaga y vuelve a encender el cobro automático de su suscripción', async ({
  page,
}) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  const servicio = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Trimestral', exact: true }) })
    .last();
  const control = servicio.getByRole('region', { name: 'Cobro automático' });
  const selector = control.getByLabel('Método para cobrar la renovación');
  await expect(control.getByText(/día del vencimiento/)).toBeVisible();

  // Si ya quedó activado al pagar con «guardar», se apaga primero.
  if (await control.getByText(/^Activo · /).isVisible()) {
    await selector.selectOption('');
    await control.getByRole('button', { name: 'Desactivar' }).click();
    await expect(
      control.getByText('Cobro automático desactivado.', { exact: false }),
    ).toBeVisible();
    await expect(control.getByText('Desactivado', { exact: true })).toBeVisible();
  }

  await selector.selectOption({ index: 1 });
  await control.getByRole('button', { name: 'Activar' }).click();
  await expect(control.getByText('Cobro automático activado.')).toBeVisible();
  await page.reload();
  await expect(control.getByText(/^Activo · /)).toBeVisible();

  await page.goto('/cuenta/metodos-pago');
  await expect(page.getByText(/Trimestral · próximo cobro el/)).toBeVisible();
});

test('un pago rechazado o cancelado en la pasarela deja la factura pendiente', async ({ page }) => {
  test.setTimeout(90_000);
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await contratarEnDolares(page, 'Anual');

  const formulario = page.getByRole('form', { name: 'Pagar en línea' });
  await formulario.getByRole('button', { name: /en línea$/ }).click();
  await expect(page).toHaveURL(/\/pago-sandbox\//);
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByRole('heading', { name: 'El pago fue rechazado' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a intentarlo' }).click();
  await expect(page).toHaveURL(/\/cuenta\/facturas\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Pendiente', { exact: true }).first()).toBeVisible();

  // Cancelar en la pasarela: no se cobra nada y se puede volver a la factura.
  await formulario.getByRole('button', { name: /en línea$/ }).click();
  await expect(page).toHaveURL(/\/pago-sandbox\//);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Cancelaste el pago' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a la factura' })).toBeVisible();
});

test('la pasarela de pruebas responde 404 con un intento inexistente', async ({ page }) => {
  const r = await page.goto('/pago-sandbox/00000000-0000-4000-8000-000000000000');
  expect(r?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
});

test('administración ve el pago en línea, devuelve una parte y revisa las pasarelas', async ({
  page,
}) => {
  test.setTimeout(150_000);
  expect(facturaPagada).not.toBe('');
  await entrarAdmin(page);
  await page.goto('/admin/cobros?vista=facturas');
  await page.getByRole('row').filter({ hasText: facturaPagada }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: new RegExp(facturaPagada) })).toBeVisible();

  const pago = page.getByRole('listitem').filter({ hasText: 'Id en la pasarela' }).first();
  await expect(pago.getByText('Pago en línea', { exact: true })).toBeVisible();
  await expect(pago.getByText('Pasarela de pruebas')).toBeVisible();
  await expect(pago.getByText('Sin devoluciones.')).toBeVisible();

  await pago.getByRole('button', { name: 'Devolver' }).click();
  const devolucion = page.getByRole('form', { name: 'Devolver pago' });
  await devolucion.getByRole('radio', { name: 'Parcial' }).check();
  await devolucion.getByLabel(/Importe a devolver/).fill('5.00');
  await devolucion.getByLabel('Motivo').fill('Compensación por días sin servicio');
  page.once('dialog', (d) => void d.accept());
  await devolucion.getByRole('button', { name: 'Devolver dinero' }).click();
  const lista = pago.getByRole('region', { name: /^Devoluciones del pago/ });
  await expect(lista.getByText('Compensación por días sin servicio')).toBeVisible();
  await expect(lista.getByText(/5[.,]00/).first()).toBeVisible();

  // Ficha del cliente: el método autorizado, con el texto aceptado.
  await page.getByRole('link', { name: 'Cliente Demo' }).first().click();
  const autorizados = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Cobro automático autorizado' }),
  });
  await expect(autorizados.getByText('Pasarela de pruebas · USD', { exact: false })).toBeVisible();
  await expect(autorizados.getByRole('button', { name: /^Revocar/ })).toBeVisible();

  // Pagos en línea: la pasarela de pruebas está configurada.
  await page.getByRole('link', { name: 'Pagos en línea' }).first().click();
  await expect(page).toHaveURL(/\/admin\/pagos-en-linea$/);
  const sandbox = page.getByRole('region', { name: 'Pasarela de pruebas' });
  await expect(sandbox.getByText('Configurada', { exact: true })).toBeVisible();
  await expect(sandbox.getByText(/\/api\/v1\/pasarelas\/sandbox\/webhook$/)).toBeVisible();
  await page.getByRole('link', { name: 'Cobros automáticos' }).click();
  await expect(page).toHaveURL(/vista=cobros/);
  await expect(page.getByRole('search', { name: 'Filtrar cobros automáticos' })).toBeVisible();
  await page.getByRole('link', { name: 'Avisos de pasarelas' }).click();
  await expect(page.getByRole('search', { name: 'Filtrar avisos' })).toBeVisible();
});
