import { expect, type Page, test } from '@playwright/test';
import {
  CONTRASENA_DEMO,
  ejecutarSql,
  enlaceDelCorreo,
  ingresar,
  reiniciarLimiteIngreso,
} from './ayudas';

// Cuenta del cliente (ventana 8): un cliente nuevo, solo para estas pruebas.
test.describe.configure({ mode: 'serial' });

const correo = `cuenta-${Date.now()}@nv.test`;
let page: Page;
let origen: { origin: string };

/** Contrata un plan por la API y devuelve la suscripción y su factura. */
async function contratar(plan: string, moneda = 'USD') {
  const cat = await (await page.request.get('/api/v1/catalogo')).json();
  const id = cat.planes.find((p: { nombre: string }) => p.nombre === plan).id;
  const r = await page.request.post('/api/v1/mi/suscripciones', {
    headers: origen,
    data: { planId: id, moneda },
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as { suscripcion: { id: string }; factura: { id: string } };
}

test.beforeAll(async ({ browser }) => {
  reiniciarLimiteIngreso();
  page = await (await browser.newContext()).newPage();
  await page.goto('/ingresar');
  origen = { origin: new URL(page.url()).origin };
  const registro = await page.request.post('/api/v1/auth/registro', {
    headers: origen,
    data: { nombre: 'Lucía Prueba', correo, contrasena: CONTRASENA_DEMO, aceptaTerminos: true },
  });
  expect(registro.status()).toBe(202);
  await page.goto(enlaceDelCorreo(correo, '/verificar-correo'));
  await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
  await expect(page.getByRole('heading', { name: 'Correo confirmado' })).toBeVisible();
  await ingresar(page, correo);
  await expect(page).toHaveURL(/\/cuenta$/);
});

test.afterAll(async () => {
  await page.context().close();
});

test('una cuenta nueva ve el estado vacío y el menú de la cuenta', async () => {
  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Lucía' })).toBeVisible();
  await expect(page.getByText('Todavía no tienes servicios')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute(
    'href',
    '/catalogo',
  );
  const menu = page.getByRole('navigation', { name: 'Mi cuenta' });
  await expect(menu.getByRole('link', { name: 'Mis servicios' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const nombre of ['Mis accesos', 'Facturas y pagos', 'Billetera', 'Métodos guardados']) {
    await expect(menu.getByRole('link', { name: nombre })).toBeVisible();
  }
});

test('inicio: lo que hay que revisar, filtros y cancelar con motivo', async () => {
  // Trimestral activa y por vencer, Individual en gracia, Mensual por pagar y una respuesta del equipo.
  const trimestral = await contratar('Trimestral');
  const individual = await contratar('Individual');
  ejecutarSql(`
    UPDATE facturas SET estado = 'pagada', pagada_en = now() WHERE id IN ('${trimestral.factura.id}', '${individual.factura.id}');
    UPDATE suscripciones SET estado = 'activa', inicio_en = now() - interval '87 days', vence_en = now() + interval '3 days' - interval '1 hour' WHERE id = '${trimestral.suscripcion.id}';
    UPDATE suscripciones SET estado = 'en_gracia', inicio_en = now() - interval '32 days', vence_en = now() - interval '2 days' WHERE id = '${individual.suscripcion.id}';
  `);
  await contratar('Mensual');
  const ticket = await page.request.post('/api/v1/mi/tickets', {
    headers: origen,
    data: { asunto: 'Duda con mi plan', categoria: 'suscripcion', mensaje: '¿Cómo renuevo?' },
  });
  const { id: ticketId } = (await ticket.json()) as { id: string };
  ejecutarSql(`UPDATE tickets SET estado = 'esperando_cliente' WHERE id = '${ticketId}';`);

  await page.goto('/cuenta');
  await expect(page.getByText('Tienes 4 cosas que revisar.')).toBeVisible();
  const revisar = page.getByRole('region', { name: 'Para revisar' });
  await expect(revisar.getByText(/^Factura NV-\d+ por pagar$/)).toBeVisible();
  await expect(revisar.getByText('NV Música venció')).toBeVisible();
  await expect(revisar.getByText('NV Cine vence en 3 días')).toBeVisible();
  await expect(revisar.getByText('Te respondimos: Duda con mi plan')).toBeVisible();
  await expect(revisar.getByRole('link', { name: 'Responder' })).toHaveAttribute(
    'href',
    `/cuenta/soporte/${ticketId}`,
  );
  const menu = page.getByRole('navigation', { name: 'Mi cuenta' });
  await expect(menu.getByRole('link', { name: /Facturas y pagos/ })).toContainText('1');
  await expect(menu.getByRole('link', { name: /Soporte/ })).toContainText('1');

  // Filtros con su cuenta.
  const filtros = page.getByRole('group', { name: 'Filtrar servicios' });
  const servicios = page.getByRole('region', { name: 'Mis servicios' }).getByRole('article');
  await expect(servicios).toHaveCount(3);
  await filtros.getByRole('button', { name: 'Por vencer · 2' }).click();
  await expect(servicios).toHaveCount(2);
  await filtros.getByRole('button', { name: 'Pendientes · 1' }).click();
  await expect(servicios).toHaveCount(1);
  await expect(servicios.getByRole('heading', { name: 'Mensual' })).toBeVisible();
  await filtros.getByRole('button', { name: 'Terminados · 0' }).click();
  await expect(page.getByText('No tienes servicios en este grupo.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver todos' }).click();
  await expect(filtros.getByRole('button', { name: 'Todos · 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // «Renovar» en el aviso lleva a la tarjeta, cuya acción principal es renovar.
  await filtros.getByRole('button', { name: 'Pendientes · 1' }).click();
  await revisar.getByRole('link', { name: 'Renovar' }).first().click();
  const individualT = servicios.filter({ has: page.getByRole('heading', { name: 'Individual' }) });
  await expect(individualT).toBeFocused();
  await expect(individualT.getByRole('button', { name: 'Renovar ahora' })).toBeVisible();

  // Cancelar la solicitud pendiente: el motivo es obligatorio y se valida al escribir.
  const mensual = servicios.filter({ has: page.getByRole('heading', { name: 'Mensual' }) });
  await expect(mensual.getByRole('link', { name: /^Pagar factura NV-\d+$/ })).toBeVisible();
  await mensual.getByRole('button', { name: 'Cancelar solicitud' }).click();
  const motivo = mensual.getByLabel('¿Por qué quieres cancelar?');
  await expect(motivo).toBeFocused();
  await expect(mensual.getByText('Lo lee el equipo')).toBeVisible();
  await mensual.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(mensual.getByText('Escribe al menos 3 caracteres.')).toBeVisible();
  await motivo.fill('no');
  await expect(mensual.getByText('Escribe al menos 3 caracteres.')).toBeVisible();
  await motivo.fill('Ya no lo necesito');
  await expect(mensual.getByText('Gracias, nos ayuda a mejorar')).toBeVisible();
  await mensual.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByText('Cancelamos tu solicitud y anulamos su factura.')).toBeVisible();
  await expect(mensual.getByText('Cancelada', { exact: true })).toBeVisible();
  await expect(mensual.getByRole('link', { name: 'Volver a contratar' })).toBeVisible();
  await expect(revisar.getByText(/por pagar$/)).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /Facturas y pagos/ })).not.toContainText('1');

  // Cancelar una activa la programa al vencer, y se puede mantener.
  const trimestralT = servicios.filter({ has: page.getByRole('heading', { name: 'Trimestral' }) });
  await trimestralT.getByRole('button', { name: 'Cancelar suscripción' }).click();
  await expect(trimestralT.getByText(/Seguirás teniendo NV Cine hasta el/)).toBeVisible();
  await trimestralT.getByLabel('¿Por qué quieres cancelar?').fill('Lo pruebo más adelante');
  await trimestralT.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(trimestralT.getByText(/y no se renovará\.$/)).toBeVisible();
  await trimestralT.getByRole('button', { name: 'Mantener mi suscripción' }).click();
  await expect(page.getByText('Listo: NV Cine se seguirá renovando.')).toBeVisible();
  await expect(trimestralT.getByRole('button', { name: 'Renovar ahora' })).toBeVisible();
});

test('nueva solicitud de soporte con validación en vivo', async () => {
  await page.goto('/cuenta/soporte/nueva');
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva solicitud' })).toBeVisible();
  const formulario = page.getByRole('form', { name: 'Nueva solicitud' });
  const enviar = formulario.getByRole('button', { name: 'Enviar solicitud' });
  await enviar.click();
  await expect(formulario.getByText('Elige de qué se trata.')).toBeVisible();
  await expect(formulario.getByText('Escribe al menos 4 caracteres.')).toBeVisible();
  await expect(formulario.getByText('Cuéntanos qué pasa.', { exact: true })).toBeVisible();

  await formulario.getByRole('radio', { name: 'Mi cuenta' }).click();
  await expect(formulario.getByRole('radio', { name: 'Mi cuenta' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(formulario.getByText('Elige de qué se trata.')).toHaveCount(0);
  const asunto = formulario.getByLabel('Asunto');
  await asunto.fill('Ayu');
  await expect(formulario.getByText('Escribe al menos 4 caracteres.')).toBeVisible();
  await asunto.fill('Quiero cambiar mi WhatsApp');
  await expect(formulario.getByText('Asunto listo')).toBeVisible();
  await formulario
    .getByLabel('Servicio relacionado (opcional)')
    .selectOption({ label: 'NV Cine · Trimestral' });
  await formulario
    .getByLabel('Cuéntanos qué pasa')
    .fill('Cambié de número y no me llegan los avisos.');
  await expect(formulario.getByText('43 de 5.000 caracteres')).toBeVisible();
  await enviar.click();

  await expect(page).toHaveURL(/\/cuenta\/soporte\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Recibimos tu solicitud #\d+/)).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quiero cambiar mi WhatsApp' }),
  ).toBeVisible();
  const conversacion = page.getByRole('list', { name: 'Conversación' });
  await expect(conversacion.getByText('Cambié de número y no me llegan los avisos.')).toBeVisible();

  // Responder vacío avisa; «Ya se resolvió» la cierra.
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText('Escribe tu respuesta.')).toBeVisible();
  await page.getByLabel('Tu respuesta').fill('Mi número nuevo termina en 1234.');
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(conversacion.getByText('Mi número nuevo termina en 1234.')).toBeVisible();
  await page.getByRole('button', { name: 'Ya se resolvió' }).click();
  await expect(page.getByText('Esta solicitud está cerrada.')).toBeVisible();
  await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Mis solicitudes' }).click();
  await expect(page.getByRole('link', { name: /Quiero cambiar mi WhatsApp/ })).toContainText(
    'Cerrada',
  );
});

test('perfil: la contraseña nueva se revisa en vivo antes de cambiarla', async () => {
  await page.goto('/ajustes');
  await expect(page.getByRole('heading', { level: 1, name: 'Perfil y seguridad' })).toBeVisible();
  await expect(page.getByLabel('Correo')).toHaveAttribute('readonly', '');
  await expect(page.getByText('Para cambiarlo escríbenos a soporte.')).toBeVisible();

  const requisitos = page.getByRole('list', { name: 'Requisitos de la contraseña' });
  const requisito = (texto: string) => requisitos.getByRole('listitem').filter({ hasText: texto });
  const nueva = page.getByLabel('Contraseña nueva');
  const repetir = page.getByLabel('Repítela');
  const cambiar = page.getByRole('button', { name: 'Cambiar contraseña' });

  await cambiar.click();
  await expect(page.getByText('Escribe tu contraseña actual.')).toBeVisible();
  await expect(page.getByLabel('Contraseña actual')).toBeFocused();

  await nueva.fill(`${correo.split('@')[0]}!`);
  await expect(requisito('Al menos 10 caracteres')).toContainText('cumple');
  await expect(requisito('No contiene tu correo')).toContainText('falta');
  await nueva.fill('corta');
  await expect(requisito('Al menos 10 caracteres')).toContainText('falta');
  const clave = 'Otra-clave-segura-2026';
  await nueva.fill(clave);
  for (const texto of [
    'Al menos 10 caracteres',
    'Al menos 5 caracteres distintos',
    'No es una contraseña común',
    'No contiene tu correo',
  ]) {
    await expect(requisito(texto)).toContainText('cumple');
  }
  await repetir.fill('Otra-clave');
  await expect(page.getByText('No coinciden')).toBeVisible();
  await repetir.fill(clave);
  await expect(page.getByText('Coinciden', { exact: true })).toBeVisible();

  await page.getByLabel('Mostrar contraseñas').check();
  await expect(nueva).toHaveAttribute('type', 'text');

  await page.getByLabel('Contraseña actual').fill('no-es-la-actual');
  await cambiar.click();
  await expect(page.getByLabel('Contraseña actual')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Contraseña actual').fill(CONTRASENA_DEMO);
  await cambiar.click();
  await expect(page.getByText('Contraseña cambiada. Cerramos tus otras sesiones.')).toBeVisible();
  await expect(nueva).toHaveValue('');
});

test('un cliente de un revendedor no ve pagos, billetera ni «Ser revendedor»', async () => {
  const ligar = (revendedor: string) =>
    ejecutarSql(
      `UPDATE clientes SET revendedor_id = ${revendedor} WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = '${correo}');`,
    );
  ligar(
    "(SELECT r.id FROM revendedores r JOIN usuarios u ON u.id = r.usuario_id WHERE u.correo = 'revendedor@nv.test')",
  );
  try {
    await page.goto('/cuenta');
    await expect(page.getByText('Tu cuenta la gestiona tu revendedor')).toBeVisible();
    await expect(page.getByText('Tu revendedor', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contratar otro plan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Cancelar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Renovar ahora' })).toHaveCount(0);
    await expect(page.getByText('Renuévalo con tu revendedor').first()).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Mi cuenta' });
    for (const nombre of ['Billetera', 'Carrito y pedidos', 'Métodos guardados', 'Ser revendedor'])
      await expect(menu.getByRole('link', { name: nombre })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Mis servicios' })).toBeVisible();

    await page.goto('/cuenta/metodos-pago');
    await expect(page.getByText('Tu revendedor gestiona tus pagos')).toBeVisible();
  } finally {
    ligar('NULL');
  }
});
