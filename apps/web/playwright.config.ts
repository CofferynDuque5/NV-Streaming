import { defineConfig, devices } from '@playwright/test';
import { entornoE2e } from './e2e/entorno';

/**
 * Pruebas de extremo a extremo: levantan la API y la web compiladas contra una
 * base de datos de pruebas que se vacía y se siembra antes de empezar.
 * Localmente se puede usar un Chromium ya instalado con NAVEGADOR_E2E=/ruta/al/chromium.
 */
const PUERTO_WEB = 3100;
// Las reescrituras /api de Next.js se fijan al compilar (API_URL_INTERNA, por defecto el puerto 4000).
const PUERTO_API = 4000;
const ORIGEN = `http://localhost:${PUERTO_WEB}`;
const { url, clave } = entornoE2e();

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: ORIGEN,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    ...(process.env.NAVEGADOR_E2E
      ? { launchOptions: { executablePath: process.env.NAVEGADOR_E2E } }
      : {}),
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /editor\.spec|revendedores\.spec/,
    },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /portada|cliente/ },
    // El editor publica la portada: se declara al final para que corra (con un solo worker)
    // después de roles.spec.ts, que deja configurada la verificación en dos pasos del equipo.
    { name: 'editor', use: { ...devices['Desktop Chrome'] }, testMatch: /editor\.spec/ },
    // Revendedores entra con el revendedor y la administración ya configurados por roles.spec.ts
    // (el orden alfabético lo pondría antes): va en un proyecto propio, declarado después.
    {
      name: 'revendedores',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /revendedores\.spec/,
    },
  ],
  webServer: [
    {
      command: 'node --enable-source-maps dist/main.js',
      cwd: '../api',
      url: `http://localhost:${PUERTO_API}/api/v1/salud`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: url,
        CLAVE_CIFRADO: clave,
        API_PUERTO: String(PUERTO_API),
        WEB_ORIGEN: ORIGEN,
        PROXIES_DE_CONFIANZA: '1',
        DOCS_API_HABILITADA: 'false',
        CORREO_PROVEEDOR: 'sandbox',
      },
    },
    {
      command: `pnpm exec next start -p ${PUERTO_WEB}`,
      url: ORIGEN,
      reuseExistingServer: false,
      env: { API_URL_INTERNA: `http://localhost:${PUERTO_API}` },
    },
  ],
});
