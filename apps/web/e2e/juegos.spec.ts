import { expect, test } from '@playwright/test';
import { ejecutarSql } from './ayudas';

/**
 * Recarga de un juego (ficticio): paquetes agrupados por tipo, datos del
 * jugador en la ficha y el carrito que los recuerda.
 */
test.beforeAll(() => {
  ejecutarSql(`
    INSERT INTO servicios (id, proveedor_id, nombre, slug, categoria, descripcion, datos_requeridos, actualizado_en)
    SELECT gen_random_uuid(), id, 'Arena Prueba', 'arena-prueba', 'juegos', 'Juego de prueba.',
      '[{"clave":"id-de-jugador","etiqueta":"ID de jugador","ayuda":"Lo ves en tu perfil","obligatorio":true,"tipo":"numero","opciones":[],"largo":12},
        {"clave":"zona","etiqueta":"Zona","ayuda":null,"obligatorio":true,"tipo":"numero","opciones":[],"largo":6}]'::jsonb,
      now()
    FROM proveedores ORDER BY creado_en LIMIT 1
    ON CONFLICT (slug) DO NOTHING;
    INSERT INTO planes (id, servicio_id, nombre, precio_usd, tipo, duracion_cantidad, duracion_unidad, renovable, orden, actualizado_en)
    SELECT gen_random_uuid(), s.id, p.nombre, p.precio::numeric, p.tipo::"TipoPlan", 1, 'mes', false, p.orden, now()
    FROM servicios s, (VALUES
      ('86 diamantes', '1.20', 'recarga', 1),
      ('172 diamantes', '2.30', 'recarga', 2),
      ('Pase semanal', '1.90', 'pase', 3),
      ('Caja de skins', '3.50', 'suministro', 4)
    ) AS p(nombre, precio, tipo, orden)
    WHERE s.slug = 'arena-prueba'
      AND NOT EXISTS (SELECT 1 FROM planes x WHERE x.servicio_id = s.id);
  `);
});

test('una recarga pide el ID de jugador en la ficha y el carrito lo recuerda', async ({ page }) => {
  await page.goto('/catalogo/arena-prueba?moneda=USD');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arena Prueba');

  // Pestañas por tipo: Monedas, Suministros y Pases; nada de «1 mes».
  const tipos = page.getByRole('group', { name: 'Tipo de producto' });
  await expect(tipos.getByRole('button')).toHaveText([/Monedas/, /Suministros/, /Pases/]);
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Monedas' })).not.toContainText('mes');
  await tipos.getByRole('button', { name: /Pases/ }).click();
  await expect(page.getByRole('radio', { name: /Pase semanal/ })).toBeChecked();
  await tipos.getByRole('button', { name: /Monedas/ }).click();
  await page.getByRole('radio', { name: /172 diamantes/ }).check();

  // Sin el ID no se agrega: lleva al campo y explica qué falta.
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByText('Escribe ID de jugador.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carrito, 1 plan' })).toHaveCount(0);

  // Solo números: las letras no entran.
  await page.getByLabel('ID de jugador').fill('12ab345');
  await expect(page.getByLabel('ID de jugador')).toHaveValue('12345');
  await page.getByLabel('Zona').fill('2001');
  await expect(page.getByText('Datos completos.', { exact: false })).toBeVisible();
  await expect(page.getByText('ID de jugador: 12345 · Zona: 2001')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.getByRole('button', { name: 'Carrito, 1 plan' })).toBeVisible();

  // Al volver, recuerda los datos de este juego en este navegador.
  await page.reload();
  await expect(page.getByLabel('ID de jugador')).toHaveValue('12345');
});
