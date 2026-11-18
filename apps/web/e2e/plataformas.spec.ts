import type { CatalogoPublico } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/** Plataformas como en el Gestor: la grilla, la página de una plataforma y agregar desde un lugar libre. */
test.beforeAll(() => reiniciarLimiteIngreso());

test('abre una plataforma, ve sus cuentas en tarjetas y agrega un cliente a un perfil libre', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const sufijo = Date.now().toString(36);
  const nombre = `Cliente Plataforma ${sufijo}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const api = (ruta: string) => `/api/v1${ruta}`;
  const catalogo = (await (await page.request.get(api('/catalogo'))).json()) as CatalogoPublico;
  const plan = catalogo.planes.find((p) => p.tipo === 'suscripcion' && p.entrega === 'alquiler')!;
  const correo = `plataforma.${sufijo}@example.com`;
  const r = await page.request.post(api('/cuentas'), {
    data: {
      servicioId: plan.servicio.id,
      usuario: correo,
      clave: 'Clave-de-prueba-3',
      perfiles: 3,
    },
    headers: { origin },
  });
  expect(r.status()).toBe(201);

  // El inventario viejo lleva a Plataformas.
  await page.goto('/admin/inventario');
  await expect(page).toHaveURL(/\/admin\/plataformas$/);
  await page
    .locator('#contenido')
    .getByRole('link', { name: new RegExp(plan.servicio.nombre) })
    .first()
    .click();
  await expect(page.getByRole('tab', { name: /Cuentas completas/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const tarjeta = page
    .getByRole('listitem')
    .filter({ hasText: 'pl•••@example.com' })
    .filter({ hasText: '0/3' })
    .first();
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole('button', { name: /^Perfil 1:/ }).click();
  await page.getByRole('button', { name: 'Agregar cliente a Perfil 1' }).click();
  const alta = page.getByRole('dialog', { name: 'Agregar cliente a Perfil 1' });
  await alta.getByRole('button', { name: 'Siguiente' }).click();
  await alta.getByText('Cliente nuevo').click();
  await alta.getByLabel('Nombre').fill(nombre);
  await alta.getByRole('button', { name: 'Siguiente' }).click();
  await alta.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(alta).toBeHidden();
  await expect(page.getByRole('dialog', { name: `Mensaje para ${nombre}` })).toBeVisible();
  await page
    .getByRole('dialog', { name: `Mensaje para ${nombre}` })
    .getByRole('button', { name: 'Cancelar' })
    .click();

  // Aparece en la pestaña de clientes de la plataforma.
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Clientes/ }).click();
  await page.getByRole('searchbox').fill(nombre);
  await expect(page.getByRole('link', { name: nombre }).first()).toBeVisible();
});
