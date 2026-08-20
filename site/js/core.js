/**
 * core.js — NVCore v12.1 · Gateway único de cliente de NV Streaming.
 *
 * Expone el objeto global `window.NVCore`, la ÚNICA puerta entre la aplicación
 * y la infraestructura (Firebase). Ningún componente accede a PostgreSQL
 * directamente; todo pasa por NVCore.{Auth,DB,Store,Bus,Utils,Theme}.
 *
 * El SDK de Firebase se inyecta en runtime vía `firebase-config.loadFirebase()`
 * (import dinámico). Si no está disponible, NVCore opera en modo degradado: el
 * Store se llena desde el seed local y las escrituras se simulan en memoria, de
 * modo que la UI nunca queda vacía ni rota.
 *
 * Arquitectura (Documento 1 · Cap. 6–9): Store (estado único) · Bus (eventos
 * "dominio:evento") · DB (colas reactivas SIN orderBy → orden en cliente para
 * anular FAILED_PRECONDITION) · Auth · Utils (moneda/formato) · Theme (No-Code).
 */

import { NVApi } from "./services/nv-api.js";

/* ══════════════════════════════  BUS  ══════════════════════════════ */
class EventBus {
  constructor() { this._map = new Map(); }
  on(evt, fn) { if (!this._map.has(evt)) this._map.set(evt, new Set()); this._map.get(evt).add(fn); return () => this.off(evt, fn); }
  once(evt, fn) { const w = (p) => { this.off(evt, w); fn(p); }; return this.on(evt, w); }
  off(evt, fn) { const s = this._map.get(evt); if (s) s.delete(fn); }
  emit(evt, payload) { const s = this._map.get(evt); if (s) for (const fn of [...s]) { try { fn(payload); } catch (e) { console.error("[Bus]", evt, e); } } }
}

/* ══════════════════════════════  STORE  ══════════════════════════════ */
class Store {
  constructor(bus) { this._state = {}; this._subs = new Map(); this._bus = bus; }
  get(key) { return this._state[key]; }
  getAll() { return this._state; }
  set(key, value) {
    this._state[key] = value;
    const s = this._subs.get(key);
    if (s) for (const fn of [...s]) { try { fn(value); } catch (e) { console.error("[Store]", key, e); } }
    this._bus.emit("store:" + key, value);
    this._bus.emit("store:changed", { key, value });
  }
  patch(key, partial) { this.set(key, Object.assign({}, this._state[key], partial)); }
  subscribe(key, fn) {
    if (!this._subs.has(key)) this._subs.set(key, new Set());
    this._subs.get(key).add(fn);
    if (this._state[key] !== undefined) { try { fn(this._state[key]); } catch (e) {} }
    return () => { const s = this._subs.get(key); if (s) s.delete(fn); };
  }
}

/* ══════════════════════════════  DB (API REST · PostgreSQL)  ══════════════════
 * Reimplementación de la capa de datos sobre el backend Node/Postgres (Fase 3).
 * Misma interfaz que antes (watch/getAll/getOne/add/setOne/update/remove) para
 * que el resto de la app no cambie. `watch` hace fetch + polling (casi tiempo
 * real). Las colecciones con lógica de servidor (pedidos, recargas) usan sus
 * endpoints dedicados en `add`. */
// Colecciones servidas por ENDPOINTS DEDICADOS (no CMS): pedidos y billetera.
// Se enrutan según el rol (admin ve todo; cliente lo suyo).
const ENDPOINT_FETCH = {
  pedidos: () => (esAdminSesion() ? NVApi.pedidos() : NVApi.misPedidos()),
  recargas: () => (esAdminSesion() ? NVApi.recargasPendientes() : NVApi.misRecargas()),
  recargas_billetera: () => (esAdminSesion() ? NVApi.recargasPendientes() : NVApi.misRecargas()),
  historial_movimientos: () => NVApi.wallet().then((w) => {
    // El endpoint /wallet ya trae saldo + movimientos + stats secundarias
    // (reservado, gastadoMes, totalMovimientos, usoSaldo). Guardamos las stats
    // en el Store para que la vista de billetera las pinte (ver ux-fixes.js).
    try { store.set("billeteraStats", (w && w.stats) || null); } catch (_) {}
    return (w && w.movimientos) || [];
  }),
};

// Colecciones "por usuario" (dueño o admin): van a /api/mis o /api/admin/docs.
const USER_COLS = new Set(["suscripciones", "tickets_soporte", "chats_soporte", "notificaciones"]);
const CLIENT_CREATE = new Set(["tickets_soporte", "chats_soporte"]); // el cliente puede crear
function esAdminSesion() { try { return (store.get("sesion") && store.get("sesion").usuario && store.get("sesion").usuario.rol) === "admin"; } catch (_) { return false; } }

class DB {
  constructor() { this._online = false; this._poll = 15000; }
  attach(state) { this._online = !!(state && state.ok); }
  get online() { return this._online; }

  async getAll(coll) { return USER_COLS.has(coll) ? (esAdminSesion() ? NVApi.docsAdmin(coll) : NVApi.misDocs(coll)) : NVApi.coleccion(coll); }
  async getOne(coll, id) {
    try { return USER_COLS.has(coll) ? await NVApi.docUsuario(coll, id) : await NVApi.doc(coll, id); }
    catch (e) { if (e && e.status === 404) return null; throw e; }
  }
  /** Fetch inicial + polling. Devuelve unsubscribe (corta el polling). */
  watch(coll, onData, onError) {
    let vivo = true;
    // Las colecciones por-usuario van a /mis (cliente) o /admin/docs (admin);
    // el resto (contenido de tienda) al CMS público.
    const traer = () => ENDPOINT_FETCH[coll]
      ? ENDPOINT_FETCH[coll]()
      : (USER_COLS.has(coll)
        ? (esAdminSesion() ? NVApi.docsAdmin(coll) : NVApi.misDocs(coll))
        : NVApi.coleccion(coll));
    const cargar = () => traer()
      .then((docs) => { if (vivo) onData(docs || []); })
      .catch((err) => { if (vivo && onError) onError(err); });
    cargar();
    const t = setInterval(cargar, this._poll);
    // Las colecciones que dependen del rol (pedidos, billetera, por-usuario) se
    // recargan al cambiar la sesión (evita la carrera login ↔ primer fetch).
    let offIn = () => {}, offOut = () => {};
    if (ENDPOINT_FETCH[coll] || USER_COLS.has(coll)) { offIn = bus.on("user:login", cargar); offOut = bus.on("user:logout", cargar); }
    return () => { vivo = false; clearInterval(t); offIn(); offOut(); };
  }
  async add(coll, data) {
    // Colecciones con endpoint dedicado (el servidor pone precio/valida).
    if (coll === "pedidos") { const r = await NVApi.crearPedido(data); return (r && r.pedido && r.pedido.id) || null; }
    if (coll === "recargas_billetera") { const r = await NVApi.solicitarRecarga(data); return (r && r.recarga && r.recarga.id) || null; }
    if (CLIENT_CREATE.has(coll)) { const r = await NVApi.crearMiDoc(coll, data); return (r && r.id) || null; } // cliente abre ticket
    if (USER_COLS.has(coll)) { const id = "d_" + Date.now().toString(36); await NVApi.guardarDocUsuario(coll, id, Object.assign({ id }, data)); return id; }
    // CMS genérico: id de cliente + upsert (requiere admin en el backend).
    const id = "doc_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    await NVApi.guardarDoc(coll, id, Object.assign({ id }, data));
    return id;
  }
  async setOne(coll, id, data) {
    if (USER_COLS.has(coll)) { await NVApi.guardarDocUsuario(coll, id, Object.assign({ id }, data)); return id; }
    await NVApi.guardarDoc(coll, id, Object.assign({ id }, data)); return id;
  }
  async update(coll, id, patch) {
    const actual = (await this.getOne(coll, id)) || {};
    const merged = Object.assign({}, actual, patch, { id });
    if (USER_COLS.has(coll)) { await NVApi.guardarDocUsuario(coll, id, merged); return; }
    await NVApi.guardarDoc(coll, id, merged);
  }
  async remove(coll, id) { if (USER_COLS.has(coll)) { await NVApi.borrarDocUsuario(coll, id); return; } await NVApi.borrarDoc(coll, id); }
  async transaction() { throw new Error("transaction() no aplica en modo API: usa los endpoints del servidor (p.ej. /wallet/recargas/:id/aprobar)."); }
  // Helpers de campo: sin PostgreSQL, valores planos.
  get fx() {
    return {
      serverTimestamp: () => new Date().toISOString(),
      arrayUnion: (...v) => v,
    };
  }
}

/* ══════════════════════════════  AUTH (API REST · JWT)  ══════════════════════
 * Sesión sobre el backend Node/Postgres con JWT (localStorage). Misma interfaz
 * (login/register/logout/iniciarObservadorSesion) que la versión Firebase. */
function mapUsuario(u) {
  if (!u) return null;
  return {
    uid: u.id, email: u.email || "", nombre: u.nombre || "", rol: u.rol || "cliente",
    saldoBilletera: Number(u.saldo) || 0, activo: true, baneado: false,
  };
}
class Auth {
  constructor(db, store, bus) { this._db = db; this._store = store; this._bus = bus; this.usuario = null; }
  attach() {}

  _aplicarSesion(u) {
    this.usuario = mapUsuario(u);
    this._store.set("sesion", { estado: "autenticado", usuario: this.usuario });
    this._bus.emit("user:login", this.usuario);
    return this.usuario;
  }
  _anonimo(cb) {
    this.usuario = null;
    this._store.set("sesion", { estado: "anonimo", usuario: null });
    if (cb) cb(null);
  }

  /** Restaura la sesión desde el token guardado (si lo hay). */
  iniciarObservadorSesion(cb) {
    (async () => {
      if (!NVApi.getToken()) { this._anonimo(cb); return; }
      try {
        const r = await NVApi.me();
        this._aplicarSesion(r && r.usuario);
        if (cb) cb(this.usuario);
      } catch (_) {
        NVApi.logout();
        this._anonimo(cb);
      }
    })();
    return () => {};
  }
  async login(email, password) {
    const r = await NVApi.login(email, password);
    return this._aplicarSesion(r && r.usuario);
  }
  async register(email, password, extra = {}) {
    const r = await NVApi.register(email, password, extra.nombre || "");
    return this._aplicarSesion(r && r.usuario);
  }
  async logout() {
    NVApi.logout();
    this.usuario = null;
    this._store.set("sesion", { estado: "anonimo", usuario: null });
    this._bus.emit("user:logout");
  }
  esAdmin() { return this.usuario && this.usuario.rol === "admin"; }
  esRevendedor() { return this.usuario && (this.usuario.rol === "revendedor" || this.usuario.rol === "admin"); }
}

/* ══════════════════════════════  UTILS  ══════════════════════════════ */
const Utils = {
  MONEDAS: {
    USD: { simbolo: "$", nombre: "Dólar", campoTasa: null, decimales: 2 },
    VES: { simbolo: "Bs", nombre: "Bolívar", campoTasa: "tasa_bcv", decimales: 2 },
    COP: { simbolo: "$", nombre: "Peso COP", campoTasa: "tasa_cop", decimales: 0 },
    EUR: { simbolo: "€", nombre: "Euro", campoTasa: "tasa_eur", decimales: 2 },
    PEN: { simbolo: "S/", nombre: "Sol", campoTasa: "tasa_pen", decimales: 2 },
  },
  tasa(moneda, parametros) { const m = this.MONEDAS[moneda]; if (!m || !m.campoTasa) return 1; const t = parametros && parametros[m.campoTasa]; return typeof t === "number" && t > 0 ? t : 1; },
  convertir(usd, moneda, parametros) { return this.num(usd) * this.tasa(moneda, parametros); },
  formatear(usd, moneda, parametros) {
    const m = this.MONEDAS[moneda] || this.MONEDAS.USD;
    const val = this.convertir(usd, moneda, parametros);
    const s = val.toLocaleString("es-VE", { minimumFractionDigits: m.decimales, maximumFractionDigits: m.decimales });
    return moneda === "USD" ? `$${s}` : `${m.simbolo} ${s}`;
  },
  num(v) { if (typeof v === "number") return v; const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; },
  sanitize(str) { return String(str == null ? "" : str).replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;")); },
  interpolar(plantilla, datos) { return String(plantilla || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (datos[k] != null ? datos[k] : "")); },
  waLink(telefono, texto) { const t = String(telefono || "").replace(/[^\d]/g, ""); return `https://wa.me/${t}?text=${encodeURIComponent(texto || "")}`; },
  fecha(ts) { const d = this.toDate(ts); if (!d) return ""; return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }); },
  toDate(ts) { if (!ts) return null; if (ts instanceof Date) return ts; if (typeof ts.toDate === "function") return ts.toDate(); if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000); const d = new Date(ts); return isNaN(d) ? null : d; },
  sortBy(arr, campo, dir = "desc") { const copy = [...(arr || [])]; copy.sort((a, b) => { const va = this._c(a[campo]); const vb = this._c(b[campo]); return dir === "desc" ? vb - va : va - vb; }); return copy; },
  _c(v) { const d = this.toDate(v); if (d) return d.getTime(); if (typeof v === "number") return v; return 0; },
};

/* ══════════════════════════════  THEME  ══════════════════════════════ */
const Theme = {
  MAPA: { neon_cyan: "--neon-cyan", neon_purple: "--neon-purple", neon_green: "--neon-green", neon_orange: "--neon-orange", bg_space_core: "--bg-space-core", bg_space_dark: "--bg-space-dark", bg_surface_opaque: "--bg-surface", velocidad_transiciones: "--speed-trans", velocidad_marquesina: "--speed-marquee", curva_animacion: "--ease-curve" },
  FUENTES: { fuente_display: "--font-heading", fuente_body: "--font-body", fuente_sans: "--font-sans" },
  _fonts: new Set(),
  aplicar(tema) {
    if (!tema || typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [campo, cssVar] of Object.entries(this.MAPA)) if (tema[campo] != null && tema[campo] !== "") root.style.setProperty(cssVar, tema[campo]);
    for (const [campo, cssVar] of Object.entries(this.FUENTES)) { const fam = tema[campo]; if (fam) { root.style.setProperty(cssVar, `'${fam}', sans-serif`); this._cargarFuente(fam); } }
  },
  _cargarFuente(familia) {
    const key = String(familia).trim(); if (!key || this._fonts.has(key) || typeof document === "undefined") return;
    this._fonts.add(key);
    const link = document.createElement("link"); link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(key).replace(/%20/g, "+")}:wght@300;400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  },
};

/* ══════════════════════════════  ENSAMBLE  ══════════════════════════════ */
const bus = new EventBus();
const store = new Store(bus);
const db = new DB();
const auth = new Auth(db, store, bus);

let _readyPromise = null;

const NVCore = {
  version: "12.1",
  Bus: bus, Store: store, DB: db, Auth: auth, Utils, Theme,
  get online() { return db.online; },
  aplicarTema(tema) { Theme.aplicar(tema); store.set("tema", tema); },
  /** Comprueba el backend API (idempotente). Siempre resuelve; nunca rechaza.
   *  Si el backend no responde, opera en modo degradado (seed local). */
  init() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = NVApi.health().then((online) => {
      db.attach({ ok: online }); auth.attach({});
      bus.emit("core:ready", { online: db.online });
      return db.online;
    }).catch(() => { db.attach({ ok: false }); auth.attach({}); bus.emit("core:ready", { online: false }); return false; });
    return _readyPromise;
  },
  ready() { return _readyPromise || this.init(); },
};

if (typeof window !== "undefined") window.NVCore = NVCore;
export default NVCore;
export { NVCore, bus, store, db, auth, Utils, Theme };
