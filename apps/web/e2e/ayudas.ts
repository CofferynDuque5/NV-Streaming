import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { entornoE2e } from './entorno';

/** Secretos TOTP que crean las pruebas, para volver a entrar en otra prueba. Se borra al preparar. */
export const ARCHIVO_SECRETOS = 'test-results/secretos-2fa.json';

function leerSecretos(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(ARCHIVO_SECRETOS, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Último periodo TOTP usado por cada cuenta: la API rechaza repetir un código. */
export const ARCHIVO_PASOS = 'test-results/pasos-2fa.json';
const PERIODO_MS = 30_000;

function leerPasos(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(ARCHIVO_PASOS, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function guardarPaso(correo: string, paso: number) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(ARCHIVO_PASOS, JSON.stringify({ ...leerPasos(), [correo]: paso }));
}

/**
 * Código del periodo siguiente que esta cuenta aún no haya usado. Si otra prueba
 * ya gastó ese periodo, espera a que empiece el siguiente.
 */
export async function codigoSinUsar(page: Page, correo: string, secreto: string): Promise<string> {
  const ultimo = leerPasos()[correo] ?? -1;
  let paso = Math.floor(Date.now() / PERIODO_MS) + 1;
  if (paso <= ultimo) {
    await page.waitForTimeout(ultimo * PERIODO_MS - Date.now() + 1_000);
    paso = Math.floor(Date.now() / PERIODO_MS) + 1;
  }
  guardarPaso(correo, paso);
  return generate({ secret: secreto, epoch: paso * (PERIODO_MS / 1000) });
}

export const CONTRASENA_DEMO = 'NvDemo-2026!';

export async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_DEMO);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Recorre la configuración obligatoria de la verificación en dos pasos. */
export async function configurarDosPasos(page: Page, correo?: string) {
  await expect(page).toHaveURL(/\/configurar-2fa/);
  await page.getByRole('button', { name: 'Generar código QR' }).click();
  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  await page.getByText('¿No puedes escanearlo?').click();
  const secreto = (await page.locator('details code').innerText()).replace(/\s/g, '');
  const paso = Math.floor(Date.now() / PERIODO_MS);
  await page
    .getByLabel('Código de 6 dígitos')
    .fill(await generate({ secret: secreto, epoch: paso * (PERIODO_MS / 1000) }));
  await page.getByRole('button', { name: 'Activar verificación' }).click();
  if (correo) guardarPaso(correo, paso);
  await expect(page.getByText('Verificación en dos pasos activada')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Códigos de respaldo' }).getByRole('listitem'),
  ).toHaveCount(10);
  await page.getByLabel('Ya guardé mis códigos de respaldo').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  if (correo) {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(ARCHIVO_SECRETOS, JSON.stringify({ ...leerSecretos(), [correo]: secreto }));
  }
  return secreto;
}

/**
 * Entra con una persona del equipo: configura la verificación en dos pasos si
 * es la primera vez o usa el secreto guardado por una prueba anterior (con el
 * código del periodo siguiente, para no repetir uno ya usado).
 */
export async function entrarEquipo(page: Page, correo: string) {
  await ingresar(page, correo);
  await page.waitForURL(/\/(configurar-2fa|verificacion-2fa|admin|revendedor)/);
  if (page.url().includes('/configurar-2fa')) {
    await configurarDosPasos(page, correo);
  } else if (page.url().includes('/verificacion-2fa')) {
    const secreto = leerSecretos()[correo];
    if (!secreto) throw new Error(`No hay secreto 2FA guardado para ${correo}.`);
    await page.getByLabel('Código de 6 dígitos').fill(await codigoSinUsar(page, correo, secreto));
    await page.getByRole('button', { name: 'Verificar' }).click();
  }
}

/**
 * Vacía el límite de inicios de sesión por IP de la base de pruebas. Todos los
 * navegadores de la suite entran desde localhost y comparten ese límite (30 cada
 * 15 min): los proyectos que corren al final lo llaman antes de empezar.
 */
export function reiniciarLimiteIngreso(): void {
  const { url } = entornoE2e();
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    input: "DELETE FROM limites_uso WHERE clave LIKE 'login:ip:%';",
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}
