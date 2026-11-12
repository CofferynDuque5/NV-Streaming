import { expect, test } from '@playwright/test';
import { ejecutarSql, entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * Vencimientos y cortes: lo que vence mañana sale agrupado por plataforma y se
 * renueva por varios meses desde su ficha.
 */
test.beforeAll(() => {
  reiniciarLimiteIngreso();
  ejecutarSql(`
    INSERT INTO clientes (id, nombre, actualizado_en)
    SELECT gen_random_uuid(), 'Cliente Vence Mañana', now()
    WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'Cliente Vence Mañana');
    INSERT INTO suscripciones (id, cliente_id, plan_id, estado, moneda, inicio_en, vence_en, actualizado_en)
    SELECT gen_random_uuid(), c.id, p.id, 'activa', 'USD', now() - interval '29 days',
      date_trunc('day', now() AT TIME ZONE 'America/Caracas') AT TIME ZONE 'America/Caracas' + interval '36 hours', now()
    FROM clientes c,
      (SELECT id FROM planes WHERE renovable AND activo AND tipo = 'suscripcion'
         AND duracion_unidad = 'mes' AND duracion_cantidad = 1 ORDER BY orden, nombre LIMIT 1) p
    WHERE c.nombre = 'Cliente Vence Mañana'
      AND NOT EXISTS (SELECT 1 FROM suscripciones s WHERE s.cliente_id = c.id);
  `);
});

test('vencen mañana, por plataforma, y se renueva por 3 meses', async ({ page }) => {
  test.setTimeout(90_000);
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/suscripciones');
  await page.getByRole('link', { name: 'Vencimientos y cortes' }).click();
  await expect(page).toHaveURL(/\/admin\/suscripciones\/vencimientos$/);

  const manana = page.getByRole('region', { name: 'Vencen mañana' });
  await expect(manana.getByRole('heading', { name: /^Vencen mañana · \d+/ })).toBeVisible();
  await manana.getByRole('link', { name: /Cliente Vence Mañana/ }).click();
  await expect(page).toHaveURL(/\/admin\/suscripciones\/[0-9a-f-]+$/);

  await expect(page.getByLabel('Cuenta desde')).toHaveValue('vencimiento');
  await page.getByLabel('Cuánto renueva').selectOption('3');
  await page.getByLabel('Moneda de la factura').selectOption('USD');
  await page.getByRole('button', { name: 'Emitir factura' }).click();
  await page
    .getByRole('link', { name: /^NV-\d+/ })
    .first()
    .click();
  await expect(page.getByRole('cell', { name: '3', exact: true })).toBeVisible();
});
