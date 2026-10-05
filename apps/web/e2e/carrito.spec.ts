import { formatearMonto } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { CONTRASENA_DEMO, entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/*
 * Página del carrito (/carrito) con la API real: visitante, cotización, cupón
 * válido y no válido, cada forma de pago, pedido pendiente y carrito vacío.
 * Corre al final (proyecto propio), después de billetera.spec.ts: el cliente
 * de la semilla no tiene pedidos por pagar y su saldo es 0.
 */

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');
const CUPON = 'CARRITO10';

test.describe.configure({ mode: 'serial' });

let cliente: Page;
let admin: Page;
let origen: { origin: string };
/** Ids de los planes del carrito (NV Cine 3 meses y NV Música), para volver a llenarlo. */
let planes: string;

test.beforeAll(async ({ browser }) => {
  reiniciarLimiteIngreso();
  cliente = await (await browser.newContext()).newPage();
  admin = await (await browser.newContext()).newPage();
  // La administración (con 2FA desde roles.spec.ts) crea el cupón de la prueba.
  await entrarEquipo(admin, 'admin@nv.test');
  await expect(admin).toHaveURL(/\/admin$/);
  origen = { origin: new URL(admin.url()).origin };
  const cupon = await admin.request.post('/api/v1/cupones', {
    headers: origen,
    data: { codigo: CUPON, tipo: 'porcentaje', valor: '10' },
  });
  expect(cupon.ok()).toBe(true);
});

test.afterAll(async () => {
  await cliente.context().close();
  await admin.context().close();
});

const resumen = () => cliente.getByRole('complementary', { name: 'Resumen' });

async function llenarCarrito() {
  await cliente.evaluate((ids) => localStorage.setItem('nv-carrito', ids), planes);
  await cliente.goto('/carrito?moneda=USD');
}

test('sin sesión: vacío, planes con precio de catálogo e ingresar sin perder el carrito', async () => {
  await cliente.goto('/carrito?moneda=USD');
  await expect(cliente.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
  await expect(
    cliente.getByRole('main').getByRole('link', { name: 'Ver catálogo' }).first(),
  ).toBeVisible();

  await cliente.goto('/catalogo/nv-cine?moneda=USD');
  await cliente.getByRole('radio', { name: /3 meses/ }).check();
  await cliente.getByRole('button', { name: 'Agregar al carrito' }).click();
  await cliente.goto('/catalogo/nv-musica?moneda=USD');
  await cliente.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(cliente.getByRole('button', { name: 'Carrito, 2 planes' })).toBeVisible();
  planes = await cliente.evaluate(() => localStorage.getItem('nv-carrito') ?? '[]');

  await cliente.goto('/carrito?moneda=USD');
  await expect(cliente.getByRole('heading', { name: '2 de 5 planes' })).toBeVisible();
  const cine = cliente.getByRole('listitem').filter({ hasText: 'NV Cine' });
  await expect(cine.getByText(usd(15.99), { exact: true })).toBeVisible();
  await expect(cine.getByText('Precio de catálogo')).toBeVisible();
  await expect(resumen().getByRole('link', { name: 'Crear cuenta gratis' })).toHaveAttribute(
    'href',
    '/registro',
  );

  // En esta página el carrito de la cabecera no abre el carrito lateral encima.
  await cliente.getByRole('button', { name: 'Carrito, 2 planes' }).click();
  await expect(cliente.getByRole('dialog', { name: 'Tu carrito' })).toHaveCount(0);

  await resumen().getByRole('link', { name: 'Ingresar para pagar' }).click();
  await expect(cliente).toHaveURL(/\/ingresar\?siguiente=%2Fcarrito/);
  await cliente.getByLabel('Correo').fill('cliente@nv.test');
  await cliente.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_DEMO);
  await cliente.getByRole('button', { name: 'Ingresar' }).click();
  await expect(cliente).toHaveURL(/\/carrito$/);
  await expect(cliente.getByRole('heading', { name: '2 de 5 planes' })).toBeVisible();
});

test('cotiza en la API y valida el cupón: formato, no válido y válido', async () => {
  await cliente.goto('/carrito?moneda=USD');
  // Total calculado por POST /mi/pedidos/cotizar: 15,99 + 3,49.
  await expect(resumen().getByText(usd(19.48), { exact: true }).last()).toBeVisible();
  await expect(resumen().getByText(/te faltan \$19\.48/)).toBeVisible();

  const campo = resumen().getByLabel('Cupón de descuento');
  const aplicar = resumen().getByRole('button', { name: 'Aplicar' });
  await campo.fill('no vale!');
  await expect(
    resumen().getByText('El cupón usa letras, números, guiones (3 a 40).'),
  ).toBeVisible();
  await expect(aplicar).toBeDisabled();

  await campo.fill('NOEXISTE');
  await aplicar.click();
  await expect(
    resumen().getByText(/Revisa el código o bórralo para seguir sin cupón/),
  ).toBeVisible();
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await expect(resumen().getByText(usd(19.48), { exact: true }).last()).toBeVisible();

  await campo.fill(CUPON.toLowerCase());
  await expect(campo).toHaveValue(CUPON);
  await aplicar.click();
  // El 10 % va al plan donde más se ahorra (NV Cine): 15,99 × 10 % = 1,60.
  await expect(
    resumen().getByText(`Cupón ${CUPON} aplicado a NV Cine, donde más ahorras.`),
  ).toBeVisible();
  await expect(resumen().getByText(usd(17.88), { exact: true })).toBeVisible();
  await expect(
    cliente.getByRole('listitem').filter({ hasText: 'NV Cine' }).getByText('Cupón −$1.60'),
  ).toBeVisible();
});

test('pagar cada factura aparte: crea el pedido y lleva a su página', async () => {
  // Sin saldo, «Pagar con mi saldo» no se puede elegir.
  await expect(resumen().getByRole('radio', { name: /Pagar con mi saldo/ })).toBeDisabled();
  await expect(resumen().getByText('Tu saldo no alcanza para este pedido.')).toBeVisible();
  await expect(resumen().getByRole('radio', { name: /Recargar y pagar/ })).toBeChecked();

  await resumen()
    .getByRole('radio', { name: /Pagar cada factura aparte/ })
    .check();
  await resumen().getByRole('button', { name: 'Hacer el pedido', exact: true }).click();
  await expect(cliente.getByRole('heading', { name: /Pedido PED-\d{6} creado/ })).toBeVisible();
  await expect(cliente.getByText('Creamos 2 facturas, una por cada plan.')).toBeVisible();
  await expect(cliente.getByRole('button', { name: 'Carrito, 0 planes' })).toBeVisible();

  await cliente.getByRole('link', { name: 'Ver mi pedido' }).click();
  await expect(cliente).toHaveURL(/\/cuenta\/carrito\/[0-9a-f-]{36}$/);
  // Es la página de pago del pedido: una factura por plan, con la primera elegida.
  await expect(cliente.getByRole('heading', { name: 'Paga tu pedido' })).toBeVisible();
  const facturas = cliente.getByRole('navigation', { name: 'Facturas del pedido' });
  await expect(facturas.getByRole('link')).toHaveCount(2);
  await expect(facturas.getByRole('link', { name: /NV Cine/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  const pedido = cliente.getByRole('complementary', { name: 'Resumen de la factura' });
  // NV Cine con el cupón (15,99 − 1,60) y lo que falta del pedido (17,88).
  await expect(pedido.getByText(usd(14.39), { exact: true })).toBeVisible();
  await expect(pedido.getByText(usd(17.88), { exact: true })).toBeVisible();
  await expect(pedido.getByRole('button', { name: 'Cancelar el pedido' })).toBeVisible();
});

test('con un pedido por pagar no deja hacer otro; se cancela desde el carrito', async () => {
  await llenarCarrito();
  const aviso = resumen().getByText(/Tienes el pedido PED-\d{6} por pagar/);
  await expect(aviso).toBeVisible();
  await expect(resumen().getByRole('link', { name: 'Ver el pedido' })).toBeVisible();
  await expect(resumen().getByRole('button', { name: /Hacer el pedido/ })).toHaveCount(0);

  await resumen().getByRole('button', { name: 'Cancelar ese pedido' }).click();
  await resumen().getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(cliente.getByText(/Cancelamos el pedido PED-\d{6}/)).toBeVisible();
  await expect(aviso).toHaveCount(0);
  await expect(resumen().getByRole('button', { name: 'Hacer el pedido y recargar' })).toBeVisible();
});

test('recargar y pagar: el pedido espera la recarga y se puede cancelar en su página', async () => {
  await resumen().getByRole('button', { name: 'Hacer el pedido y recargar' }).click();
  await expect(cliente.getByRole('heading', { name: /Pedido PED-\d{6} creado/ })).toBeVisible();
  await expect(cliente.getByText(/Reporta una recarga de \$19\.48/)).toBeVisible();
  await cliente.getByRole('link', { name: 'Reportar mi recarga' }).click();
  await expect(cliente).toHaveURL(/\/cuenta\/billetera\?pedido=/);
  await expect(cliente.getByText(/Pedido PED-\d{6} por pagar/)).toBeVisible();

  const id = new URL(cliente.url()).searchParams.get('pedido');
  await cliente.goto(`/cuenta/carrito/${id}`);
  await expect(cliente.getByText('Esperando tu recarga')).toBeVisible();
  await expect(cliente.getByRole('link', { name: 'Reportar mi recarga' })).toBeVisible();
  await cliente.getByRole('button', { name: 'Cancelar el pedido' }).click();
  await cliente.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(
    cliente.getByText('Este pedido se canceló y sus facturas quedaron anuladas.'),
  ).toBeVisible();
});

test('pagar con mi saldo: con saldo suficiente el pedido queda pagado al instante', async () => {
  // La administración acredita saldo al cliente (ajuste con motivo).
  const lista = await admin.request.get('/api/v1/clientes?busqueda=cliente%40nv.test');
  const { elementos } = (await lista.json()) as { elementos: { id: string }[] };
  const ajuste = await admin.request.post(
    `/api/v1/billeteras/clientes/${elementos[0]?.id}/ajustes`,
    {
      headers: origen,
      data: { montoUsd: '25.00', motivo: 'Saldo para la prueba del carrito' },
    },
  );
  expect(ajuste.ok()).toBe(true);

  await llenarCarrito();
  await expect(resumen().getByText(/Tu saldo: \$25\.00/)).toBeVisible();
  await expect(resumen().getByRole('radio', { name: /Pagar con mi saldo/ })).toBeChecked();
  await resumen().getByRole('button', { name: 'Pagar con mi saldo' }).click();
  await expect(cliente.getByRole('heading', { name: /Pedido PED-\d{6} pagado/ })).toBeVisible();
  await expect(cliente.getByText('Tus planes ya están pagados con tu saldo.')).toBeVisible();
  await expect(cliente.getByRole('link', { name: 'Ir a mis servicios' })).toHaveAttribute(
    'href',
    '/cuenta',
  );

  // El carrito quedó vacío y el pedido figura pagado.
  await cliente.goto('/carrito');
  await expect(cliente.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
  await cliente.goto('/cuenta/carrito');
  await expect(
    cliente
      .getByRole('link', { name: /Pedido PED-\d{6} · 2 planes/ })
      .first()
      .getByText('Pagado'),
  ).toBeVisible();
});
