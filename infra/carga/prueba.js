// ─────────────────────────────────────────────────────────────────────────────
// Prueba de carga de NV Streaming con k6 (gratis, código abierto).
// Se ejecuta con la imagen oficial de Docker, sin instalar nada:
//
//   docker run --rm -i --network host -v "$PWD/infra/carga:/carga" grafana/k6 run \
//     -e BASE_URL=https://tudominio.com \
//     -e CORREO=cliente-de-prueba@tudominio.com -e CONTRASENA='...' \
//     /carga/prueba.js
//
// Variables: BASE_URL (obligatoria), CORREO y CONTRASENA de una cuenta de CLIENTE de
// prueba sin 2FA (sin ellas se omiten el panel y el inicio de sesión), VUS (visitantes
// simultáneos en las páginas públicas, 30), VUS_PANEL (10), DURACION (1m),
// INSEGURO=1 (acepta certificados autofirmados; solo pruebas locales).
// Más detalles y cifras de referencia en docs/OPERACION.md, «Prueba de carga».
// ─────────────────────────────────────────────────────────────────────────────
import { check, fail, sleep } from 'k6';
import http from 'k6/http';

const BASE = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!BASE) fail('Indica BASE_URL, p. ej. -e BASE_URL=https://tudominio.com');
const CORREO = __ENV.CORREO || '';
const CONTRASENA = __ENV.CONTRASENA || '';
const CON_CUENTA = CORREO !== '' && CONTRASENA !== '';
const VUS = Number(__ENV.VUS || 30);
const VUS_PANEL = Number(__ENV.VUS_PANEL || 10);
const DURACION = __ENV.DURACION || '1m';
// La API exige la cabecera Origin de la web en los POST (protección CSRF).
const CABECERAS_POST = { 'Content-Type': 'application/json', Origin: BASE };

const escenarios = {
  publico: {
    executor: 'ramping-vus',
    exec: 'publico',
    startVUs: 0,
    stages: [
      { duration: '20s', target: VUS },
      { duration: DURACION, target: VUS },
      { duration: '10s', target: 0 },
    ],
  },
};
if (CON_CUENTA) {
  escenarios.panel = {
    executor: 'constant-vus',
    exec: 'panel',
    vus: VUS_PANEL,
    duration: DURACION,
    startTime: '20s',
  };
  // Pocos inicios de sesión: la API limita 8 intentos por cuenta cada 15 minutos.
  escenarios.acceso = {
    executor: 'per-vu-iterations',
    exec: 'acceso',
    vus: 1,
    iterations: 3,
    startTime: '25s',
    maxDuration: '2m',
  };
}

export const options = {
  scenarios: escenarios,
  insecureSkipTLSVerify: __ENV.INSEGURO === '1',
  thresholds: {
    // Menos del 1 % de errores y comprobaciones correctas.
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // Tiempo de respuesta del percentil 95 por página (medido en el servidor).
    'http_req_duration{pagina:inicio}': ['p(95)<800'],
    'http_req_duration{pagina:planes}': ['p(95)<800'],
    'http_req_duration{pagina:ingresar}': ['p(95)<500'],
    'http_req_duration{pagina:salud}': ['p(95)<300'],
    ...(CON_CUENTA
      ? {
          'http_req_duration{pagina:panel}': ['p(95)<1200'],
          'http_req_duration{pagina:sesion}': ['p(95)<400'],
          // Argon2id es lento a propósito (protege las contraseñas).
          'http_req_duration{pagina:login}': ['p(95)<2000'],
        }
      : {}),
  },
};

function iniciarSesion() {
  const r = http.post(
    `${BASE}/api/v1/auth/inicio-sesion`,
    JSON.stringify({ correo: CORREO, contrasena: CONTRASENA }),
    { headers: CABECERAS_POST, tags: { pagina: 'login' } },
  );
  check(r, { 'inicio de sesión 200': (x) => x.status === 200 });
  if (r.status !== 200) fail(`No se pudo iniciar sesión (${r.status}): ${r.body}`);
  if (r.json('pendiente'))
    fail('La cuenta de prueba pide 2FA o verificación: usa un cliente sin 2FA.');
  return r;
}

// Una sola sesión para todo el escenario «panel» (respeta el límite de inicios de sesión).
export function setup() {
  if (!CON_CUENTA) return { cookies: {} };
  const r = iniciarSesion();
  const cookies = {};
  for (const [nombre, valores] of Object.entries(r.cookies)) cookies[nombre] = valores[0].value;
  return { cookies };
}

export function publico() {
  const inicio = http.get(`${BASE}/`, { tags: { pagina: 'inicio' } });
  check(inicio, { 'portada 200': (r) => r.status === 200 && r.body.includes('<html') });
  sleep(1 + Math.random() * 2);
  const planes = http.get(`${BASE}/planes`, { tags: { pagina: 'planes' } });
  check(planes, { 'planes 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
  const ingresar = http.get(`${BASE}/ingresar`, { tags: { pagina: 'ingresar' } });
  check(ingresar, { 'ingresar 200': (r) => r.status === 200 });
  const salud = http.get(`${BASE}/api/v1/salud`, { tags: { pagina: 'salud' } });
  check(salud, { 'salud 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
}

export function panel(datos) {
  const jar = http.cookieJar();
  for (const [nombre, valor] of Object.entries(datos.cookies)) jar.set(BASE, nombre, valor);
  const vista = http.get(`${BASE}/cuenta`, { tags: { pagina: 'panel' }, redirects: 0 });
  check(vista, { 'panel del cliente 200': (r) => r.status === 200 });
  const sesion = http.get(`${BASE}/api/v1/auth/sesion`, { tags: { pagina: 'sesion' } });
  check(sesion, { 'sesión activa': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}

export function acceso() {
  iniciarSesion();
  // Sin cuerpo y sin Content-Type (un JSON vacío se rechaza).
  const salir = http.post(`${BASE}/api/v1/auth/cierre-sesion`, null, {
    headers: { Origin: BASE },
    tags: { pagina: 'logout' },
  });
  check(salir, { 'cierre de sesión 204': (r) => r.status === 204 });
  sleep(20);
}
