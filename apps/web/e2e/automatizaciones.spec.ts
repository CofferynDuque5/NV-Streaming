import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, ingresar } from './ayudas';

/** Entra con la verificación en dos pasos que configuró roles.spec.ts. */
async function entrar(page: Page, correo: string) {
  await entrarEquipo(page, correo);
  await expect(page).toHaveURL(/\/admin$/);
}

// Se ejecuta después de roles.spec.ts (proyecto propio en playwright.config.ts):
// administración y operación ya tienen la verificación en dos pasos.
test.describe.configure({ mode: 'serial' });

test('administración pausa y reactiva una automatización y cambia los días de aviso', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrar(page, 'admin@nv.test');
  await page.getByRole('link', { name: 'Automatizaciones' }).first().click();
  await expect(page).toHaveURL(/\/admin\/automatizaciones$/);
  await expect(page.getByRole('heading', { name: 'Automatizaciones', level: 1 })).toBeVisible();
  for (const grupo of ['Clientes', 'Revendedores', 'Equipo', 'Finanzas'])
    await expect(page.getByRole('heading', { name: grupo, level: 2 })).toBeVisible();
  const franja = page.getByRole('region', { name: 'Estado de los canales y del trabajador' });
  await expect(franja.getByText('Sandbox', { exact: true })).toBeVisible();
  await expect(franja.getByRole('term').filter({ hasText: 'Trabajador' })).toBeVisible();

  // Pausar y volver a activar: el cambio se guarda en el servidor.
  const interruptor = page.getByRole('switch', { name: 'Recordatorio de vencimiento' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(interruptor).not.toHaveAttribute('aria-busy', 'true');
  await page.reload();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(interruptor).not.toHaveAttribute('aria-busy', 'true');
  await page.reload();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');

  // Configurar: los días se validan con el esquema del tipo antes de enviarse.
  await page.getByRole('link', { name: 'Configurar Recordatorio de vencimiento' }).click();
  await expect(page).toHaveURL(/\/admin\/automatizaciones\/recordatorio_vencimiento$/);
  await expect(page.getByRole('heading', { name: 'Recordatorio de vencimiento' })).toBeVisible();
  const dias = page.getByLabel('Días antes del vencimiento');
  await expect(dias).toHaveValue('7, 3, 1');
  await dias.fill('7, 40');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Escribe días entre 1 y 30, separados por comas.')).toBeVisible();

  await dias.fill('10, 5, 2');
  await page.getByLabel('Hora de envío').selectOption('8');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await page.reload();
  await expect(dias).toHaveValue('10, 5, 2');
  await expect(page.getByLabel('Hora de envío')).toHaveValue('8');
  await expect(page.getByRole('heading', { name: 'Historial de ejecuciones' })).toBeVisible();

  await page.getByRole('link', { name: 'Automatizaciones' }).first().click();
  await expect(page.getByText('10, 5, 2 días antes · 8:00 a. m.')).toBeVisible();

  // Registro de avisos: filtros y aviso de prueba.
  await page.getByRole('link', { name: 'Avisos enviados' }).click();
  await expect(page).toHaveURL(/\/admin\/automatizaciones\/avisos$/);
  await expect(page.getByRole('heading', { name: 'Avisos enviados' })).toBeVisible();
  await page.getByLabel('Correo de destino').fill('pruebas-e2e@nv.test');
  await page.getByRole('button', { name: 'Enviar prueba' }).click();
  await expect(
    page.getByRole('form', { name: 'Enviar aviso de prueba' }).getByRole('status'),
  ).toBeVisible();
  await page.getByLabel('Canal', { exact: true }).first().selectOption('correo');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/canal=correo/);
  const aviso = page
    .getByRole('list', { name: 'Avisos' })
    .getByRole('listitem')
    .filter({ hasText: 'pr***@nv.test' })
    .first();
  await expect(aviso.getByText('Aviso de prueba')).toBeVisible();
});

test('operación ve las automatizaciones sin poder cambiarlas', async ({ page }) => {
  test.setTimeout(90_000);
  await entrar(page, 'operador@nv.test');
  await page.goto('/admin/automatizaciones');
  await expect(page.getByRole('heading', { name: 'Automatizaciones', level: 1 })).toBeVisible();
  await expect(page.getByText('Solo administración puede activarlas')).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ejecutar ahora/ })).toHaveCount(0);

  await page.getByRole('link', { name: 'Ver detalle de Recordatorio de vencimiento' }).click();
  await expect(page.getByLabel('Días antes del vencimiento')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

  await page.goto('/admin/automatizaciones/avisos');
  await expect(page.getByRole('heading', { name: 'Avisos enviados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar prueba' })).toHaveCount(0);
});

test('el cliente desactiva y vuelve a activar los recordatorios de vencimiento', async ({
  page,
}) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto('/ajustes');
  const interruptor = page.getByRole('switch', { name: 'Recibir recordatorios de vencimiento' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('seguirás recibiendo las facturas')).toBeVisible();

  await interruptor.click();
  await expect(page.getByText('ya no te enviaremos recordatorios')).toBeVisible();
  await page.reload();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');

  await interruptor.click();
  await expect(page.getByText('te avisaremos antes de que venza')).toBeVisible();
  await page.reload();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
});
