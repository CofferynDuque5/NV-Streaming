import type { CatalogoPublico } from '@nv/shared';
import { expect, test } from '@playwright/test';
import { ejecutarSql, entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * Caídas y reposición: el cliente con perfil en una cuenta caída pasa a un
 * perfil libre de otra cuenta del mismo servicio, con los días perdidos.
 */
test.beforeAll(() => reiniciarLimiteIngreso());

test('una cuenta caída manda a su cliente a la cola y se repone en otra cuenta', async ({
  page,
}) => {
  // Varias llamadas a la base y la verificación en dos pasos: en CI pasa de 30 s.
  test.setTimeout(90_000);
  // Nombres únicos por intento: un reintento no choca con lo que dejó el anterior.
  const sufijo = Date.now().toString(36);
  const nombre = `Cliente Caída ${sufijo}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const api = (ruta: string) => `/api/v1${ruta}`;
  const catalogo = (await (await page.request.get(api('/catalogo'))).json()) as CatalogoPublico;
  const plan = catalogo.planes.find((p) => p.tipo === 'suscripcion' && p.entrega === 'alquiler')!;

  ejecutarSql(`
    INSERT INTO clientes (id, nombre, actualizado_en) VALUES (gen_random_uuid(), '${nombre}', now());
    INSERT INTO suscripciones (id, cliente_id, plan_id, estado, moneda, inicio_en, vence_en, actualizado_en)
    SELECT gen_random_uuid(), c.id, '${plan.id}'::uuid, 'activa', 'USD', now(), now() + interval '20 days', now()
    FROM clientes c WHERE c.nombre = '${nombre}';
  `);
  const crear = async (usuario: string) => {
    const r = await page.request.post(api('/cuentas'), {
      data: { servicioId: plan.servicio.id, usuario, clave: 'Clave-de-prueba-1', perfiles: 2 },
      headers: { origin },
    });
    expect(r.status()).toBe(201);
    return (await r.json()) as { id: string; listaPerfiles: { id: string }[] };
  };
  const caida = await crear(`cuenta.caida.${sufijo}@example.com`);
  // Una cuenta activa del mismo servicio con perfiles libres.
  await crear(`cuenta.nueva.${sufijo}@example.com`);
  const busqueda = await page.request.get(api('/suscripciones?porPagina=100&estado=activa'));
  const suscripcion = (
    (await busqueda.json()) as { elementos: { id: string; cliente: { nombre: string } }[] }
  ).elementos.find((s) => s.cliente.nombre === nombre)!;
  const asignar = await page.request.post(
    api(`/cuentas/${caida.id}/perfiles/${caida.listaPerfiles[0]!.id}/asignar`),
    { data: { suscripcionId: suscripcion.id }, headers: { origin } },
  );
  expect(asignar.status()).toBe(201);
  const marcar = await page.request.patch(api(`/cuentas/${caida.id}`), {
    data: { estado: 'caida' },
    headers: { origin },
  });
  expect(marcar.status(), await marcar.text()).toBe(200);
  // Se cayó hace 2 días.
  ejecutarSql(
    `UPDATE cuentas_servicio SET caida_en = now() - interval '2 days 1 minute' WHERE id = '${caida.id}'::uuid;`,
  );

  await page.goto('/admin/cuentas');
  await page.getByRole('link', { name: 'Caídas y reposición' }).click();
  await expect(page).toHaveURL(/\/admin\/cuentas\/reposicion$/);
  const grupo = page.getByRole('region').filter({ hasText: nombre });
  await expect(grupo.getByText(/\(2 días\)/)).toBeVisible();
  await expect(
    page.getByLabel('Sumar al vencimiento los días que estuvieron sin servicio'),
  ).toBeChecked();
  await grupo.getByRole('button', { name: `Reponer a ${nombre}` }).click();
  await expect(page.getByText(new RegExp(`${nombre} pasó a .+ de`))).toBeVisible();
  await expect(page.getByText(/con 2 días más/)).toBeVisible();
  await expect(page.getByRole('button', { name: `Reponer a ${nombre}` })).toHaveCount(0);
});
