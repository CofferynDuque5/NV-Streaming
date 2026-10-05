import { ANCLAS_POLITICAS, POLITICAS, POR_DEFINIR, REGLAS_COBRO } from '@nv/shared';
import { expect, type Page, test } from '@playwright/test';

const SECCIONES = [
  'Términos de uso',
  'Privacidad',
  'Pagos, renovaciones y reembolsos',
  'Entregas y activaciones',
  'Revendedores',
  'Cookies y almacenamiento',
  'Contacto',
];

/** El título de la sección queda a la vista, justo bajo la cabecera fija. */
async function tituloBajoCabecera(page: Page, id: string) {
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const cab = document.querySelector('[data-cabecera-tienda]')!.getBoundingClientRect();
        const barra = document.querySelector('nav[aria-label="En esta página"]');
        const bajo =
          barra && (barra as HTMLElement).offsetHeight
            ? barra.getBoundingClientRect().bottom
            : cab.bottom;
        const h = document.querySelector(`#${id} h2`)!.getBoundingClientRect();
        return h.top - Math.max(cab.bottom, bajo);
      }, id),
    )
    .toBeGreaterThanOrEqual(0);
  const distancia = await page.evaluate((id) => {
    const cab = document.querySelector('[data-cabecera-tienda]')!.getBoundingClientRect();
    return document.querySelector(`#${id} h2`)!.getBoundingClientRect().top - cab.bottom;
  }, id);
  expect(distancia).toBeLessThan(140);
}

test('políticas: versión, resumen, siete secciones, plazos reales y datos por definir', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });

  await page.goto('/politicas');
  await expect(page).toHaveTitle('Políticas y términos · NV Streaming');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /términos de uso, privacidad, pagos y reembolsos/,
  );
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Políticas y términos');
  await expect(main.getByText(`Versión ${POLITICAS.version} · vigente desde`)).toBeVisible();
  await expect(main.getByText('5 de octubre de 2026')).toBeVisible();
  const borrador = main.getByRole('note');
  await expect(borrador).toContainText(
    'Borrador: este texto debe revisarlo un abogado antes de publicarlo.',
  );
  const faltan = Object.values(POR_DEFINIR).filter((d) => d.valor === null).length;
  await expect(borrador).toContainText(`Tiene ${faltan} puntos marcados Por definir`);
  await expect(main.locator('[data-pd]')).toHaveCount(faltan);

  // Resumen y secciones numeradas, con su ancla.
  await expect(
    main.getByRole('heading', { level: 2, name: 'Lo esencial en 1 minuto' }),
  ).toBeVisible();
  await expect(main.locator('#esencial li')).toHaveCount(6);
  expect(await main.locator('section.pl-sec').evaluateAll((s) => s.map((x) => x.id))).toEqual([
    'esencial',
    ...ANCLAS_POLITICAS,
  ]);
  for (const [i, titulo] of SECCIONES.entries()) {
    await expect(main.locator(`#${ANCLAS_POLITICAS[i]} h2`)).toHaveText(titulo);
  }

  // Plazos de las reglas de cobro y cookies que el código pone de verdad.
  await expect(main.locator('#esencial')).toContainText(
    `${REGLAS_COBRO.diasGracia} días de gracia`,
  );
  await expect(main.locator('#reembolsos')).toContainText(
    `Tienes ${REGLAS_COBRO.diasParaPagar} días para pagar una factura emitida`,
  );
  const cookies = main.locator('#cookies code');
  // Sin HTTPS (pruebas) la API usa la cookie sin el prefijo __Host-.
  await expect(cookies).toHaveText(['nv_sesion', 'nv_moneda', 'nv_aviso_tasa', 'nv-carrito']);
  await expect(main.locator('#cookies')).toContainText(
    'Hasta 12 horas; se cierra tras 2 horas sin actividad',
  );
  await expect(main.locator('#privacidad')).toContainText('imagen o PDF de hasta 5 MB');
  await expect(main.locator('#reembolsos')).toContainText(
    'Te avisamos antes del vencimiento (7, 3 y 1 días antes)',
  );

  // El índice salta a la sección, la marca y deja el ancla en la dirección.
  const indice = page.getByRole('navigation', { name: 'Índice' });
  await indice.getByRole('link', { name: /Cookies/ }).click();
  await expect(page).toHaveURL(/\/politicas#cookies$/);
  await expect(indice.getByRole('link', { name: /Cookies/ })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(page.locator('#h-cookies')).toBeFocused();
  await tituloBajoCabecera(page, 'cookies');

  // Enlace dentro del texto a otra sección.
  await indice.getByRole('link', { name: /Términos/ }).click();
  await main.locator('#terminos').getByRole('link', { name: 'Revendedores' }).click();
  await expect(page).toHaveURL(/#revendedores$/);
  await expect(indice.getByRole('link', { name: /Revendedores/ })).toHaveAttribute(
    'aria-current',
    'location',
  );

  // Copiar enlace confirma con un aviso y en el propio botón.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await main.getByRole('button', { name: 'Copiar enlace a Privacidad' }).click();
  await expect(main.getByRole('button', { name: 'Enlace a Privacidad copiado' })).toContainText(
    'Enlace copiado',
  );
  await expect(page.getByText(/Enlace copiado: http.*\/politicas#privacidad/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/politicas#privacidad$/,
  );

  // Volver arriba.
  await indice.getByRole('link', { name: 'Volver arriba' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  // Contacto: una sola acción principal (sin WhatsApp configurado, el ticket).
  await expect(
    main.locator('#contacto').getByRole('link', { name: 'Abrir un ticket' }),
  ).toHaveAttribute('href', '/cuenta/soporte/nueva');
  expect(errores).toEqual([]);
});

test('políticas: /terminos y /privacidad llevan a su sección y los enlaces legales apuntan ahí', async ({
  page,
  request,
}) => {
  for (const [vieja, ancla] of [
    ['/terminos', 'terminos'],
    ['/privacidad', 'privacidad'],
  ] as const) {
    const r = await request.get(vieja, { maxRedirects: 0 });
    expect(r.status()).toBe(308);
    expect(r.headers().location).toBe(`/politicas#${ancla}`);
    await page.goto(vieja);
    await expect(page).toHaveURL(new RegExp(`/politicas#${ancla}$`));
    await expect(page.locator(`#h-${ancla}`)).toBeFocused();
    await tituloBajoCabecera(page, ancla);
  }

  // Pie de la tienda.
  await page.goto('/');
  const pie = page.getByRole('contentinfo');
  await expect(pie.getByRole('link', { name: 'Términos', exact: true })).toHaveAttribute(
    'href',
    '/politicas#terminos',
  );
  await pie.getByRole('link', { name: 'Privacidad', exact: true }).click();
  await expect(page).toHaveURL(/\/politicas#privacidad$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Privacidad', exact: true }),
  ).toBeInViewport();

  // Pie de ingresar y crear cuenta.
  await page.goto('/ingresar');
  const legales = page.getByRole('navigation', { name: 'Enlaces legales' });
  await expect(legales.getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
    'href',
    '/politicas#privacidad',
  );
  await legales.getByRole('link', { name: 'Términos' }).click();
  await expect(page).toHaveURL(/\/politicas#terminos$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Términos de uso' })).toBeInViewport();
});

test.describe('en el teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('políticas: el selector «En esta página» salta, se cierra y nada se sale de la pantalla', async ({
    page,
  }) => {
    await page.goto('/politicas');
    const selector = page.getByRole('navigation', { name: 'En esta página' });
    const boton = selector.getByRole('button');
    await expect(boton).toContainText('Lo esencial');
    await expect(page.getByRole('navigation', { name: 'Índice' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await boton.click();
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await selector.getByRole('link', { name: /Pagos y reembolsos/ }).click();
    await expect(page).toHaveURL(/#reembolsos$/);
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(selector.getByRole('list')).toBeHidden();
    await expect(boton).toContainText('Pagos y reembolsos');
    await tituloBajoCabecera(page, 'reembolsos');

    // «Volver arriba» flotante al bajar.
    const arriba = page.getByRole('button', { name: 'Volver arriba' });
    await expect(arriba).toBeVisible();
    await arriba.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(arriba).toBeHidden();
  });
});
