/**
 * nv-api.js — Cliente REST hacia el backend Node/PostgreSQL (Fase 3).
 *
 * Sustituye a PostgreSQL/Firebase como origen de datos y de sesión. La URL del
 * backend sale de NV_CONFIG.api.base. El token JWT se guarda en localStorage y
 * se envía como `Authorization: Bearer` en cada petición.
 */
const cfg = () => (typeof window !== "undefined" && window.NV_CONFIG) || {};
// Host del backend (p.ej. "http://localhost:3000"); las rutas van bajo /api.
const host = () => (((cfg().api && cfg().api.base) || "").replace(/\/+$/, "").replace(/\/api$/, ""));
const base = () => host() + "/api";

const TOKEN_KEY = "nv_token";
export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; } }
export function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const tk = getToken(); if (tk) headers.Authorization = "Bearer " + tk;
  const res = await fetch(base() + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
  if (!res.ok) {
    const err = new Error((data && (data.mensaje || data.error)) || ("HTTP " + res.status));
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

export const NVApi = {
  base, getToken, setToken,

  /** ¿El backend responde? (para decidir modo online/seed). */
  async health() {
    if (!host()) return false;
    try { const r = await fetch(host() + "/health", { method: "GET" }); return r.ok; } catch (_) { return false; }
  },

  // ── CMS / contenido ──
  async coleccion(coll) { const r = await req("GET", "/cms/" + encodeURIComponent(coll)); return (r && r.documentos) || []; },
  async doc(coll, id) { return req("GET", "/cms/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id)); },
  async guardarDoc(coll, id, data) { return req("PUT", "/cms/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id), data); },
  async borrarDoc(coll, id) { return req("DELETE", "/cms/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id)); },

  // ── Auth ──
  async register(email, password, nombre) { const r = await req("POST", "/auth/register", { email, password, nombre }); if (r && r.token) setToken(r.token); return r; },
  async login(email, password) { const r = await req("POST", "/auth/login", { email, password }); if (r && r.token) setToken(r.token); return r; },
  async me() { return req("GET", "/auth/me"); },
  logout() { setToken(""); },

  // ── Documentos por usuario (suscripciones, soporte, notificaciones) ──
  async misDocs(coll) { const r = await req("GET", "/mis/" + encodeURIComponent(coll)); return (r && r.documentos) || []; },
  async crearMiDoc(coll, data) { return req("POST", "/mis/" + encodeURIComponent(coll), data); },
  async docsAdmin(coll) { const r = await req("GET", "/admin/docs/" + encodeURIComponent(coll)); return (r && r.documentos) || []; },
  async docUsuario(coll, id) { return req("GET", "/admin/docs/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id)); },
  async guardarDocUsuario(coll, id, data) { return req("PUT", "/admin/docs/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id), data); },
  async borrarDocUsuario(coll, id) { return req("DELETE", "/admin/docs/" + encodeURIComponent(coll) + "/" + encodeURIComponent(id)); },

  // ── Comercio ──
  async crearPedido(body) { return req("POST", "/pedidos", body); },
  async misPedidos() { const r = await req("GET", "/pedidos/mios"); return (r && r.pedidos) || []; },
  async pedidos(estado) { const r = await req("GET", "/pedidos" + (estado ? "?estado=" + encodeURIComponent(estado) : "")); return (r && r.pedidos) || []; },
  async cambiarEstadoPedido(id, estado) { return req("POST", "/pedidos/" + encodeURIComponent(id) + "/estado", { estado }); },
  async wallet() { return req("GET", "/wallet"); },
  async solicitarRecarga(body) { return req("POST", "/wallet/recargas", body); },
  async misRecargas() { const r = await req("GET", "/wallet/recargas/mias"); return (r && r.recargas) || []; },
  async recargasPendientes() { const r = await req("GET", "/wallet/recargas"); return (r && r.recargas) || []; },
  async aprobarRecarga(id) { return req("POST", "/wallet/recargas/" + encodeURIComponent(id) + "/aprobar"); },
  async rechazarRecarga(id) { return req("POST", "/wallet/recargas/" + encodeURIComponent(id) + "/rechazar"); },
};

export default NVApi;
