import { expect, type Locator, type Page, test } from '@playwright/test';
import { entrarEquipo } from './ayudas';

// Proyecto «editor» (ver playwright.config.ts): corre después de roles.spec.ts, que deja
// configurada la verificación en dos pasos de administración y operación.
test.describe.configure({ mode: 'serial' });

const ORIGINAL = 'Todos tus universos, en un solo portal';
const NUEVO = 'Streaming autorizado, ahora editado desde el panel';
const RUTA_PRUEBA = '/prueba-del-editor';

async function abrirPortada(page: Page) {
  await page.goto('/admin/sitio');
  await expect(page.getByRole('heading', { level: 1, name: 'Sitio y páginas' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar NV Streaming (/)' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'NV Streaming' })).toBeVisible();
}

const bloque = (page: Page, texto: string | RegExp) =>
  page.getByRole('button', { name: typeof texto === 'string' ? new RegExp(`^${texto}`) : texto });

const editar = (page: Page) => page.getByRole('complementary', { name: 'Editar el bloque' });

async function publicar(page: Page, nota: string) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Publicar página' });
  await panel.getByLabel(/Nota de la versión/).fill(nota);
  await panel.getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText(/publicada como versión \d+\. Ya se ve en la tienda/)).toBeVisible();
  await expect(panel).toBeHidden();
}

/** Arrastra el asa de un bloque hasta la mitad superior de otra fila de la lista. */
async function arrastrar(page: Page, asa: Locator, destino: Locator) {
  const a = await asa.boundingBox();
  const d = await destino.boundingBox();
  if (!a || !d) throw new Error('No se ve la lista de bloques.');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, d.y + 6, { steps: 8 });
  await page.mouse.up();
}

test('administración elige bloques en la vista previa, reordena, deshace y publica', async ({
  page,
}) => {
  await entrarEquipo(page, 'admin@nv.test');
  await page.waitForURL(/\/admin$/);
  await abrirPortada(page);

  const vista = page.getByRole('region', { name: 'Vista previa' });
  await expect(vista.getByRole('heading', { name: ORIGINAL })).toBeVisible();

  // Un clic en la vista previa elige el bloque y lo abre en «Editar».
  await vista.getByRole('heading', { name: 'Elige tu universo' }).click();
  await expect(editar(page).getByRole('heading', { level: 2, name: 'Universos' })).toBeVisible();
  await expect(bloque(page, 'Bloque 4: Universos')).toHaveAttribute('aria-current', 'true');

  // Arrastrar el asa reordena; «Deshacer» lo devuelve a su sitio.
  await arrastrar(
    page,
    page.getByRole('button', { name: /^Mover el bloque 3/ }),
    page.locator('li.ed-b').nth(1),
  );
  await expect(bloque(page, 'Bloque 2: Beneficios')).toBeVisible();
  await expect(page.getByText('Beneficios ahora es el bloque 2')).toBeVisible();
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer el último cambio' }).click();
  await expect(bloque(page, 'Bloque 3: Beneficios')).toBeVisible();
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0);

  // Con el teclado: el asa enfocada mueve el bloque con las flechas.
  await page.getByRole('button', { name: /^Mover el bloque 3/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(bloque(page, 'Bloque 2: Beneficios')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer el último cambio' }).click();
  await expect(bloque(page, 'Bloque 3: Beneficios')).toBeVisible();

  // Editar el título de la portada se ve al instante en la vista previa.
  await bloque(page, 'Bloque 1: Portada').click();
  await editar(page).getByLabel('Título', { exact: true }).fill(NUEVO);
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await expect(vista.getByRole('heading', { name: NUEVO })).toBeVisible();

  // Anchos de la vista previa.
  await vista.getByRole('button', { name: 'Móvil' }).click();
  await expect(vista.getByRole('button', { name: 'Móvil' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0);

  await publicar(page, 'Prueba del editor');
  await expect(page.locator('.ed-top').getByText('Publicada v2')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NUEVO);
  await expect(page).toHaveTitle('NV Streaming');

  // Vuelve a la versión original para no afectar a otras pruebas (con confirmación en la página).
  await abrirPortada(page);
  await page.getByRole('button', { name: 'Historial de versiones' }).click();
  const historial = page.getByRole('dialog', { name: 'Historial de versiones' });
  await historial.getByRole('button', { name: 'Copiar la versión 1 al borrador' }).click();
  await historial
    .getByRole('alertdialog', { name: '¿Copiar la versión 1 al borrador?' })
    .getByRole('button', { name: 'Copiar al borrador' })
    .click();
  await expect(page.getByText('Versión 1 copiada al borrador')).toBeVisible();
  await expect(vista.getByRole('heading', { name: ORIGINAL })).toBeVisible();
  await publicar(page, 'Portada original');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('en un solo portal');
});

test('administración crea una página con la ruta validada en vivo y ve el conflicto al guardar', async ({
  page,
  context,
}) => {
  await entrarEquipo(page, 'admin@nv.test');
  await page.waitForURL(/\/admin$/);
  await page.goto('/admin/sitio');
  await page.getByRole('button', { name: 'Nueva página' }).click();
  const panel = page.getByRole('dialog', { name: 'Nueva página' });
  await panel.getByLabel('Título', { exact: true }).fill('Prueba del editor');
  await expect(panel.getByLabel(/Ruta/)).toHaveValue(RUTA_PRUEBA);
  await panel.getByLabel(/Ruta/).fill('/catalogo');
  await expect(panel.getByText('/catalogo la usa la tienda. Elige otra ruta.')).toBeVisible();
  await panel.getByLabel(/Ruta/).fill('/');
  await expect(panel.getByText(/Ya existe una página en \//)).toBeVisible();
  await panel.getByLabel(/Ruta/).fill(RUTA_PRUEBA);
  await expect(panel.getByText('Disponible')).toBeVisible();
  await panel.getByRole('button', { name: 'Crear página' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Prueba del editor' })).toBeVisible();
  await expect(page.getByText('Página creada como borrador')).toBeVisible();

  // Una página nueva empieza vacía: se añade un bloque desde la galería.
  await page.getByRole('button', { name: 'Añadir bloque' }).first().click();
  const galeria = page.getByRole('dialog', { name: 'Añadir bloque' });
  await expect(galeria.getByText('0 de 40 bloques')).toBeVisible();
  await galeria.getByRole('button', { name: /^Texto/ }).click();
  await expect(bloque(page, 'Bloque 1: Texto')).toBeVisible();
  await editar(page)
    .getByLabel(/^Título/)
    .fill('Primera versión');
  // Sin contenido, el bloque queda por revisar y no se guarda.
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('No se guardó: hay 1 bloque por revisar')).toBeVisible();
  await editar(page)
    .getByLabel(/^Contenido/)
    .fill('Una página de prueba.');
  await expect(bloque(page, 'Bloque 1: Texto, por revisar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();

  // Otra pestaña guarda mientras esta sigue con el borrador anterior.
  const otra = await context.newPage();
  await otra.goto(page.url());
  await otra.getByRole('button', { name: /^Bloque 1: Texto/ }).click();
  await editar(otra)
    .getByLabel(/^Título/)
    .fill('Cambio de la otra pestaña');
  await otra.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(otra.getByText('Borrador guardado')).toBeVisible();
  await otra.close();

  await editar(page)
    .getByLabel(/^Título/)
    .fill('Cambio que choca');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('No se guardó: hay una versión más reciente')).toBeVisible();
  await expect(page.getByText(/guardó esta página mientras editabas/)).toBeVisible();
  await page
    .getByRole('button', { name: /Descartar mis cambios y cargar la versión más reciente/ })
    .click();
  await expect(page.getByText(/guardó esta página mientras editabas/)).toHaveCount(0);
  await expect(editar(page).getByLabel(/^Título/)).toHaveValue('Cambio de la otra pestaña');
});

test('administración crea «Quiénes somos» con la plantilla, escribe su historia y la publica', async ({
  page,
}) => {
  const HISTORIA = 'Empezamos NV para que comprar servicios digitales fuera fácil y seguro.';
  const pie = () => page.getByRole('contentinfo');

  // Sin publicar, el pie no la enlaza y la ruta no existe.
  await page.goto('/');
  await expect(pie().getByRole('link', { name: 'Soporte', exact: true })).toBeVisible();
  await expect(pie().getByRole('link', { name: 'Quiénes somos' })).toHaveCount(0);

  await entrarEquipo(page, 'admin@nv.test');
  await page.waitForURL(/\/admin$/);
  await page.goto('/admin/sitio');
  await page.getByRole('button', { name: 'Nueva página' }).click();
  const panel = page.getByRole('dialog', { name: 'Nueva página' });
  const plantillas = panel.getByRole('group', { name: /Empezar con una plantilla/ });
  await expect(plantillas.getByRole('radio', { name: /Página en blanco/ })).toBeChecked();
  await plantillas.getByText('Quiénes somos', { exact: true }).click();
  await expect(plantillas.getByRole('radio', { name: /Quiénes somos/ })).toBeChecked();
  await expect(panel.getByLabel('Título', { exact: true })).toHaveValue('Quiénes somos');
  await expect(panel.getByLabel(/Ruta/)).toHaveValue('/quienes-somos');
  await expect(panel.getByLabel(/Descripción/)).toHaveValue(/^Conoce NV Streaming/);
  await expect(panel.getByText('Disponible')).toBeVisible();
  await panel.getByRole('button', { name: 'Crear página' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Quiénes somos' })).toBeVisible();
  await expect(page.getByText(/creada como borrador con la plantilla Quiénes somos/)).toBeVisible();
  await expect(bloque(page, 'Bloque 9: Llamada')).toBeVisible();
  const vista = page.getByRole('region', { name: 'Vista previa' });
  await expect(vista.getByRole('heading', { name: 'Nuestra historia' })).toBeVisible();

  // La historia trae un borrador que hay que reescribir.
  await bloque(page, 'Bloque 2: Texto').click();
  const contenido = editar(page).getByLabel(/^Contenido/);
  await expect(contenido).toHaveValue(/Nathan y Valeryn/);
  await contenido.fill(`**NV** son las iniciales de **Nathan y Valeryn**.\n\n${HISTORIA}`);
  await expect(vista.getByText(HISTORIA)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await publicar(page, 'Primera versión de Quiénes somos');

  // Publicada: el pie la enlaza y la página se ve con sus bloques.
  await page.goto('/');
  await pie().getByRole('link', { name: 'Quiénes somos' }).click();
  await page.waitForURL(/\/quienes-somos$/);
  await expect(page).toHaveTitle('Quiénes somos · NV Streaming');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Servicios digitales autorizados para Venezuela',
  );
  await expect(page.getByText(HISTORIA)).toBeVisible();
  await expect(page.getByText(/Borrador: reemplaza este párrafo/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Lo que nos importa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preguntas sobre NV' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Escríbenos' })).toHaveAttribute(
    'href',
    '/cuenta/soporte/nueva',
  );
  await expect(pie().getByRole('link', { name: 'Quiénes somos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /^Conoce NV Streaming/,
  );
});

test('operación guarda borradores pero no publica ni cambia la paleta', async ({ page }) => {
  await entrarEquipo(page, 'operador@nv.test');
  await page.waitForURL((url) => !url.pathname.startsWith('/ingresar'));
  await page.goto('/admin/sitio');
  await expect(page.getByText('Solo administración cambia la paleta.')).toBeVisible();
  await page.getByRole('link', { name: `Editar Prueba del editor (${RUTA_PRUEBA})` }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Prueba del editor' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toHaveCount(0);
  await expect(page.getByText('Administración revisa y publica')).toBeVisible();

  await bloque(page, 'Bloque 1: Texto').click();
  await editar(page)
    .getByLabel(/^Título/)
    .fill('Propuesta de operación');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();

  // El historial se puede consultar, pero copiar una versión es de administración.
  await page.getByRole('button', { name: 'Historial de versiones' }).click();
  const historial = page.getByRole('dialog', { name: 'Historial de versiones' });
  await expect(historial.getByText('Aún no hay versiones')).toBeVisible();
});
