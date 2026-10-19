import type { CentroEquipo } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, reiniciarLimiteIngreso } from './ayudas';

// Proyecto propio, después de roles.spec.ts: el equipo ya tiene la verificación en dos pasos.
test.beforeAll(() => reiniciarLimiteIngreso());

async function entrar(page: Page, correo: string) {
  await entrarEquipo(page, correo);
  await expect(page).toHaveURL(/\/admin$/);
}

const centro = async (page: Page) =>
  (await (await page.request.get('/api/v1/metricas/centro')).json()) as CentroEquipo;

const modulos = (page: Page) => page.locator('#modulos').getByRole('listitem');

test('administración: colas reales, cifras, módulos con buscador y chips, actividad y sistema', async ({
  page,
}) => {
  await entrar(page, 'admin@nv.test');

  // Una solicitud abierta por el equipo entra en «Para atender» y en la insignia de Soporte.
  const lista = await page.request.get('/api/v1/clientes?busqueda=cliente%40nv.test');
  const clienteId = (await lista.json()).elementos[0].id as string;
  const ticket = await page.request.post('/api/v1/tickets', {
    data: {
      clienteId,
      asunto: 'Revisar el acceso del centro',
      categoria: 'acceso',
      mensaje: 'Solicitud de prueba del centro de módulos.',
    },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(ticket.status()).toBe(201);
  await page.reload();
  const { colas } = await centro(page);
  const abiertos = colas.tickets!.abiertos;

  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Administración' })).toBeVisible();
  await expect(page.getByText('Equipo', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver tienda' })).toBeVisible();

  const atender = page.getByRole('region', { name: 'Para atender' });
  await expect(atender.getByText('Lo más urgente primero.')).toBeVisible();
  await expect(
    atender.getByText(
      `${abiertos} ${abiertos === 1 ? 'solicitud abierta' : 'solicitudes abiertas'}`,
    ),
  ).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Módulos del equipo' });
  await expect(menu.getByRole('link', { name: /^Soporte/ })).toContainText(String(abiertos));
  await expect(menu.getByText('Clientes y ventas')).toBeVisible();

  // El proceso trabajador no corre en las pruebas: se avisa y sale en el estado del sistema.
  await expect(page.getByText('El proceso trabajador no está en marcha')).toBeVisible();
  const sistema = page.getByRole('region', { name: 'Estado del sistema' });
  await expect(sistema.getByText('Trabajador')).toBeVisible();
  await expect(sistema.getByText('PayPal')).toBeVisible();

  await expect(page.getByRole('region', { name: 'Este mes' })).toBeVisible();
  await expect(page.getByText('Suscripciones por estado')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Actividad reciente' })).toBeVisible();

  // Módulos: los 16 del rol, búsqueda sin tildes y chips por grupo con su cuenta.
  await expect(page.getByText('16 módulos para tu rol')).toBeVisible();
  await expect(modulos(page)).toHaveCount(16);
  await page.getByLabel('Buscar módulo').fill('tasa');
  await expect(modulos(page)).toHaveCount(1);
  await expect(modulos(page).first()).toContainText('Monedas y cobro');
  await page.getByLabel('Buscar módulo').fill('xyz');
  await expect(page.getByText('Ningún módulo coincide.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await page.getByRole('button', { name: 'Sistema · 3' }).click();
  await expect(modulos(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Sistema · 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // «Revisar» lleva a la cola de su módulo.
  await atender
    .getByRole('link', { name: /^Revisar: \d+ solicitud/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/soporte$/);
  await expect(menu.getByRole('link', { name: /^Soporte/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('operación: sus 11 módulos, sin auditoría ni actividad', async ({ page }) => {
  await entrar(page, 'operador@nv.test');
  await expect(page.getByText('11 módulos para tu rol')).toBeVisible();
  await expect(modulos(page)).toHaveCount(11);
  await expect(page.getByRole('region', { name: 'Actividad reciente' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Auditoría/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Inventario de códigos/ })).toHaveCount(0);
  const sistema = page.getByRole('region', { name: 'Estado del sistema' });
  await expect(sistema.getByText('Correo')).toBeVisible();
  await expect(sistema.getByText('PayPal')).toHaveCount(0);
});

test('ventas: sus 7 módulos y las cifras de su cartera', async ({ page }) => {
  await entrar(page, 'ventas@nv.test');
  await expect(page.getByText('7 módulos para tu rol')).toBeVisible();
  await expect(modulos(page)).toHaveCount(7);
  await expect(page.getByText('Estas cifras son solo de tu cartera de clientes.')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Equipo y usuarios/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Sistema/ })).toHaveCount(0);
  await expect(page.getByText('Falta la tasa de')).toHaveCount(0);
  const sistema = page.getByRole('region', { name: 'Estado del sistema' });
  await expect(sistema.getByRole('listitem')).toHaveCount(1);
  await expect(sistema.getByText('Asistente')).toBeVisible();
});

test.describe('en el teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('barra de abajo con el centro, cobros, soporte, asistente y módulos', async ({ page }) => {
    await entrar(page, 'admin@nv.test');
    await expect(page.getByRole('navigation', { name: 'Módulos del equipo' })).toBeHidden();
    const barra = page.getByRole('navigation', { name: 'Accesos rápidos' });
    for (const t of ['Centro', 'Cobros', 'Soporte', 'Asistente', 'Módulos']) {
      await expect(barra.getByRole('link', { name: new RegExp(`^${t}`) })).toBeVisible();
    }
    await expect(barra.getByRole('link', { name: /^Centro/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await barra.getByRole('link', { name: /^Módulos/ }).click();
    await expect(page.getByRole('heading', { name: 'Módulos', exact: true })).toBeInViewport();
    await barra.getByRole('link', { name: /^Soporte/ }).click();
    await expect(page).toHaveURL(/\/admin\/soporte$/);
  });
});
