import { expect, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

/**
 * Gestor, parte 2: notas con aviso, cuentas sin anotar, papelera y la meta del
 * mes en el inicio. Cada intento usa nombres propios para no chocar al reintentar.
 */
test.beforeAll(() => reiniciarLimiteIngreso());

// Dos días atrás: entre las 00:00 y las 04:00 UTC «ayer» en UTC todavía es «hoy» en
// Caracas, y la cuenta aún no figuraría como liberada.
const ayer = () => new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

test('una nota con aviso vencido sale arriba y al marcarla hecha pasa a «Hechas»', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const texto = `Entregar Netflix a Ana ${Date.now().toString(36)}`;
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/notas');
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await page.getByLabel('Tipo').selectOption('entregar');
  await page.getByLabel('Nota', { exact: true }).fill(texto);
  await page.getByLabel('Avisar el día (opcional)').fill(ayer());
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Nota guardada.')).toBeVisible();

  const avisar = page.getByRole('region', { name: 'Para avisar ya' });
  await expect(avisar.getByText(texto)).toBeVisible();
  await avisar.getByRole('button', { name: `Marcar hecha la nota ${texto.slice(0, 40)}` }).click();
  await expect(page.getByText(texto)).toHaveCount(0);
  await page.getByRole('link', { name: 'Hechas' }).click();
  await expect(page.getByText(texto)).toBeVisible();
});

test('una cuenta sin anotar espera fuera del inventario hasta que se anota', async ({ page }) => {
  test.setTimeout(90_000);
  const usuario = `espera.${Date.now().toString(36)}@example.com`;
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin/cuentas');
  await page.getByRole('link', { name: 'Sin anotar' }).click();
  await expect(page).toHaveURL(/\/admin\/cuentas\/sin-anotar$/);
  await page.getByRole('button', { name: 'Agregar cuenta sin anotar' }).click();
  await page.getByLabel('Servicio').selectOption({ index: 1 });
  await page.getByLabel('Correo o usuario').fill(usuario);
  await page.getByLabel('Clave', { exact: true }).fill('Clave-de-prueba-1');
  await page.getByLabel('Fecha de liberación').fill(ayer());
  await page.getByRole('button', { name: 'Guardar cuenta' }).click();
  await expect(page.getByText(/guardada\./)).toBeVisible();

  // En la lista solo se ve la pista del correo («es•••@example.com»).
  const fila = page
    .getByRole('list', { name: 'Cuentas sin anotar' })
    .getByRole('listitem')
    .filter({ hasText: 'Liberada' })
    .first();
  await expect(fila).toBeVisible();
  const anotar = page.getByRole('button', { name: /^Anotar .+ en el inventario$/ });
  const antes = await anotar.count();
  await fila.getByRole('button', { name: /^Anotar .+ en el inventario$/ }).click();
  await expect(anotar).toHaveCount(antes - 1);
});

test('la papelera restaura un cliente archivado', async ({ page }) => {
  test.setTimeout(90_000);
  const nombre = `Cliente Papelera ${Date.now().toString(36)}`;
  await entrarEquipo(page, 'admin@nv.test');
  const origin = new URL(page.url()).origin;
  const creado = await page.request.post('/api/v1/clientes', {
    data: { nombre },
    headers: { origin },
  });
  expect(creado.status()).toBe(201);
  const { id } = (await creado.json()) as { id: string };
  const archivar = await page.request.post(`/api/v1/clientes/${id}/archivar`, {
    data: { motivo: 'Prueba de papelera' },
    headers: { origin },
  });
  expect(archivar.status()).toBe(200);

  await page.goto('/admin/papelera');
  await expect(page.getByText(nombre)).toBeVisible();
  await page.getByRole('button', { name: `Restaurar ${nombre}` }).click();
  await expect(page.getByText(`${nombre} volvió a su lugar.`)).toBeVisible();
  await expect(page.getByRole('button', { name: `Restaurar ${nombre}` })).toHaveCount(0);
});

test('el inicio muestra «Hoy en el negocio» y deja fijar la meta del mes', async ({ page }) => {
  test.setTimeout(90_000);
  await entrarEquipo(page, 'admin@nv.test');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Hoy en el negocio' })).toBeVisible();
  const meta = page.getByRole('region', { name: 'Meta del mes' });
  await meta.getByRole('button', { name: /Fijar meta|Cambiar meta/ }).click();
  await meta.getByLabel('Meta del mes (USD)').fill('750');
  await meta.getByRole('button', { name: 'Guardar' }).click();
  await expect(meta.getByText(/de \$750\.00/)).toBeVisible();
  await expect(meta.getByRole('progressbar')).toBeVisible();
});
