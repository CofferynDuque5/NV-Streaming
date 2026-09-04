/**
 * catalog-api.js — Conecta el frontend con el backend REAL (agente NV Stream).
 *
 * Hace `fetch` a `${API}/api/servicios` (por defecto http://localhost:3000) y
 * fusiona los **precios y el stock reales** sobre los servicios del Store
 * (conservando los visuales: logo, gradiente, categoría). Si el backend no está
 * disponible, no inventa datos: deja lo que haya y marca el estado.
 */
import NVCore from "../core.js";

const { Store, Bus } = NVCore;

function apiBase() {
  const c = (typeof window !== "undefined" && window.NV_CONFIG && window.NV_CONFIG.api) || {};
  return { base: c.base || (typeof location !== "undefined" ? location.origin : ""), path: c.servicios || "/api/servicios" };
}

export async function cargarCatalogoReal() {
  const { base, path } = apiBase();
  let data;
  try {
    const res = await fetch(base.replace(/\/$/, "") + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (e) {
    Store.patch("_meta", { catalogoReal: "offline" });
    Bus.emit("catalogo:real", { ok: false, error: String(e && e.message) });
    return { ok: false };
  }

  const reales = (data && data.servicios) || [];
  if (!reales.length) { Store.patch("_meta", { catalogoReal: "vacio" }); return { ok: true, total: 0 }; }

  // Índice por plataforma para fusionar precio/stock sobre lo existente.
  const idx = new Map();
  for (const r of reales) idx.set(String(r.plataforma_id || r.id), r);

  const servicios = (Store.get("servicios") || []).map((s) => {
    const r = idx.get(s.id_servicio) || idx.get(s.id);
    if (!r) return s;
    const precio = parseFloat(r.precio);
    return Object.assign({}, s, {
      precio: isNaN(precio) ? s.precio : precio,
      moneda: r.moneda || "USD",
      stock: typeof r.stock === "number" ? r.stock : s.stock,
      en_stock: (typeof r.stock === "number" ? r.stock : s.stock) > 0,
    });
  });

  Store.set("servicios", servicios);
  Store.patch("_meta", { catalogoReal: "ok" });
  Bus.emit("catalogo:real", { ok: true, total: reales.length });
  if (window.NV && window.NV.rerender) window.NV.rerender();
  return { ok: true, total: reales.length };
}

/**
 * Trae la configuración canónica real (parametros con tasa_bcv viva + tema) desde
 * el gateway `GET /api/config` y la funde en el Store, para que el conversor de
 * monedas use la tasa REAL. Sin backend, conserva lo que ya haya (PostgreSQL/seed).
 */
export async function cargarConfigReal() {
  const c = (typeof window !== "undefined" && window.NV_CONFIG && window.NV_CONFIG.api) || {};
  const base = (c.base || (typeof location !== "undefined" ? location.origin : "")).replace(/\/$/, "");
  try {
    const res = await fetch(base + (c.config || "/api/config"), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const cs = data && data.configuracion_sistema;
    if (cs && cs.parametros) Store.set("parametros", Object.assign({}, Store.get("parametros"), cs.parametros));
    if (cs && cs.tema_interfaz && NVCore.aplicarTema) NVCore.aplicarTema(Object.assign({}, Store.get("tema"), cs.tema_interfaz));
    Bus.emit("config:real", { ok: true });
    if (window.NV && window.NV.rerender) window.NV.rerender();
    return { ok: true };
  } catch (e) {
    Bus.emit("config:real", { ok: false });
    return { ok: false };
  }
}

export default { cargarCatalogoReal, cargarConfigReal };
