import { expect, type Page, test } from '@playwright/test';
import { entrarEquipo, ingresar } from './ayudas';

/**
 * Asistente de IA (fase 5) con el motor de pruebas de la API ("sandbox"): responde
 * de forma determinista a unas frases conocidas y pide la herramienta que toca.
 * Se ejecuta después de roles.spec.ts (proyecto propio en playwright.config.ts):
 * administración, operación y ventas ya tienen la verificación en dos pasos.
 */
test.describe.configure({ mode: 'serial' });

async function entrar(page: Page, correo: string) {
  await entrarEquipo(page, correo);
  await expect(page).toHaveURL(/\/admin$/);
}

/** Envía un mensaje escribiéndolo en el cuadro de texto y pulsando Intro. */
async function preguntar(page: Page, texto: string) {
  const campo = page.getByLabel('Tu mensaje para el asistente');
  await campo.fill(texto);
  await campo.press('Enter');
  await expect(
    page.getByRole('article', { name: 'Tu mensaje' }).filter({ hasText: texto }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Mensajes' }).getByText('El asistente está pensando…'),
  ).toBeHidden({ timeout: 30_000 });
  // El foco vuelve al cuadro de texto para seguir escribiendo.
  await expect(campo).toBeFocused();
}

const NOTA_CONFIRMADA = 'Prefiere que lo contacten por WhatsApp en la tarde.';
const NOTA_RECHAZADA = 'Nota de prueba que no se debe guardar.';

test('administración activa el asistente con el motor de pruebas', async ({ page }) => {
  test.setTimeout(120_000);
  await entrar(page, 'admin@nv.test');
  await page.getByRole('link', { name: 'Asistente', exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/asistente$/);
  await expect(page.getByRole('heading', { name: 'Asistente', level: 1 })).toBeVisible();
  await expect(page.getByText('Nunca ejecuta nada sin tu confirmación.')).toBeVisible();
  await expect(page.getByText('El asistente está desactivado')).toBeVisible();

  await page.getByRole('link', { name: 'Configurar el asistente' }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\/configuracion$/);
  const pestanas = page.getByRole('navigation', { name: 'Vistas del asistente' });
  await expect(pestanas.getByRole('link', { name: 'Configuración' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Motores' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Uso' })).toBeVisible();

  const interruptor = page.getByRole('switch', { name: 'Asistente activo' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Motor', { exact: true }).selectOption('sandbox');

  // Validación con el esquema compartido antes de enviar.
  const diarios = page.getByLabel('Mensajes diarios por persona');
  await diarios.fill('0');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Escribe un número entre 1 y 1000.')).toBeVisible();

  await diarios.fill('50');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Configuración guardada.')).toBeVisible();
  await page.reload();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Motor', { exact: true })).toHaveValue('sandbox');
  await expect(diarios).toHaveValue('50');
  await expect(page.getByText(/Última modificación por/)).toBeVisible();

  await pestanas.getByRole('link', { name: 'Conversaciones' }).click();
  await expect(page).toHaveURL(/\/admin\/asistente$/);
  await expect(page.getByText('¿En qué te ayudo?')).toBeVisible();
  await expect(page.getByText('Te quedan 50 mensajes hoy.')).toBeVisible();
});

test('operación consulta, confirma una acción y rechaza otra', async ({ page }) => {
  test.setTimeout(180_000);
  await entrar(page, 'operador@nv.test');

  // Identificador real de un cliente, para pedir una acción sobre él.
  await page.goto('/admin/clientes');
  await page
    .getByRole('link', { name: /Cliente Demo/ })
    .first()
    .click();
  await page.waitForURL(/\/admin\/clientes\/[0-9a-f-]{36}$/);
  const clienteId = page.url().split('/').pop()!;

  await page.getByRole('link', { name: 'Asistente', exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/asistente$/);
  const pestanas = page.getByRole('navigation', { name: 'Vistas del asistente' });
  await expect(pestanas.getByRole('link', { name: 'Configuración' })).toHaveCount(0);

  // Una consulta con una pregunta de ejemplo: responde y muestra la herramienta usada.
  await page.getByRole('button', { name: '¿Qué suscripciones vencen esta semana?' }).click();
  const respuesta = page.getByRole('article', { name: 'Respuesta del asistente' }).last();
  await expect(respuesta).toBeVisible({ timeout: 30_000 });
  await expect(
    respuesta.getByRole('list', { name: 'Herramientas usadas' }).getByText('Consultó vencimientos'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/asistente\?conversacion=[0-9a-f-]{36}$/);
  await expect(page.getByText('Te quedan 49 mensajes hoy.')).toBeVisible();

  // Una acción: el asistente solo la propone; se confirma en un diálogo.
  await preguntar(page, `Agrega una nota al cliente ${clienteId}: ${NOTA_CONFIRMADA}`);
  const tarjeta = page.getByRole('region', { name: 'Acción propuesta: Agregar nota interna' });
  await expect(tarjeta).toHaveCount(1);
  await expect(tarjeta.getByText('Por confirmar')).toBeVisible();
  await expect(tarjeta.getByText(/Caduca en \d+ min/)).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  const dialogo = page.getByRole('dialog', { name: '¿Confirmar «Agregar nota interna»?' });
  await expect(dialogo).toBeVisible();
  await expect(
    dialogo.getByText('Esto se ejecutará con tu usuario y quedará en la auditoría.'),
  ).toBeVisible();
  await dialogo.getByRole('button', { name: 'Confirmar y ejecutar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(tarjeta.getByText('Ejecutada', { exact: true })).toBeVisible();
  await expect(tarjeta.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);

  // Otra acción que se rechaza con un motivo.
  await preguntar(page, `Agrega una nota al cliente ${clienteId}: ${NOTA_RECHAZADA}`);
  const segunda = tarjeta.last();
  await expect(tarjeta).toHaveCount(2);
  await segunda.getByRole('button', { name: 'Rechazar' }).click();
  await segunda.getByLabel('Motivo (opcional)').fill('No hace falta.');
  await segunda.getByRole('button', { name: 'Rechazar acción' }).click();
  await expect(segunda.getByText('Rechazada', { exact: true })).toBeVisible();
  await expect(segunda.getByText('Motivo: No hace falta.')).toBeVisible();

  // La nota confirmada está en la ficha; la rechazada, no.
  await page.goto(`/admin/clientes/${clienteId}`);
  await expect(page.getByText(NOTA_CONFIRMADA)).toBeVisible();
  await expect(page.getByText(NOTA_RECHAZADA)).toHaveCount(0);

  // Registro de acciones, con filtro por estado y enlace a la conversación.
  await page.goto('/admin/asistente/acciones');
  await expect(page.getByRole('heading', { name: 'Acciones propuestas' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Ejecutada' })).toHaveCount(1);
  await page.getByLabel('Estado').selectOption('rechazada');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/estado=rechazada/);
  const fila = page.getByRole('row').filter({ hasText: 'Rechazada' });
  await expect(fila).toHaveCount(1);
  await fila.getByRole('link', { name: /Ver la conversación/ }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\?conversacion=[0-9a-f-]{36}$/);
  await expect(page.getByRole('region', { name: /Acción propuesta/ })).toHaveCount(2);

  // Una conversación nueva, que después se archiva.
  const conversaciones = page.getByRole('region', { name: 'Tus conversaciones' });
  await expect(conversaciones.getByRole('listitem')).toHaveCount(1);
  await conversaciones.getByRole('button', { name: /Nueva/ }).click();
  await expect(page.getByText('¿En qué te ayudo?')).toBeVisible();
  await preguntar(page, '¿Cuántos pagos hay por conciliar?');
  await expect(
    page
      .getByRole('article', { name: 'Respuesta del asistente' })
      .last()
      .getByText('Consultó pagos por conciliar'),
  ).toBeVisible();
  await expect(conversaciones.getByRole('listitem')).toHaveCount(2);
  page.once('dialog', (d) => void d.accept());
  await conversaciones
    .getByRole('button', { name: /^Archivar/ })
    .first()
    .click();
  await expect(conversaciones.getByRole('listitem')).toHaveCount(1);
});

test('ventas usa el asistente pero no ve su configuración', async ({ page }) => {
  test.setTimeout(120_000);
  await entrar(page, 'ventas@nv.test');
  await page.getByRole('link', { name: 'Asistente', exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/asistente$/);
  const pestanas = page.getByRole('navigation', { name: 'Vistas del asistente' });
  await expect(pestanas.getByRole('link', { name: 'Conversaciones' })).toBeVisible();
  await expect(pestanas.getByRole('link', { name: 'Acciones' })).toBeVisible();
  await expect(pestanas.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await expect(page.getByLabel('Tu mensaje para el asistente')).toBeVisible();

  await page.goto('/admin/asistente/configuracion');
  await expect(page).not.toHaveURL(/configuracion/);
});

test('un cliente no puede abrir el asistente', async ({ page }) => {
  await ingresar(page, 'cliente@nv.test');
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole('link', { name: 'Asistente', exact: true })).toHaveCount(0);
  await page.goto('/admin/asistente');
  await expect(page).toHaveURL(/\/cuenta$/);
});
