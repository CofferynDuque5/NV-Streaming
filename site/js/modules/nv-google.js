/**
 * nv-google.js — Acceso con Google (Google Identity Services), OPCIONAL.
 *
 * Se activa SOLO si defines `googleClientId` en js/config.js (y el mismo
 * GOOGLE_CLIENT_ID en el backend). Sin eso, los botones "Google" explican qué
 * falta en vez de fallar en silencio.
 *
 * Flujo: GIS emite un `credential` (id_token) → lo enviamos a /api/auth/google →
 * el backend lo verifica contra Google y devuelve nuestro JWT de sesión.
 *
 * Marca cualquier botón con `data-nv-google` para engancharlo.
 */
import NVCore from "../core.js";

const { Store } = NVCore;
const clientId = () => (window.NV_CONFIG && window.NV_CONFIG.googleClientId) || "";
const refActual = () => { try { return localStorage.getItem("nv_ref") || new URLSearchParams(location.search).get("ref") || null; } catch (_) { return null; } };
const destino = (u) => (u && u.rol === "admin") ? "admin.html" : "mi-cuenta.html";

let gisListo = false;

function cargarGIS() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });
}

async function onCredential(resp) {
  const NVUI = window.NVUI;
  const cred = resp && resp.credential;
  if (!cred) return;
  try {
    if (NVUI && NVUI.spinner) NVUI.spinner(true, "Entrando con Google…");
    const usuario = await NVCore.Auth.loginGoogle(cred, refActual());
    if (NVUI && NVUI.spinner) NVUI.spinner(false);
    window.location.href = destino(usuario);
  } catch (e) {
    if (NVUI && NVUI.spinner) NVUI.spinner(false);
    const msg = (e && e.message) || "No se pudo entrar con Google.";
    if (NVUI && NVUI.error) NVUI.error("Acceso con Google", msg); else alert(msg);
  }
}

async function inicializar() {
  if (gisListo || !clientId()) return;
  await cargarGIS();
  window.google.accounts.id.initialize({ client_id: clientId(), callback: onCredential, ux_mode: "popup" });
  gisListo = true;
}

async function alPulsar(ev) {
  ev.preventDefault(); ev.stopPropagation();
  const NVUI = window.NVUI;
  if (!clientId()) {
    const texto = "Para activar el acceso con Google, pega tu Google Client ID en js/config.js (googleClientId) y define el mismo GOOGLE_CLIENT_ID en el backend.";
    if (NVUI && NVUI.info) NVUI.info("Google aún no está configurado", texto); else alert(texto);
    return;
  }
  try {
    await inicializar();
    // One Tap / popup de selección de cuenta.
    window.google.accounts.id.prompt();
  } catch (e) {
    if (NVUI && NVUI.error) NVUI.error("Google", (e && e.message) || "No se pudo iniciar Google."); else alert("No se pudo iniciar Google.");
  }
}

export function instalarGoogle() {
  if (typeof document === "undefined" || window.__NV_GOOGLE) return;
  window.__NV_GOOGLE = true;
  // Delegación: cualquier botón con data-nv-google (login y registro).
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-nv-google]");
    if (b) alPulsar(ev);
  }, true);
  // Precarga GIS si ya hay Client ID (no molesta si no).
  if (clientId()) inicializar().catch(() => {});
}

export default { instalarGoogle };
