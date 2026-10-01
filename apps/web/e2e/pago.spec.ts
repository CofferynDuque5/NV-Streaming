import { formatearMonto } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, ingresar, reiniciarLimiteIngreso } from './ayudas';

/*
 * Página «Paga tu pedido» con la API real: elegir factura y método, validar el
 * comprobante en vivo, enviarlo (queda en revisión), ver el motivo de un
 * rechazo, cambiar la moneda, pagar con saldo y pagar todo el pedido de una vez.
 * Corre después de carrito.spec.ts: el cliente no tiene pedidos por pagar.
 */

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe.configure({ mode: 'serial' });

let cliente: Page;
let admin: Page;
let origen: { origin: string };
let planes: string[];
let urlPedido: string;

async function acreditar(montoUsd: string) {
  const lista = await admin.request.get('/api/v1/clientes?busqueda=cliente%40nv.test');
  const { elementos } = (await lista.json()) as { elementos: { id: string }[] };
  const r = await admin.request.post(`/api/v1/billeteras/clientes/${elementos[0]?.id}/ajustes`, {
    headers: origen,
    data: { montoUsd, motivo: 'Saldo para la prueba de pago' },
  });
  expect(r.ok()).toBe(true);
}

/** Crea un pedido «una factura por plan» y devuelve la dirección de su página. */
async function crearPedido(moneda: string) {
  const r = await cliente.request.post('/api/v1/mi/pedidos', {
    headers: origen,
    data: { planes, moneda, pago: 'facturas' },
  });
  expect(r.ok()).toBe(true);
  return `/cuenta/carrito/${((await r.json()) as { id: string }).id}`;
}

test.beforeAll(async ({ browser }) => {
  reiniciarLimiteIngreso();
  cliente = await (await browser.newContext()).newPage();
  admin = await (await browser.newContext()).newPage();
  await entrarEquipo(admin, 'admin@nv.test');
  await expect(admin).toHaveURL(/\/admin$/);
  origen = { origin: new URL(admin.url()).origin };
  await ingresar(cliente, 'cliente@nv.test');
  await expect(cliente).toHaveURL(/\/cuenta$/);
  const catalogo = (await (await cliente.request.get('/api/v1/catalogo')).json()) as {
    planes: { id: string; nombre: string; servicio: { slug: string } }[];
  };
  const plan = (slug: string, nombre?: string) =>
    catalogo.planes.find((p) => p.servicio.slug === slug && (!nombre || p.nombre === nombre))!.id;
  planes = [plan('nv-cine', 'Trimestral'), plan('nv-musica')];
});

test.afterAll(async () => {
  await cliente.context().close();
  await admin.context().close();
});

const resumen = () => cliente.getByRole('complementary', { name: 'Resumen de la factura' });
const facturas = () => cliente.getByRole('navigation', { name: 'Facturas del pedido' });

test('elige el método y valida el comprobante en vivo; al enviarlo queda en revisión', async () => {
  urlPedido = await crearPedido('VES');
  await cliente.goto(urlPedido);
  await expect(cliente.getByRole('heading', { name: 'Paga tu pedido' })).toBeVisible();
  await expect(facturas().getByRole('link', { name: /NV Cine/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(
    cliente.getByText('Elige un método arriba y aquí te mostramos cómo pagar.'),
  ).toBeVisible();
  // En bolívares no hay pago en línea; el saldo no alcanza (lo dice) y los manuales salen del panel.
  const saldo = cliente.getByRole('radio', { name: /Saldo NV/ });
  await expect(saldo).toBeDisabled();
  await expect(cliente.getByText(/te faltan \$/)).toBeVisible();
  await cliente.getByRole('radio', { name: /Pago Móvil/ }).check();
  await expect(cliente.getByRole('heading', { name: 'Paga y envía tu comprobante' })).toBeVisible();
  await expect(cliente.getByText(/DATOS DE EJEMPLO\. Banco/)).toBeVisible();
  await expect(cliente.getByRole('button', { name: 'Copiar monto exacto' })).toBeVisible();

  // Enviar vacío: cada campo dice qué falta.
  const form = cliente.getByRole('form', { name: 'Enviar comprobante' });
  await form.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(form.getByText('Escribe el monto que pagaste.')).toBeVisible();
  await expect(form.getByText('Escribe el número de referencia del pago.')).toBeVisible();
  await expect(form.getByText('Adjunta la captura o el PDF del pago.')).toBeVisible();
  await expect(form.getByText('Revisa los 3 campos marcados en rojo.')).toBeVisible();

  const monto = form.getByLabel('Monto que pagaste (VES)');
  await monto.fill('abc');
  await expect(form.getByText(/Usa solo números con hasta 2 decimales/)).toBeVisible();
  await monto.fill('1000');
  await expect(form.getByText(/Es menos que el total/)).toBeVisible();
  await monto.fill((await monto.getAttribute('placeholder')) ?? '');
  await expect(form.getByText('Coincide con la factura')).toBeVisible();

  const fecha = form.getByLabel('Fecha del pago');
  const manana = new Date(Date.now() + 2 * 24 * 3600_000).toISOString().slice(0, 10);
  await fecha.fill(manana);
  await expect(form.getByText('La fecha no puede ser futura.')).toBeVisible();
  await fecha.fill(new Date().toISOString().slice(0, 10));

  const referencia = form.getByLabel('Número de referencia');
  await referencia.fill('ref!!');
  await referencia.blur();
  await expect(form.getByText(/Usa letras, números, espacios/)).toBeVisible();
  await referencia.fill('E2E-PAGO-001');
  await expect(form.getByText('Referencia lista')).toBeVisible();

  const archivo = form.locator('input[type=file]');
  await archivo.setInputFiles({
    name: 'nota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x'),
  });
  await expect(form.getByText(/Ese archivo no sirve/)).toBeVisible();
  await archivo.setInputFiles({ name: 'pago.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(form.getByText('pago.png')).toBeVisible();
  await expect(form.getByRole('img', { name: 'Vista previa del comprobante' })).toBeVisible();

  await form.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(cliente.getByRole('heading', { name: 'Recibimos tu comprobante' })).toBeVisible();
  // El código es el del servidor; la línea de tiempo marca la revisión en curso.
  await expect(cliente.getByLabel(/^Código del pago P-/)).toBeVisible();
  await expect(
    cliente.getByRole('list', { name: 'Estado del pago' }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(facturas().getByRole('link', { name: /NV Cine/ })).toContainText('En revisión');
  await expect(resumen().getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
    'href',
    /\/api\/v1\/mi\/pagos\/[0-9a-f-]{36}\/comprobante$/,
  );

  // Ofrece la siguiente factura por pagar.
  await cliente.getByRole('link', { name: 'Pagar NV Música' }).click();
  await expect(cliente).toHaveURL(/\?factura=/);
  await expect(facturas().getByRole('link', { name: /NV Música/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('un comprobante rechazado muestra el motivo y deja volver a pagar', async () => {
  const lista = await admin.request.get('/api/v1/pagos?estado=en_revision');
  const { elementos } = (await lista.json()) as {
    elementos: { id: string; referenciaExterna: string | null }[];
  };
  const pago = elementos.find((p) => p.referenciaExterna === 'E2E-PAGO-001');
  const r = await admin.request.post(`/api/v1/pagos/${pago?.id}/rechazar`, {
    headers: origen,
    data: { motivo: 'La referencia no aparece en el banco.' },
  });
  expect(r.ok()).toBe(true);

  await cliente.goto(urlPedido);
  await facturas()
    .getByRole('link', { name: /NV Cine/ })
    .click();
  await expect(cliente.getByText('Rechazamos tu comprobante anterior')).toBeVisible();
  await expect(
    cliente.getByRole('alert').getByText(/Motivo: La referencia no aparece en el banco\./),
  ).toBeVisible();
  await expect(facturas().getByRole('link', { name: /NV Cine/ })).toContainText('Rechazado');
  await expect(cliente.getByRole('radio', { name: /Pago Móvil/ })).toBeVisible();
});

test('cambia la moneda de la factura y aparecen los métodos de esa moneda', async () => {
  await facturas()
    .getByRole('link', { name: /NV Música/ })
    .click();
  await expect(
    resumen().getByText(formatearMonto('523.50', 'VES'), { exact: true }).last(),
  ).toBeVisible();
  await cliente.getByRole('button', { name: 'USD', exact: true }).click();
  await expect(cliente.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(resumen().getByText(usd(3.49), { exact: true }).last()).toBeVisible();
  // Sigue en la misma factura, ahora con pago en línea y los manuales en dólares.
  await expect(facturas().getByRole('link', { name: /NV Música/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(cliente.getByRole('radio', { name: /Pago en línea/ }).first()).toBeVisible();
  await expect(cliente.getByRole('radio', { name: /Transferencia en dólares/ })).toBeVisible();
  await expect(cliente.getByRole('radio', { name: /Pago Móvil/ })).toHaveCount(0);
});

test('paga una factura con el saldo y luego el resto: el pedido queda pagado', async () => {
  await acreditar('20.00');
  await cliente.reload();
  await cliente.getByRole('radio', { name: /Saldo NV/ }).check();
  await expect(cliente.getByRole('heading', { name: 'Paga con tu saldo' })).toBeVisible();
  await cliente.getByRole('button', { name: `Pagar ${usd(3.49)} con mi saldo` }).click();
  await expect(cliente.getByText('Factura pagada', { exact: true })).toBeVisible();
  await expect(facturas().getByRole('link', { name: /NV Música/ })).toContainText('Pagada');

  await cliente.getByRole('link', { name: 'Pagar NV Cine' }).click();
  await cliente.getByRole('radio', { name: /Saldo NV/ }).check();
  await cliente.getByRole('button', { name: /^Pagar \$[\d.]+ con mi saldo$/ }).click();
  await expect(cliente.getByRole('heading', { name: /^¡Pedido PED-\d{6} pagado!$/ })).toBeVisible();
  await expect(cliente.getByRole('link', { name: 'Ir a mis servicios' })).toHaveAttribute(
    'href',
    '/cuenta',
  );
  await expect(resumen().getByText('Confirmado').first()).toBeVisible();
});

test('con saldo suficiente paga todo el pedido de una vez', async () => {
  await acreditar('20.00');
  urlPedido = await crearPedido('USD');
  await cliente.goto(urlPedido);
  const todo = cliente.getByRole('region', { name: 'Pagar todo con tu saldo' });
  await expect(todo.getByText('Tu saldo alcanza para todo el pedido')).toBeVisible();
  await expect(todo.getByText(/Pagas las 2 facturas de una vez: \$19\.48/)).toBeVisible();
  await todo.getByRole('button', { name: 'Pagar todo con mi saldo' }).click();
  await expect(cliente.getByRole('heading', { name: /^¡Pedido PED-\d{6} pagado!$/ })).toBeVisible();
  await expect(cliente.getByText('Tus 2 planes ya están activos.', { exact: false })).toBeVisible();
});
