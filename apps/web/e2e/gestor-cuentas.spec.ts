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
  // Se ve dónde está ahora y las cuentas con su correo y sus libres.
  await expect(mover.getByText('Ahora está en')).toBeVisible();
  const estaCuenta = mover
    .getByRole('listitem')
    .filter({ hasText: `gestor.${sufijo}@example.com` });
  await expect(estaCuenta).toContainText('esta cuenta');
  await estaCuenta.getByRole('button', { name: 'Perfil 3', exact: true }).click();
  await mover.getByRole('button', { name: 'Mover y armar mensaje' }).click();
  await expect(mover).toBeHidden();
  // Al moverlo se abre solo el mensaje con sus datos.
  const datos = page.getByRole('dialog', { name: `Mensaje para ${dos}` });
  await expect(datos).toBeVisible();
  await datos.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Perfil 3' })).toContainText(dos);

  // Cortar al primero con clave nueva: se abre el aviso para el que sigue.
  await page.getByRole('button', { name: 'Cortar Perfil 1' }).click();
  const corte = page.getByRole('dialog', { name: 'Cortar y liberar' });
  await corte.getByText('Nueva contraseña').click();
  await expect(corte.getByLabel('Contraseña nueva')).not.toHaveValue('');
  await expect(
    corte.getByText(/mensaje con la clave nueva para la persona que sigue/),
  ).toBeVisible();
  // Aún no vence: cortar antes de tiempo pide el motivo.
  await corte.getByLabel('Motivo del corte').fill('Pidió la baja antes de tiempo');
  await corte.getByRole('button', { name: 'Confirmar corte' }).click();
  const aviso = page.getByRole('dialog', { name: 'Avisar datos nuevos' });
  await expect(aviso.getByText('Cambiaste la contraseña de esta cuenta')).toBeVisible();
  await aviso.getByRole('button', { name: 'Armar mensajes' }).click();
  await expect(aviso.getByText('0 de 1 avisados')).toBeVisible();
  await expect(aviso.getByText(dos)).toBeVisible();
  await aviso.getByRole('button', { name: 'Marcar enviado' }).click();
  await expect(aviso.getByText('1 de 1 avisados')).toBeVisible();
  await aviso.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Perfil 1' })).toContainText('Libre');
});

test('agrega un cliente nuevo a un perfil libre en 3 pasos y abre el mensaje', async ({ page }) => {
  test.setTimeout(90_000);
  const sufijo = Date.now().toString(36);
  const nombre = `Cliente Alta ${sufijo}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const api = (ruta: string) => `/api/v1${ruta}`;
  const catalogo = (await (await page.request.get(api('/catalogo'))).json()) as CatalogoPublico;
  const plan = catalogo.planes.find((p) => p.tipo === 'suscripcion' && p.entrega === 'alquiler')!;
  const r = await page.request.post(api('/cuentas'), {
    data: {
      servicioId: plan.servicio.id,
      usuario: `alta.${sufijo}@example.com`,
      clave: 'Clave-de-prueba-2',
      perfiles: 2,
    },
    headers: { origin },
  });
  expect(r.status()).toBe(201);
  const cuenta = (await r.json()) as { id: string };

  await page.goto(`/admin/cuentas/${cuenta.id}`);
  await page.getByRole('button', { name: 'Agregar cliente a Perfil 1' }).click();
  const alta = page.getByRole('dialog', { name: 'Agregar cliente a Perfil 1' });
  await alta.getByRole('button', { name: 'Siguiente' }).click();
  await alta.getByText('Cliente nuevo').click();
  await alta.getByLabel('Nombre').fill(nombre);
  await alta.getByLabel('Número (con código de país)').fill('+58 414 5550101');
  await alta.getByRole('button', { name: 'Siguiente' }).click();
  await alta.getByRole('button', { name: '3 meses' }).click();
  await expect(alta.getByText(/^Vence el /)).toBeVisible();
  await expect(alta.getByLabel('Precio por mes')).not.toHaveValue('');
  await alta.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(alta).toBeHidden();

  // Queda asignado y se abre solo el mensaje con los datos.
  const mensaje = page.getByRole('dialog', { name: `Mensaje para ${nombre}` });
  await expect(mensaje).toBeVisible();
  await mensaje.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Perfil 1' })).toContainText(nombre);
});

test('edita la cuenta como en el Gestor: plan, país, pago, fecha, PIN y orden de perfiles', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const sufijo = Date.now().toString(36);
  const cliente = `Cliente Orden ${sufijo}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const api = (ruta: string) => `/api/v1${ruta}`;
  const catalogo = (await (await page.request.get(api('/catalogo'))).json()) as CatalogoPublico;
  const plan = catalogo.planes.find((p) => p.tipo === 'suscripcion' && p.entrega === 'alquiler')!;
  ejecutarSql(`
    INSERT INTO clientes (id, nombre, actualizado_en) VALUES (gen_random_uuid(), '${cliente}', now());
    INSERT INTO suscripciones (id, cliente_id, plan_id, estado, moneda, inicio_en, vence_en, actualizado_en)
    SELECT gen_random_uuid(), c.id, '${plan.id}'::uuid, 'activa', 'USD', now(), now() + interval '20 days', now()
    FROM clientes c WHERE c.nombre = '${cliente}';
  `);
  const r = await page.request.post(api('/cuentas'), {
    data: {
      servicioId: plan.servicio.id,
      usuario: `orden.${sufijo}@example.com`,
      clave: 'Clave-de-prueba-1',
      perfiles: 3,
      costoUsd: '9.00',
    },
    headers: { origin },
  });
  expect(r.status()).toBe(201);
  const cuenta = (await r.json()) as { id: string; listaPerfiles: { id: string }[] };
  const subs = (
    (await (await page.request.get(api('/suscripciones?porPagina=100&estado=activa'))).json()) as {
      elementos: { id: string; cliente: { nombre: string } }[];
    }
  ).elementos;
  const a = await page.request.post(
    api(`/cuentas/${cuenta.id}/perfiles/${cuenta.listaPerfiles[2]!.id}/asignar`),
    {
      data: { suscripcionId: subs.find((s) => s.cliente.nombre === cliente)!.id },
      headers: { origin },
    },
  );
  expect(a.status()).toBe(201);

  await page.goto(`/admin/cuentas/${cuenta.id}`);
  await page.getByRole('button', { name: 'Editar cuenta' }).click();
  await page.getByRole('tab', { name: 'Cobro y datos' }).click();
  await page.getByRole('button', { name: 'Premium' }).click();
  await page.getByLabel('País').selectOption('CO');
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByLabel('Últimos 4 dígitos de la tarjeta').fill('3907');
  await page.getByLabel('Fecha de vencimiento').fill('2026-03-31');
  await page.getByRole('button', { name: 'Sumar 1 mes' }).click();
  await expect(page.getByLabel('Fecha de vencimiento')).toHaveValue('2026-04-30');
  await page.getByRole('tab', { name: 'Acceso' }).click();
  await page.getByRole('button', { name: 'Generar una clave segura' }).click();
  await expect(page.getByText(/^(Buena|Fuerte)$/)).toBeVisible();
  // El cliente del perfil 3 sube al primer lugar, con su PIN nuevo.
  await page.getByRole('tab', { name: /^Perfiles/ }).click();
  await expect(page.getByText(cliente).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Subir Perfil 3' }).click();
  await page.getByRole('button', { name: 'Subir Perfil 3' }).click();
  await page.getByLabel('PIN de Perfil 3').fill('2468');
  await expect(page.getByText(/Vas a cambiar:/)).toBeVisible();
  await page.getByRole('tab', { name: 'Cobro y datos' }).click();
  await expect(page.getByRole('complementary', { name: 'Resumen de la cuenta' })).toContainText(
    '1 de 3',
  );
  await page.screenshot({ path: 'test-results/editar-cuenta.png', fullPage: true });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  // La clave cambió y hay un cliente: se ofrece avisarle.
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeHidden();

  const detalle = (await (await page.request.get(api(`/cuentas/${cuenta.id}`))).json()) as {
    plan: string;
    pais: string;
    metodoPago: string;
    facturaEn: string;
    listaPerfiles: { numero: number; nombre: string; tienePin: boolean; asignacion: unknown }[];
  };
  expect(detalle).toMatchObject({
    plan: 'Premium',
    pais: 'CO',
    metodoPago: 'Tarjeta ···· 3907',
    facturaEn: '2026-04-30',
  });
  expect(detalle.listaPerfiles[0]).toMatchObject({ numero: 1, nombre: 'Perfil 1', tienePin: true });
  expect(detalle.listaPerfiles[0]!.asignacion).not.toBeNull();
});
