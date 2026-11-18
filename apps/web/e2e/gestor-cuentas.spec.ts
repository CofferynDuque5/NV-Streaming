import type { CatalogoPublico } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { ejecutarSql, entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * Lo del Gestor en la ficha de una cuenta: mover a un cliente a otro perfil,
 * cortarlo con clave nueva y avisar los datos nuevos a los que siguen.
 */
test.beforeAll(() => reiniciarLimiteIngreso());

test('mueve, corta con clave nueva y avisa a los que siguen en la cuenta', async ({ page }) => {
  test.setTimeout(90_000);
  const sufijo = Date.now().toString(36);
  const uno = `Cliente Uno ${sufijo}`;
  const dos = `Cliente Dos ${sufijo}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const api = (ruta: string) => `/api/v1${ruta}`;
  const catalogo = (await (await page.request.get(api('/catalogo'))).json()) as CatalogoPublico;
  const plan = catalogo.planes.find((p) => p.tipo === 'suscripcion' && p.entrega === 'alquiler')!;

  ejecutarSql(`
    INSERT INTO clientes (id, nombre, actualizado_en) VALUES
      (gen_random_uuid(), '${uno}', now()), (gen_random_uuid(), '${dos}', now());
    INSERT INTO suscripciones (id, cliente_id, plan_id, estado, moneda, inicio_en, vence_en, actualizado_en)
    SELECT gen_random_uuid(), c.id, '${plan.id}'::uuid, 'activa', 'USD', now(), now() + interval '20 days', now()
    FROM clientes c WHERE c.nombre IN ('${uno}', '${dos}');
  `);
  const r = await page.request.post(api('/cuentas'), {
    data: {
      servicioId: plan.servicio.id,
      usuario: `gestor.${sufijo}@example.com`,
      clave: 'Clave-de-prueba-1',
      perfiles: 3,
    },
    headers: { origin },
  });
  expect(r.status()).toBe(201);
  const cuenta = (await r.json()) as { id: string; listaPerfiles: { id: string }[] };
  const busqueda = await page.request.get(api('/suscripciones?porPagina=100&estado=activa'));
  const subs = (
    (await busqueda.json()) as { elementos: { id: string; cliente: { nombre: string } }[] }
  ).elementos;
  for (const [i, nombre] of [uno, dos].entries()) {
    const s = subs.find((x) => x.cliente.nombre === nombre)!;
    const a = await page.request.post(
      api(`/cuentas/${cuenta.id}/perfiles/${cuenta.listaPerfiles[i]!.id}/asignar`),
      { data: { suscripcionId: s.id }, headers: { origin } },
    );
    expect(a.status()).toBe(201);
  }

  await page.goto(`/admin/cuentas/${cuenta.id}`);
  // Mover al segundo cliente al perfil 3.
  await page.getByRole('button', { name: 'Mover Perfil 2' }).click();
  const mover = page.getByRole('dialog', { name: `Mover a ${dos}` });
  await mover.getByRole('button', { name: 'Perfil 3', exact: true }).click();
  await mover.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(mover).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: 'Perfil 3' })).toContainText(dos);

  // Cortar al primero con clave nueva: se abre el aviso para el que sigue.
  await page.getByRole('button', { name: 'Cortar Perfil 1' }).click();
  const corte = page.getByRole('dialog', { name: 'Cortar y liberar' });
  await corte.getByText('Nueva contraseña').click();
  await expect(corte.getByLabel('Contraseña nueva')).not.toHaveValue('');
  await expect(corte.getByText('Avisar la clave nueva a la persona que sigue')).toBeVisible();
  await corte.getByRole('button', { name: 'Confirmar corte' }).click();
  const aviso = page.getByRole('dialog', { name: 'Avisar datos nuevos' });
  await expect(aviso.getByText('Cambiaste la contraseña de esta cuenta')).toBeVisible();
  await aviso.getByRole('button', { name: 'Armar mensajes' }).click();
  await expect(aviso.getByText('0 de 1 avisados')).toBeVisible();
  await expect(aviso.getByText(dos)).toBeVisible();
  await aviso.getByRole('button', { name: 'Marcar enviado' }).click();
  await expect(aviso.getByText('1 de 1 avisados')).toBeVisible();
  await aviso.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Perfil 1' })).toContainText('Libre');
});
