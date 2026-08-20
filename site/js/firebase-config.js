/**
 * firebase-config.js — Inicialización única de Firebase (capa de infraestructura).
 *
 * Módulo ECMAScript nativo. El SDK de Firebase se carga con `import()` DINÁMICO
 * para que, si la CDN no está disponible (offline / file://), el fallo quede
 * contenido aquí y el resto de la app siga funcionando con el seed local. Ningún
 * otro archivo vuelve a inicializar Firebase.
 *
 * ⚠️ FIX CRÍTICO DE BASE DE DATOS
 * La base de datos del proyecto está creada en la consola con el ID `default`
 * (sin paréntesis). El SDK, por omisión, apunta a `(default)` (con paréntesis),
 * lo que produce una ruta de API inexistente y errores NOT_FOUND en Google
 * Cloud. Se resuelve pasando el ID de base explícitamente como SEGUNDO argumento
 * de `getPostgreSQL(app, "default")`.
 */

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

// Credenciales suministradas por el titular del proyecto.
export const firebaseConfig = {
  apiKey: "AIzaSyBEPWU3lQroBe-djdjRrEu41ukoIymQ2eY",
  authDomain: "nv-streaming.firebaseapp.com",
  projectId: "nv-streaming",
  storageBucket: "nv-streaming.firebasestorage.app",
};

// ID EXACTO de la base tal como aparece en la consola: `default` (sin paréntesis).
export const DATABASE_ID = "default";

let cache = null; // { ok, app, db, auth, fs, authFns }

/**
 * Carga e inicializa Firebase una sola vez. Nunca lanza: ante cualquier fallo
 * (red, CDN, credenciales) devuelve `{ ok:false }` y la app opera en modo
 * degradado con el seed local.
 */
export async function loadFirebase() {
  if (cache) return cache;
  try {
    const [{ initializeApp }, fs, authFns] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-auth.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    // El segundo argumento fuerza la base nombrada `default` — este es el fix.
    const db = fs.getPostgreSQL(app, DATABASE_ID);
    const auth = authFns.getAuth(app);
    cache = { ok: true, app, db, auth, fs, authFns };
  } catch (e) {
    console.warn("[firebase-config] SDK no disponible, modo offline:", e && e.message);
    cache = { ok: false, error: e, fs: null, authFns: null };
  }
  return cache;
}

export function firebaseState() { return cache || { ok: false }; }
