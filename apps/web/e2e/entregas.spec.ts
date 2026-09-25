import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, ingresar, reiniciarLimiteIngreso } from './ayudas';

/** PNG mínimo válido de 1×1 píxel, como comprobante de pago. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const CODIGO = 'NVOR-E2E-7788';

// Se ejecuta en su propio proyecto, después de roles.spec.ts (el equipo ya tiene 2FA).
test.describe.configure({ mode: 'serial' });
// Corre al final de la suite: el límite de inicios de sesión por IP ya está casi agotado.
test.beforeAll(() => reiniciarLimiteIngreso());

async function salir(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await page.waitForURL(/\/ingresar/);
}

test('el cliente paga NV Originals, operación completa la entrega y el cliente ve su código', async ({
  page,
}) => {
  // 1. El cliente contrata el pase de NV Originals y reporta el pago.
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto('/cuenta/planes?moneda=VES');
  const plan = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Pase 30 días' }),
  });
  await plan.getByRole('button', { name: 'Contratar' }).click();
  await plan.getByRole('button', { name: 'Confirmar y ver cómo pagar' }).click();
  await expect(page).toHaveURL(/\/cuenta\/facturas\/[0-9a-f-]{36}$/);
  await page.getByLabel('Número de referencia').fill('00778899');
  await page.locator('input[type=file]').setInputFiles({
    name: 'pago.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(page.getByText('Recibimos tu comprobante')).toBeVisible();
  const numero = (await page.getByRole('heading', { name: /^Factura NV-/ }).innerText()).replace(
    'Factura ',
    '',
  );
  await salir(page);

  // 2. Operación concilia el pago: se crea la entrega manual.
  await entrarEquipo(page, 'operador@nv.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/cobros?vista=conciliar');
  const pago = page.getByRole('listitem').filter({ hasText: numero });
  await pago.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await pago.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(pago).toHaveCount(0);

  // 3. Operación la completa desde el cajón de detalle: rechaza credenciales.
  await page.getByRole('link', { name: 'Entregas', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Entregas', level: 1 })).toBeVisible();
  const fila = page.getByRole('row').filter({ hasText: 'Pase 30 días' });
  await expect(fila.getByText('Pendiente')).toBeVisible();
  await fila.getByRole('link').first().click();
  const cajon = page.getByRole('dialog', { name: /Entrega a Cliente Demo/ });
  await expect(cajon).toBeVisible();
  await cajon.getByRole('button', { name: 'Completar a mano' }).click();
  await cajon
    .getByLabel('Pasos para activar el servicio')
    .fill('Entra con usuario: demo@correo.com y contraseña: Clave1234');
  await cajon.getByRole('button', { name: 'Marcar como entregada' }).click();
  await expect(cajon.getByText(/nunca entrega usuarios ni contraseñas/).last()).toBeVisible();
  await cajon
    .getByLabel('Pasos para activar el servicio')
    .fill('Abre la app NV Originals, elige «Canjear» y pega el código.');
  await cajon.getByLabel('Código de activación').fill(CODIGO);
  await cajon.getByRole('button', { name: 'Marcar como entregada' }).click();
  await expect(cajon.getByText('Entregada', { exact: true }).first()).toBeVisible();
  // El equipo nunca ve el código.
  await expect(page.getByText(CODIGO)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cajon).toHaveCount(0);
  await salir(page);

  // 4. El cliente muestra su código con confirmación.
  await ingresar(page, 'cliente@nv.test');
  await page.getByRole('link', { name: 'Mis accesos' }).first().click();
  await expect(page.getByRole('heading', { name: 'Mis accesos', level: 1 })).toBeVisible();
  const acceso = page.getByRole('article').filter({ hasText: 'Pase 30 días' });
  await expect(acceso.getByText('Listo', { exact: true })).toBeVisible();
  await expect(acceso.getByText(CODIGO)).toHaveCount(0);
  await acceso.getByRole('button', { name: 'Mostrar código' }).click();
  const dialogo = page.getByRole('dialog', { name: '¿Mostrar el acceso?' });
  await expect(dialogo.getByText(/No compartas este código/)).toBeVisible();
  await dialogo.getByRole('button', { name: 'Mostrar', exact: true }).click();
  await expect(acceso.getByText(CODIGO)).toBeVisible();
  await expect(acceso.getByRole('button', { name: 'Copiar el código' })).toBeVisible();
  await expect(acceso.getByText(/No compartas este código/)).toBeVisible();

  // En un teléfono de 360 px la página no se desborda.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis accesos', level: 1 })).toBeVisible();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(360);
});

test('administración sube un lote de códigos sin volver a verlos', async ({ page }) => {
  await entrarEquipo(page, 'admin@nv.test');
  await expect(page).toHaveURL(/\/admin$/);

  // La entrega del distribuidor de demostración usa códigos de inventario.
  await page.goto('/admin/catalogo');
  await page.getByRole('link', { name: 'Entrega de Distribuidor de demostración' }).click();
  await expect(page.getByRole('radio', { name: /Códigos de inventario/ })).toBeChecked();

  await page.getByRole('link', { name: 'Inventario de códigos' }).first().click();
  const fila = page.getByRole('row').filter({ hasText: 'Tarjeta 30 días' });
  await expect(fila).toContainText('10');
  await fila.getByRole('link').first().click();
  await page.getByRole('button', { name: 'Subir lote de códigos' }).click();
  await page.getByLabel('Nombre del lote').fill('Lote e2e');
  await page
    .getByRole('textbox', { name: 'Códigos' })
    .fill(['codigo', 'E2E-AAAA-0001', 'e2e aaaa 0001', 'E2E-AAAA-0002'].join('\n'));
  await page.getByRole('button', { name: 'Subir lote', exact: true }).click();
  await expect(page.getByText('2 códigos nuevos, 1 repetido en el archivo')).toBeVisible();
  await expect(page.getByText('E2E-AAAA-0001')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Lote e2e' }).first()).toBeVisible();

  // Operación no tiene acceso al inventario.
  await salir(page);
  await entrarEquipo(page, 'operador@nv.test');
  await expect(page.getByRole('link', { name: 'Inventario de códigos' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Entregas', exact: true }).first()).toBeVisible();
});
