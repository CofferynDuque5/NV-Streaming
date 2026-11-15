import { expect, test } from '@playwright/test';
import { ejecutarSql, entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * Bandeja de WhatsApp en Soporte: lo que escribe un cliente aparece en la
 * bandeja; sin el número vinculado, ofrece vincularlo y no deja responder.
 */
test.beforeAll(() => reiniciarLimiteIngreso());

test('un mensaje de WhatsApp sale en la bandeja, se lee y ofrece vincular el número', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const telefono = `58414${String(Date.now()).slice(-7)}`;
  ejecutarSql(`
    WITH c AS (
      INSERT INTO conversaciones_whatsapp (id, telefono, nombre, ultimo_entrante_en, ultimo_mensaje_en, no_leidos, actualizada_en)
      VALUES (gen_random_uuid(), '${telefono}', 'Ana WhatsApp ${telefono}', now(), now(), 1, now())
      RETURNING id
    )
    INSERT INTO mensajes_whatsapp (id, conversacion_id, direccion, texto)
    SELECT gen_random_uuid(), id, 'entrante', 'Hola, no me entra Netflix ${telefono}' FROM c;
  `);

  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/soporte');
  await page.locator('#contenido').getByRole('link', { name: 'WhatsApp', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/soporte\/whatsapp$/);
  // El administrador ve cómo vincular el número con un código QR (no se pulsa: conectaría con WhatsApp).
  await page.getByRole('button', { name: 'Vincular número' }).click();
  const vinculo = page.getByRole('dialog', { name: 'Número de WhatsApp de la empresa' });
  await expect(vinculo.getByRole('button', { name: 'Mostrar código QR' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(vinculo).toBeHidden();

  const lista = page.getByRole('navigation', { name: 'Conversaciones de WhatsApp' });
  await lista.getByRole('link', { name: new RegExp(`Ana WhatsApp ${telefono}`) }).click();
  const conversacion = page.getByRole('region', { name: 'Conversación' });
  await expect(conversacion.getByText(`Hola, no me entra Netflix ${telefono}`)).toBeVisible();
  await expect(conversacion.getByLabel('Respuesta por WhatsApp')).toBeDisabled();

  // Buscar dentro del chat resalta lo encontrado.
  await conversacion.getByRole('button', { name: 'Buscar en este chat' }).click();
  await conversacion.getByRole('textbox', { name: 'Buscar en este chat' }).fill('netflix');
  await expect(conversacion.getByText('1 de 1')).toBeVisible();
  await expect(conversacion.locator('mark')).toHaveText('Netflix');

  await conversacion.getByRole('button', { name: 'Cerrar la búsqueda' }).click();
  await conversacion.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(conversacion.getByRole('button', { name: 'Reabrir' })).toBeVisible();
  await lista.getByRole('link', { name: 'Cerradas' }).click();
  await expect(
    lista.getByRole('link', { name: new RegExp(`Ana WhatsApp ${telefono}`) }),
  ).toBeVisible();
});
