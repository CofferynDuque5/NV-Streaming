import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/** «Crear plataforma» y la importación del Gestor cuando la plataforma aún no existe. */
test.beforeAll(() => reiniciarLimiteIngreso());

test('crea una plataforma desde Plataformas y queda lista para agregarle cuentas', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const nombre = `Plataforma ${Date.now().toString(36)}`;
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/plataformas');
  await page.getByRole('button', { name: 'Crear plataforma' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Crear plataforma' });
  await dialogo.getByLabel('Nombre de la plataforma').fill(nombre);
  if (process.env.CAPTURAS) {
    await dialogo.getByLabel('Nombre de la plataforma').fill('Crunchyroll');
    await dialogo.getByLabel('Precio para el cliente (USD)').fill('4.00');
    await page.screenshot({ path: `${process.env.CAPTURAS}/crear-plataforma.png` });
    await dialogo.getByLabel('Precio para el cliente (USD)').fill('');
    await dialogo.getByLabel('Nombre de la plataforma').fill(nombre);
  }
  // Sin precio el plan queda oculto en la tienda (y no se cruza con las otras pruebas).
  await dialogo.getByRole('button', { name: 'Crear plataforma' }).click();
  await expect(page).toHaveURL(/\/admin\/plataformas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: nombre })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Cuentas completas/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Cuentas individuales/ })).toBeVisible();

  // Sale en la grilla aunque todavía no tenga cuentas.
  await page.goto('/admin/plataformas');
  await expect(
    page.locator('#contenido').getByRole('link', { name: new RegExp(nombre) }),
  ).toBeVisible();

  // Con el mismo nombre no se duplica.
  await page.getByRole('button', { name: 'Crear plataforma' }).click();
  await page
    .getByRole('dialog', { name: 'Crear plataforma' })
    .getByLabel('Nombre de la plataforma')
    .fill(nombre);
  await page
    .getByRole('dialog', { name: 'Crear plataforma' })
    .getByRole('button', { name: 'Crear plataforma' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Crear plataforma' })).toContainText('Ya existe');
  await page
    .getByRole('dialog', { name: 'Crear plataforma' })
    .getByRole('button', { name: 'Cancelar' })
    .click();

  // Sin cuentas se puede quitar de la lista.
  await page
    .locator('#contenido')
    .getByRole('link', { name: new RegExp(nombre) })
    .click();
  await page.getByRole('button', { name: 'Quitar plataforma' }).click();
  await page
    .getByRole('dialog', { name: 'Quitar plataforma' })
    .getByRole('button', { name: 'Quitar plataforma' })
    .click();
  await expect(page).toHaveURL(/\/admin\/plataformas$/);
  await expect(
    page.locator('#contenido').getByRole('link', { name: new RegExp(nombre) }),
  ).toHaveCount(0);
});

test('importa del Gestor una plataforma que no existía, con cuentas completas e individuales', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const s = Date.now().toString(36);
  const plat = `Streaming ${s}`;
  const respaldo = {
    db: {
      platforms: [{ id: 'p1', name: plat }],
      accounts: {
        p1: [
          {
            id: 'a1',
            email: `completa.${s}@example.com`,
            password: 'Clave-1',
            numProfiles: 3,
            facturacion: '2027-01-10',
            costoCuenta: 8,
          },
        ],
      },
      clients: {
        p1: [
          {
            id: 'c1',
            accountId: 'a1',
            slotIndex: 0,
            nombre: 'Luis',
            apellido: 'Mora',
            contacto: '04121234567',
            vencimientoCliente: '2027-01-05',
            precioVenta: 3,
            pin: '1234',
          },
          {
            id: 'c2',
            accountId: '',
            isClientAccount: true,
            email: `individual.${s}@example.com`,
            password: 'Clave-2',
            nombre: 'Julia',
            apellido: 'Vega',
            contacto: '04141234567',
            vencimientoCliente: '2027-01-16',
            precioVenta: 3,
          },
        ],
      },
    },
    version: '3.0-firebase',
  };
  const archivo = info.outputPath('respaldo-gestor.json');
  writeFileSync(archivo, JSON.stringify(respaldo));

  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/plataformas');
  await page.getByRole('link', { name: 'Importar del Gestor' }).click();
  await page.locator('input[type=file]').setInputFiles(archivo);
  const fila = page.getByRole('listitem').filter({ hasText: plat });
  await expect(fila).toContainText('2 cuentas');

  // No existe en el catálogo: se crea desde aquí con el precio que más pagan sus clientes.
  await fila.getByRole('button', { name: `Crear «${plat}»` }).click();
  const dialogo = page.getByRole('dialog', { name: 'Crear plataforma' });
  await expect(dialogo.getByLabel('Precio para el cliente (USD)')).toHaveValue('3.00');
  // Oculto en la tienda: las demás pruebas toman el primer plan de alquiler del catálogo.
  await dialogo.getByLabel('Precio para el cliente (USD)').fill('');
  await dialogo.getByRole('button', { name: 'Crear plataforma' }).click();
  await expect(dialogo).toBeHidden();

  await fila.getByRole('button', { name: 'Simular' }).click();
  await fila.getByRole('button', { name: 'Importar 2 cuentas' }).click();
  await expect(fila).toContainText('Importada');

  await page.goto('/admin/plataformas');
  await page
    .locator('#contenido')
    .getByRole('link', { name: new RegExp(plat) })
    .click();
  await expect(page.getByRole('tab', { name: /Cuentas completas\s*1/ })).toBeVisible();
  await page.getByRole('tab', { name: /Cuentas individuales/ }).click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: `individual.${s}@example.com` })
      .first(),
  ).toBeVisible();
});
