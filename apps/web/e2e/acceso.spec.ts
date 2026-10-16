import { POLITICAS } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';
import {
  CONTRASENA_DEMO,
  configurarDosPasos,
  codigoSinUsar,
  enlaceDelCorreo,
  ingresar,
  leerSecretos,
  reiniciarLimiteIngreso,
  terminosAceptados,
} from './ayudas';

// Las pruebas comparten la cuenta que se registra en la primera.
test.describe.configure({ mode: 'serial' });

const marca = Date.now();
const nueva = {
  nombre: 'Ana Acceso',
  correo: `ana.acceso${marca}@nv.test`,
  contrasena: 'Una frase larga y segura',
  otra: 'Otra frase nueva y segura',
};

test.beforeAll(() => reiniciarLimiteIngreso());
test.afterAll(() => reiniciarLimiteIngreso());

function boton(page: Page, nombre: string) {
  return page.getByRole('button', { name: nombre, exact: true });
}

test('ingresar: valida en vivo, avisa del carrito y el error de datos es genérico', async ({
  page,
}) => {
  await page.goto('/ingresar?siguiente=%2Fcarrito');
  await expect(page.getByRole('heading', { level: 1, name: 'Qué bueno verte' })).toBeVisible();
  await expect(page.getByText('Tu carrito te espera')).toBeVisible();
  const pestanas = page.getByRole('navigation', { name: 'Acceso' });
  await expect(pestanas.getByRole('link', { name: 'Ingresar' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(pestanas.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
    'href',
    '/registro?siguiente=%2Fcarrito',
  );
  await expect(
    page.getByText('Conexión segura. Nunca te pediremos tu contraseña por WhatsApp.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a la tienda' })).toBeVisible();

  // Sin datos: los errores aparecen en cada campo y no se llama a la API.
  await boton(page, 'Ingresar').click();
  await expect(page.getByText('Escribe tu correo.')).toBeVisible();
  const correo = page.getByLabel('Correo');
  await expect(correo).toBeFocused();
  await correo.fill('cliente@nv');
  await correo.blur();
  await expect(page.getByText('Revisa el correo, por ejemplo tu@correo.com')).toBeVisible();
  await correo.fill('cliente@nv.test');
  await expect(page.getByText('Revisa el correo, por ejemplo tu@correo.com')).toHaveCount(0);
  await boton(page, 'Ingresar').click();
  await expect(page.getByText('Escribe tu contraseña.')).toBeVisible();

  // Mostrar y ocultar la contraseña.
  const clave = page.getByLabel('Contraseña', { exact: true });
  await clave.fill('no-es-esta');
  await boton(page, 'Mostrar contraseña').click();
  await expect(clave).toHaveAttribute('type', 'text');
  await expect(boton(page, 'Ocultar contraseña')).toHaveAttribute('aria-pressed', 'true');
  await boton(page, 'Ocultar contraseña').click();
  await expect(clave).toHaveAttribute('type', 'password');

  // Aviso de mayúsculas activadas mientras se escribe la contraseña.
  await clave.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'A', modifierCapsLock: true, bubbles: true }),
    ),
  );
  await expect(page.getByText('Tienes activadas las mayúsculas')).toBeVisible();
  await clave.evaluate((el) =>
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true })),
  );
  await expect(page.getByText('Tienes activadas las mayúsculas')).toHaveCount(0);

  // Datos incorrectos: mensaje genérico, la contraseña se vacía para reintentar.
  await boton(page, 'Ingresar').click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' }),
  ).toBeVisible();
  await expect(clave).toHaveValue('');
  await expect(clave).toBeFocused();

  // Con los datos correctos vuelve al carrito.
  await clave.fill(CONTRASENA_DEMO);
  await boton(page, 'Ingresar').click();
  await expect(page).toHaveURL(/\/carrito$/);
});

test('ingresar: tras muchos intentos la API frena y se avisa', async ({ page }) => {
  const correo = `nadie${marca}@nv.test`;
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  const aviso = page.getByRole('alert').filter({ hasText: 'Demasiados intentos' });
  for (let i = 0; i < 12 && !(await aviso.isVisible()); i++) {
    await page.getByLabel('Contraseña', { exact: true }).fill(`intento-${i}`);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/auth/inicio-sesion')),
      boton(page, 'Ingresar').click(),
    ]);
  }
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Vuelve a intentarlo en');
});

test('registro: requisitos en vivo, correo por confirmar, reenvío y confirmación', async ({
  page,
}) => {
  await page.goto('/registro');
  await expect(page.getByRole('heading', { level: 1, name: 'Crea tu cuenta' })).toBeVisible();
  await boton(page, 'Crear mi cuenta').click();
  await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
  await expect(page.getByText('Escribe tu correo.')).toBeVisible();
  await expect(page.getByText('Debes aceptarlos para crear tu cuenta.')).toBeVisible();
  await expect(page.getByLabel('Nombre')).toBeFocused();

  await page.getByLabel('Nombre').fill(nueva.nombre);
  await page.getByLabel('Correo').fill(nueva.correo);
  const clave = page.getByLabel('Contraseña', { exact: true });
  const requisitos = page.getByRole('list', { name: 'Requisitos de la contraseña' });
  const requisito = (texto: string) => requisitos.getByRole('listitem').filter({ hasText: texto });

  // La contraseña no puede contener el correo (la misma regla que la API).
  await clave.fill(`${nueva.correo.split('@')[0]} 2026`);
  await expect(requisito('Al menos 10 caracteres')).toContainText('cumple');
  await expect(requisito('No contiene tu correo')).toContainText('falta');
  await clave.fill('corta');
  await expect(requisito('Al menos 10 caracteres')).toContainText('falta');
  await clave.fill(nueva.contrasena);
  for (const texto of [
    'Al menos 10 caracteres',
    'Al menos 5 caracteres distintos',
    'No es una contraseña común',
    'No contiene tu correo',
  ]) {
    await expect(requisito(texto)).toContainText('cumple');
  }
  // Los términos y la privacidad se abren en otra pestaña, en su sección de /politicas.
  const formulario = page.getByRole('main');
  await expect(formulario.getByRole('link', { name: 'términos', exact: true })).toHaveAttribute(
    'href',
    '/politicas#terminos',
  );
  await expect(formulario.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute(
    'href',
    '/politicas#privacidad',
  );
  const [pestana] = await Promise.all([
    page.context().waitForEvent('page'),
    formulario.getByRole('link', { name: 'términos', exact: true }).click(),
  ]);
  await expect(pestana).toHaveURL(/\/politicas#terminos$/);
  await expect(pestana.getByRole('heading', { level: 2, name: 'Términos de uso' })).toBeVisible();
  await pestana.close();
  await expect(clave).toHaveValue(nueva.contrasena);

  await page.getByRole('checkbox', { name: /Acepto los términos/ }).check();
  await boton(page, 'Crear mi cuenta').click();

  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await expect(page.getByText(nueva.correo)).toBeVisible();
  // Queda registrada la versión de las Políticas y términos que aceptó.
  const aceptados = terminosAceptados(nueva.correo);
  expect(aceptados.version).toBe(POLITICAS.version);
  expect(aceptados.fecha).not.toBeNull();
  await expect(page.getByRole('button', { name: /Puedes reenviarlo en \d+ s/ })).toBeDisabled();

  // Antes de confirmar, ingresar avisa y deja reenviar el enlace (con espera de 60 s).
  await ingresarCon(page, nueva.correo, nueva.contrasena);
  const aviso = page.getByRole('status').filter({ hasText: 'Confirma tu correo' });
  await expect(aviso).toBeVisible();
  await aviso.getByRole('button', { name: 'Reenviar el correo' }).click();
  await expect(aviso.getByRole('button', { name: /Puedes reenviarlo en \d+ s/ })).toBeDisabled();

  await page.goto(enlaceDelCorreo(nueva.correo, '/verificar-correo'));
  await boton(page, 'Confirmar mi correo').click();
  await expect(page.getByRole('heading', { name: 'Correo confirmado' })).toBeVisible();
  await page.getByRole('link', { name: 'Ingresar' }).last().click();
  await ingresarCon(page, nueva.correo, nueva.contrasena, false);
  await expect(page).not.toHaveURL(/\/ingresar/);
});

test('recuperar: respuesta genérica y contraseña nueva desde el enlace', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: '¿La olvidaste?' }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
  await expect(page.getByRole('heading', { name: 'Crea una contraseña nueva' })).toBeVisible();

  // Con un correo sin cuenta la respuesta es la misma.
  await page.getByLabel('Correo').fill(`nadie${marca}@nv.test`);
  await boton(page, 'Enviarme el enlace').click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await expect(
    page.getByText('Por seguridad no te decimos si el correo está registrado.'),
  ).toBeVisible();

  await page.goto('/recuperar');
  await page.getByLabel('Correo').fill(nueva.correo);
  await boton(page, 'Enviarme el enlace').click();
  await expect(page.getByText(`Si hay una cuenta con ${nueva.correo}`)).toBeVisible();

  await page.goto(enlaceDelCorreo(nueva.correo, '/restablecer'));
  await expect(page.getByRole('heading', { name: 'Tu contraseña nueva' })).toBeVisible();
  const clave = page.getByLabel('Contraseña nueva');
  await clave.fill('corta');
  await boton(page, 'Guardar contraseña').click();
  await expect(page.getByText('La contraseña aún no cumple los requisitos.')).toBeVisible();
  await clave.fill(nueva.otra);
  await boton(page, 'Guardar contraseña').click();
  await expect(page.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible();

  await ingresarCon(page, nueva.correo, nueva.contrasena);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' }),
  ).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(nueva.otra);
  await boton(page, 'Ingresar').click();
  await expect(page).not.toHaveURL(/\/ingresar/);
});

test('dos pasos: casillas del código, error, borrar, respaldo y pegar', async ({ page }) => {
  const correo = 'admin@nv.test';
  await ingresar(page, correo);
  await page.waitForURL(/\/(configurar-2fa|verificacion-2fa)/);
  let secreto: string;
  if (page.url().includes('/configurar-2fa')) {
    // Si esta prueba corre sola, primero se configura y se vuelve a entrar.
    secreto = await configurarDosPasos(page, correo);
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
    await ingresar(page, correo);
  } else {
    const guardado = leerSecretos()[correo];
    if (!guardado) throw new Error(`No hay secreto 2FA guardado para ${correo}.`);
    secreto = guardado;
  }
  await expect(page).toHaveURL(/\/verificacion-2fa/);
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();

  const digito = (n: number) => page.getByLabel(`Dígito ${n}`);
  await expect(digito(1)).toBeFocused();

  // Escribir avanza solo; Borrar en una casilla vacía vuelve a la anterior.
  await page.keyboard.type('12');
  await expect(digito(3)).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(digito(2)).toHaveValue('');
  await expect(digito(2)).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(digito(1)).toHaveValue('');

  // Un código incorrecto se envía solo al completar las 6 casillas y se limpia.
  await page.keyboard.type('000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Código incorrecto' })).toBeVisible();
  await expect(digito(6)).toHaveValue('');
  await expect(digito(1)).toBeFocused();

  // Código de respaldo y vuelta al de la app.
  await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
  await expect(page.getByLabel('Código de respaldo')).toBeVisible();
  await page.getByRole('button', { name: 'Usar el código de mi app' }).click();

  // Pegar el código completo lo reparte y entra.
  const codigo = await codigoSinUsar(page, correo, secreto);
  await digito(1).focus();
  await page.evaluate((texto) => {
    const datos = new DataTransfer();
    datos.setData('text', texto);
    document.activeElement?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }),
    );
  }, codigo);
  await expect(page).toHaveURL(/\/admin$/);
});

test.describe('en el teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('solo la tarjeta con la fila de marca, sin la navegación de la tienda', async ({ page }) => {
    await page.goto('/registro');
    await expect(
      page.getByText('Tu portal a todos los universos del entretenimiento.'),
    ).toBeVisible();
    await expect(page.getByText('Tus servicios en un panel')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Accesos rápidos' })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Acceso' })
      .getByRole('link', { name: 'Ingresar' })
      .click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

async function ingresarCon(page: Page, correo: string, contrasena: string, ir = true) {
  if (ir) await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await boton(page, 'Ingresar').click();
}
