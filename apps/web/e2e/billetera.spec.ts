import { formatearMonto } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { ejecutarSql, entrarEquipo, ingresar } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de la recarga. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const comprobante = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1X1 });

const usd = (v: number) => formatearMonto(v.toFixed(2), 'USD');
/** Tasa de ejemplo de la semilla: 1 USD = 150 VES. */
const TASA_VES = 150;

// Los tres casos van en orden: el segundo parte de lo que dejó el primero.
test.describe.configure({ mode: 'serial' });

/** Id de la recarga más reciente del cliente, leída desde su sesión. */
async function ultimaRecarga(cliente: Page): Promise<string> {
  const r = await cliente.request.get('/api/v1/mi/billetera/recargas?porPagina=1');
  const { elementos } = (await r.json()) as { elementos: { id: string }[] };
  return elementos[0]!.id;
}

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
  await expect(cliente.getByText(`Te faltan ${usd(total)}.`, { exact: false })).toBeVisible();
  await expect(cliente.getByRole('button', { name: /Lo que falta/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await cliente
    .getByRole('group', { name: 'Moneda del pago' })
    .getByRole('button', { name: 'USD' })
    .click();
  await expect(
    cliente.getByRole('checkbox', { name: /Usar esta recarga para pagar el pedido PED-\d{6}/ }),
  ).toBeChecked();
  await cliente.getByRole('radio', { name: /Transferencia en dólares/ }).check();
  await cliente.getByLabel('Referencia (opcional)').fill('E2E-BIL-001');
  await cliente.locator('input[type=file]').setInputFiles(comprobante('recarga.png'));
  await cliente.getByRole('button', { name: `Reportar recarga de ${usd(total)}` }).click();
  await expect(cliente.getByRole('heading', { name: 'Recibimos tu recarga' })).toBeVisible();
  await expect(cliente.getByLabel(/^Código de la recarga B-[2-9A-Z]{8}$/)).toBeVisible();
  await expect(cliente.getByText(/Y pagamos tu pedido PED-\d{6} con ese saldo/)).toBeVisible();
  await expect(cliente.getByText('1 recarga en revisión')).toBeVisible();

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
  await cliente.context().close();
  await admin.context().close();
});

test('reportar una recarga: validación en vivo, errores, éxito, rechazo y envío de nuevo, y filtros', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const cliente = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await ingresar(cliente, 'cliente@nv.test');
  await expect(cliente).toHaveURL(/\/cuenta$/);
  await cliente.goto('/cuenta/billetera');
  await expect(cliente.getByRole('heading', { level: 1, name: 'Tu billetera' })).toBeVisible();

  // Cifras del mes con los movimientos reales de la prueba anterior.
  await expect(cliente.getByText('Entró en 30 días')).toBeVisible();
  await expect(cliente.getByText(`+${usd(15.99 + 54.99)}`).first()).toBeVisible();

  // Filtros de las recargas (con cuántas hay de cada estado) y de los movimientos.
  const recargas = cliente.getByRole('region', { name: 'Tus recargas' });
  await expect(recargas.getByRole('button', { name: 'Todas · 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await recargas.getByRole('button', { name: 'Rechazadas · 0' }).click();
  await expect(recargas.getByText('No hay recargas con ese estado.')).toBeVisible();
  await recargas.getByRole('button', { name: 'Ver todas' }).click();
  await expect(recargas.getByText(/E2E-BIL-001/)).toBeVisible();
  await recargas.getByRole('button', { name: 'Confirmadas · 1' }).click();
  await expect(recargas.getByText('Confirmada', { exact: true })).toBeVisible();

  const movimientos = cliente.getByRole('region', { name: 'Movimientos' });
  const filas = movimientos.getByRole('listitem');
  await expect(filas).toHaveCount(3);
  await movimientos.getByRole('button', { name: 'Pagos' }).click();
  await expect(filas).toHaveCount(2);
  await expect(filas.filter({ hasText: 'Pago de factura' })).toHaveCount(2);
  await movimientos.getByRole('button', { name: 'Recargas' }).click();
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Recarga confirmada');
  await movimientos.getByRole('button', { name: 'Ajustes' }).click();
  await expect(movimientos.getByText('No hay movimientos de ese tipo.')).toBeVisible();

  // Monto: validación en vivo.
  const otro = cliente.getByLabel('Otro monto en dólares');
  await otro.fill('abc');
  await expect(cliente.getByText('Usa solo números con hasta 2 decimales')).toBeVisible();
  await otro.fill('12,5');
  await expect(cliente.getByText('Monto listo')).toBeVisible();
  await cliente
    .getByRole('group', { name: 'Moneda del pago' })
    .getByRole('button', { name: 'VES' })
    .click();
  const enBs = formatearMonto((12.5 * TASA_VES).toFixed(2), 'VES');
  await expect(cliente.getByText(enBs).first()).toBeVisible();
  await expect(cliente.getByText('+$12.50').first()).toBeVisible();

  // Pago Móvil pide referencia: enviar sin ella ni comprobante marca los dos campos.
  await cliente.getByRole('radio', { name: /Pago Móvil/ }).check();
  const reportar = cliente.getByRole('button', { name: `Reportar recarga de ${enBs}` });
  await reportar.click();
  await expect(cliente.getByText('Revisa los 2 campos marcados en rojo.')).toBeVisible();
  await expect(cliente.getByText('Escribe el número de referencia del pago.')).toBeVisible();
  await expect(cliente.getByText('Adjunta la captura o el PDF del pago.')).toBeVisible();
  await cliente.getByLabel('Número de referencia').fill('E2E#BIL');
  await expect(cliente.getByText('Referencia lista')).toBeVisible();
  await cliente.locator('input[type=file]').setInputFiles(comprobante('pago-movil.png'));
  await expect(cliente.getByText('pago-movil.png')).toBeVisible();
  await expect(cliente.getByText('Revisa el campo marcado en rojo.')).toHaveCount(0);
  await reportar.click();
  await expect(cliente.getByRole('heading', { name: 'Recibimos tu recarga' })).toBeVisible();
  await expect(cliente.getByText(`Pago Móvil · ${enBs} · tasa fijada`)).toBeVisible();
  await expect(recargas.getByRole('button', { name: 'En revisión · 1' })).toBeVisible();

  // La administración la rechaza con un motivo.
  await entrarEquipo(admin, 'admin@nv.test');
  await expect(admin).toHaveURL(/\/admin$/);
  const origen = { origin: new URL(admin.url()).origin };
  const id = await ultimaRecarga(cliente);
  const no = await admin.request.post(`/api/v1/billeteras/recargas/${id}/rechazar`, {
    headers: origen,
    data: { motivo: 'No encontramos esa referencia en el banco.' },
  });
  expect(no.ok()).toBe(true);

  // El cliente ve el aviso y la envía de nuevo con el formulario ya lleno.
  await cliente.goto('/cuenta/billetera');
  await expect(cliente.getByText(/Rechazamos tu recarga B-[2-9A-Z]{8}/)).toBeVisible();
  await expect(
    cliente.getByText('No encontramos esa referencia en el banco.').first(),
  ).toBeVisible();
  await recargas.getByRole('button', { name: 'Rechazadas · 1' }).click();
  await expect(
    recargas.getByText('Motivo: No encontramos esa referencia en el banco.'),
  ).toBeVisible();
  await cliente.getByRole('alert').getByRole('button', { name: 'Enviar de nuevo' }).click();
  await expect(cliente.getByRole('radio', { name: /Pago Móvil/ })).toBeChecked();
  await expect(
    cliente.getByRole('group', { name: 'Moneda del pago' }).getByRole('button', { name: 'VES' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(cliente.getByText(`Mismo monto que reportaste: ${enBs}.`)).toBeVisible();
  await cliente.getByLabel('Número de referencia').fill('E2E-BIL-003');
  await cliente.locator('input[type=file]').setInputFiles(comprobante('pago-movil.png'));
  await cliente.getByRole('button', { name: `Reportar recarga de ${enBs}` }).click();
  await expect(cliente.getByRole('heading', { name: 'Recibimos tu recarga' })).toBeVisible();
  await expect(cliente.getByText(/Rechazamos tu recarga/)).toHaveCount(0);
  await expect(recargas.getByRole('button', { name: 'Todas · 3' })).toBeVisible();

  // Limpieza: el saldo del cliente queda en cero para las pruebas del carrito.
  const otraId = await ultimaRecarga(cliente);
  const fin = await admin.request.post(`/api/v1/billeteras/recargas/${otraId}/rechazar`, {
    headers: origen,
    data: { motivo: 'Cierre de la prueba e2e.' },
  });
  expect(fin.ok()).toBe(true);
  await cliente.context().close();
  await admin.context().close();
});

test('un cliente de un revendedor también tiene billetera y carrito, al precio público', async ({
  browser,
}) => {
  const ligar = (revendedor: string) =>
    ejecutarSql(
      `UPDATE clientes SET revendedor_id = ${revendedor} WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = 'cliente@nv.test');`,
    );
  const cliente = await (await browser.newContext()).newPage();
  await ingresar(cliente, 'cliente@nv.test');
  await expect(cliente).toHaveURL(/\/cuenta$/);
  ligar(
    "(SELECT r.id FROM revendedores r JOIN usuarios u ON u.id = r.usuario_id WHERE u.correo = 'revendedor@nv.test')",
  );
  try {
    await cliente.goto('/cuenta/billetera');
    await expect(cliente.getByRole('heading', { level: 1, name: 'Tu billetera' })).toBeVisible();
    await expect(cliente.getByRole('button', { name: 'Recargar saldo' }).first()).toBeVisible();
    await expect(cliente.getByText('Tu cuenta la gestiona tu revendedor')).toHaveCount(0);

    // El carrito cotiza en la API con el precio al público del plan, como a cualquier cliente.
    const cat = await (await cliente.request.get('/api/v1/catalogo')).json();
    const plan = cat.planes[0] as { id: string; precioUsd: string };
    const cot = await cliente.request.post('/api/v1/mi/pedidos/cotizar', {
      headers: { origin: new URL(cliente.url()).origin },
      data: { planes: [plan.id], moneda: 'USD' },
    });
    expect(cot.ok()).toBe(true);
    expect((await cot.json()).totalUsd).toBe(Number(plan.precioUsd).toFixed(2));

    await cliente.goto('/cuenta/carrito');
    await expect(cliente.getByRole('heading', { name: 'Tu carrito' })).toBeVisible();
  } finally {
    ligar('NULL');
    await cliente.context().close();
  }
});
