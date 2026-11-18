import type { CatalogoPublico } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/** Plataformas como en el Gestor: la grilla, la página de una plataforma y agregar desde un lugar libre. */
test.beforeAll(() => reiniciarLimiteIngreso());

test('abre una plataforma, ve sus cuentas en tarjetas y agrega un cliente en 4 pasos con el contrato', async ({
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

  // La tarjeta muestra el correo completo, como en el Gestor.
  const tarjeta = page
    .getByRole('listitem')
    .filter({ hasText: correo })
    .filter({ hasText: '0/3' })
    .first();
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.getByRole('button', { name: 'Ver la contraseña' })).toBeVisible();

  // Tocar el perfil libre abre «Agregar cliente» directo en el paso 2.
  await tarjeta.getByRole('button', { name: /^Perfil 1:/ }).click();
  const alta = page.getByRole('dialog', { name: `Agregar cliente — ${plan.servicio.nombre}` });
  await expect(alta.getByRole('heading', { name: 'Datos del cliente' })).toBeVisible();
  await expect(alta.getByLabel('Así queda el contrato')).toContainText(correo);
  await alta.getByLabel('Nombre del cliente').fill(nombre);
  await alta.getByLabel('Responsable').fill(`Revendedor ${sufijo}`);
  await alta.getByLabel('Número WhatsApp').fill('584121234567');
  await alta.getByRole('button', { name: 'Siguiente' }).click();

  await expect(alta.getByRole('heading', { name: 'Plazo y precio' })).toBeVisible();
  await alta.getByRole('button', { name: '3 meses' }).click();
  await expect(alta.getByText(/Vence el/)).toBeVisible();
  await alta.getByRole('button', { name: 'Guardar' }).click();

  await expect(alta.getByText('Cliente agregado')).toBeVisible();
  const contrato = alta.getByRole('textbox', { name: 'Contrato' });
  await expect(contrato).toHaveValue(/CONTRATO – FACTURA DE SERVICIO/);
  await expect(contrato).toHaveValue(new RegExp(correo.replace(/\./g, '\\.')));
  await expect(alta.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/584121234567\?text=/,
  );

  // «Agregar otro» vuelve al paso 1 (dónde va el cliente).
  await alta.getByRole('button', { name: 'Agregar otro' }).click();
  await expect(alta.getByRole('heading', { name: '¿Dónde va el cliente?' })).toBeVisible();
  await alta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(alta).toBeHidden();

  // La tarjeta ya muestra al cliente con su responsable.
  const llena = page
    .getByRole('listitem')
    .filter({ hasText: correo })
    .filter({ hasText: '1/3' })
    .first();
  await expect(llena).toContainText(nombre);
  await expect(llena).toContainText(`Revendedor ${sufijo}`);

  // Vista Clientes: grilla de plataformas arriba y la lista con responsable.
  await page.getByRole('button', { name: 'Ver clientes' }).click();
  await page.getByRole('searchbox').fill(nombre);
  const fila = page.getByRole('listitem').filter({ hasText: nombre }).first();
  await expect(fila).toContainText(`Revendedor ${sufijo}`);
  await expect(fila).toContainText(correo);
  await expect(fila.getByRole('link', { name: 'Renovar' })).toBeVisible();
});
