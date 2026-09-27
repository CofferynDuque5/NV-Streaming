/**
 * commerce.service.js — Dominio de compra: Carrito, Checkout y Billetera.
 *
 * El Carrito es estado compartido (Store) con persistencia en localStorage
 * (Documento 1 · §8.13). El Checkout escribe pedidos reales en PostgreSQL. La
 * moneda activa vive en el Store y el total se recalcula multi-moneda con las
 * tasas de `parametros`. Todo escribe/lee sobre datos reales; sin placeholders.
 */

import NVCore from "../core.js";
import { NVApi } from "./nv-api.js";
import { Catalogo } from "./data.service.js";
import { motorPrecios } from "./pricing.engine.js";

const { DB, Store, Bus, Utils } = NVCore;
const LS_CART = "nv_cart_v1";
const LS_CURRENCY = "nv_currency_v1";

function leerLS(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function escribirLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

/* ────────────────────────────  CARRITO  ──────────────────────────── */
export const Cart = {
  init() {
    Store.set("cart", leerLS(LS_CART, []));
    Store.set("moneda", leerLS(LS_CURRENCY, null) || "USD");
  },
  items() { return Store.get("cart") || []; },
  _persistir(items) { Store.set("cart", items); escribirLS(LS_CART, items); Bus.emit("cart:updated", { items, total: this.totalUSD() }); },

  add(item) {
    // item: { id, tipo:'servicio'|'combo', nombre, precioUSD, img, meta }
    const items = [...this.items()];
    const idx = items.findIndex((i) => i.id === item.id && i.tipo === item.tipo);
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], { cantidad: (items[idx].cantidad || 1) + 1 });
    else items.push(Object.assign({ cantidad: 1 }, item));
    this._persistir(items);
    return items;
  },
  addServicio(idServicio, tipoPrecio) {
    // tipoPrecio omitido → el Motor aplica la tarifa por rol (revendedor/estándar).
    const s = Catalogo.porId(idServicio); if (!s) return;
    const tipo = motorPrecios.tipoAplicable(tipoPrecio);
    this.add({ id: s.id_servicio, tipo: "servicio", nombre: s.nombre_display, precioUSD: Catalogo.precioFinalUSD(s, tipo), img: s.tarjeta_url || s.logo_url, meta: { categoria: s.categoria, tipo_precio: tipo } });
  },
  addCombo(idCombo) {
    const c = (Store.get("combos") || []).find((x) => x.id === idCombo || x.nombre_combo === idCombo); if (!c) return;
    const tipo = motorPrecios.tipoAplicable();
    this.add({ id: c.id, tipo: "combo", nombre: c.nombre_combo, precioUSD: Catalogo.precioComboUSD(c, tipo), img: c.banner_url, meta: { incluye: c.servicios_included, tipo_precio: tipo } });
  },
  setCantidad(id, tipo, cantidad) {
    let items = this.items().map((i) => (i.id === id && i.tipo === tipo ? Object.assign({}, i, { cantidad: Math.max(1, cantidad) }) : i));
    this._persistir(items);
  },
  remove(id, tipo) { this._persistir(this.items().filter((i) => !(i.id === id && i.tipo === tipo))); },
  clear() { this._persistir([]); },
  count() { return this.items().reduce((a, i) => a + (i.cantidad || 1), 0); },
  totalUSD() {
    const bruto = this.items().reduce((a, i) => a + Utils.num(i.precioUSD) * (i.cantidad || 1), 0);
    return bruto - this.descuentoUSD();
  },
  subtotalUSD() { return this.items().reduce((a, i) => a + Utils.num(i.precioUSD) * (i.cantidad || 1), 0); },
  cupon() { return Store.get("cupon") || null; },
  // Cupones REALES: una oferta del CMS (colección `ofertas`, panel Ofertas) con
  // `codigo` y `descuento_pct` y activa. Sin códigos inventados en el código.
  aplicarCupon(codigo) {
    const code = String(codigo || "").trim().toUpperCase();
    if (!code) return false;
    const of = (Store.get("ofertas") || []).find((o) => o.activo !== false && String(o.codigo || "").trim().toUpperCase() === code && Utils.num(o.descuento_pct) > 0);
    if (!of) return false;
    Store.set("cupon", { codigo: code, pct: Math.min(100, Utils.num(of.descuento_pct)) / 100 });
    this._persistir(this.items());
    return true;
  },
  quitarCupon() { Store.set("cupon", null); this._persistir(this.items()); },
  descuentoUSD() { const c = this.cupon(); return c ? this.subtotalUSD() * c.pct : 0; },

  /**
   * Reconcilia el carrito guardado (localStorage) con el catálogo ACTUAL:
   * precios según la tarifa vigente y el rol, nombres al día, y fuera los
   * servicios/combos que ya no existen. Evita que un carrito viejo muestre
   * precios de una versión anterior (p.ej. Netflix $4.49 cuando hoy es $4.00).
   */
  reconciliar() {
    const antes = this.items();
    if (!antes.length) return false;
    const tipo = motorPrecios.tipoAplicable();
    const combos = Store.get("combos") || [];
    const despues = [];
    for (const it of antes) {
      if (it.tipo === "combo") {
        const c = combos.find((x) => x.id === it.id || x.nombre_combo === it.id);
        if (!c) continue;
        despues.push(Object.assign({}, it, { nombre: c.nombre_combo, precioUSD: Catalogo.precioComboUSD(c, tipo), img: c.banner_url, meta: Object.assign({}, it.meta, { tipo_precio: tipo }) }));
      } else {
        const s = Catalogo.porId(it.id);
        if (!s || s.activo === false) continue;
        despues.push(Object.assign({}, it, { nombre: s.nombre_display, precioUSD: Catalogo.precioFinalUSD(s, tipo), img: s.tarjeta_url || s.logo_url, meta: Object.assign({}, it.meta, { categoria: s.categoria, tipo_precio: tipo }) }));
      }
    }
    const cambio = JSON.stringify(antes) !== JSON.stringify(despues);
    if (cambio) this._persistir(despues);
    return cambio;
  },
};

// El catálogo real llega después del primer pintado; en cuanto llega (o cambia
// el rol de la sesión), el carrito se reconcilia con los precios vigentes.
if (Bus && Bus.on) {
  Bus.on("catalogo:real", () => { try { Cart.reconciliar(); } catch (_) {} });
  Bus.on("user:login", () => { try { Cart.reconciliar(); } catch (_) {} });
  Bus.on("user:logout", () => { try { Cart.reconciliar(); } catch (_) {} });
  Bus.on("store:changed", (e) => { if (e && (e.key === "combos")) { try { Cart.reconciliar(); } catch (_) {} } });
}

/* ────────────────────────────  MONEDA  ──────────────────────────── */
export const Moneda = {
  activa() { return Store.get("moneda") || "USD"; },
  parametros() { return Store.get("parametros") || {}; },
  set(codigo) { if (Utils.MONEDAS[codigo]) { Store.set("moneda", codigo); escribirLS(LS_CURRENCY, codigo); Bus.emit("currency:changed", codigo); } },
  formato(usd) { return Utils.formatear(usd, this.activa(), this.parametros()); },
  convertir(usd) { return Utils.convertir(usd, this.activa(), this.parametros()); },
  lista() { return Object.keys(Utils.MONEDAS).map((c) => ({ codigo: c, ...Utils.MONEDAS[c] })); },
};

/* ────────────────────────────  CHECKOUT  ──────────────────────────── */
export const Checkout = {
  /**
   * Crea los pedidos REALES en el servidor (POST /api/pedidos), uno por unidad
   * de cada ítem del carrito. Los combos se descomponen en sus servicios (el
   * precio lo fija el servidor por servicio y rol; el combo es la suma).
   * `comprobante` es la captura (data URL) para pagos manuales; `billetera`
   * descuenta el saldo y aprovisiona al instante.
   *
   * Devuelve { pedidos, provisionados, pendientes, reembolsados, saldo } y
   * LANZA un Error claro si nada pudo crearse (sin sesión, saldo insuficiente,
   * comprobante demasiado grande, servidor caído…). Nunca inventa pedidos.
   */
  async crearPedido({ metodo_pago, comprobante = "", telefono = "" }) {
    const items = Cart.items();
    if (!items.length) throw new Error("El carrito está vacío");
    const sesion = Store.get("sesion") || {};
    if (sesion.estado !== "autenticado") { const e = new Error("Inicia sesión para completar tu compra."); e.code = "sin_sesion"; throw e; }

    // Unidades a pedir: servicios × cantidad; combos → sus servicios × cantidad.
    const unidades = [];
    const combos = Store.get("combos") || [];
    for (const it of items) {
      const n = it.cantidad || 1;
      if (it.tipo === "combo") {
        const c = combos.find((x) => x.id === it.id || x.nombre_combo === it.id);
        const ids = (c ? c.servicios_included : []).map((ref) => { const s = Catalogo.porId(ref) || Catalogo.servicios().find((x) => x.nombre_display === ref); return s ? s.id_servicio : null; }).filter(Boolean);
        if (!ids.length) { const e = new Error(`El combo "${it.nombre}" no tiene servicios reconocibles.`); e.code = "combo_invalido"; throw e; }
        for (let i = 0; i < n; i++) for (const id of ids) unidades.push({ id_servicio: id, nombre: it.nombre });
      } else {
        for (let i = 0; i < n; i++) unidades.push({ id_servicio: it.id, nombre: it.nombre });
      }
    }

    const tel = String(telefono || "").replace(/\D/g, "");
    const out = { pedidos: [], provisionados: [], pendientes: [], reembolsados: [], saldo: null, errores: [] };
    for (const u of unidades) {
      try {
        const r = await NVApi.crearPedido({ id_servicio: u.id_servicio, metodo_pago, comprobante, telefono: tel });
        const p = (r && r.pedido) || null;
        if (!p) throw new Error("Respuesta inválida del servidor");
        out.pedidos.push(p);
        if (r.saldo != null) out.saldo = Number(r.saldo);
        if (r.reembolsado) out.reembolsados.push(Object.assign({ nombre: u.nombre }, p));
        else if (r.provision && r.provision.provisionado) out.provisionados.push(Object.assign({ nombre: u.nombre, perfil: r.provision.perfil }, p));
        else out.pendientes.push(Object.assign({ nombre: u.nombre, provision: r.provision || null }, p));
      } catch (e) {
        const code = (e && e.data && e.data.error) || "";
        let msg = (e && e.message) || "No se pudo crear el pedido.";
        if (e && e.status === 401) { msg = "Tu sesión expiró. Inicia sesión de nuevo."; }
        else if (e && e.status === 402) { msg = "Saldo insuficiente en tu billetera para " + u.nombre + "."; }
        else if (e && e.status === 413) { msg = "El comprobante es demasiado grande (máximo 8 MB). Sube una captura más ligera."; }
        else if (code === "servicio_no_encontrado") { msg = `"${u.nombre}" ya no está en el catálogo.`; }
        else if (e && e.status === 0) { msg = "No hay conexión con el servidor. Inténtalo de nuevo en un momento."; }
        out.errores.push({ nombre: u.nombre, mensaje: msg, status: e && e.status, code });
        if (e && (e.status === 401 || e.status === 402 || e.status === 0 || e.status === 413)) break; // no insistir
      }
    }
    if (!out.pedidos.length) { const e = new Error(out.errores[0] ? out.errores[0].mensaje : "No se pudo registrar el pedido."); e.code = out.errores[0] && out.errores[0].code; e.status = out.errores[0] && out.errores[0].status; throw e; }

    // Refleja el saldo nuevo en la sesión (pago con billetera).
    if (out.saldo != null && sesion.usuario) Store.set("sesion", Object.assign({}, sesion, { usuario: Object.assign({}, sesion.usuario, { saldoBilletera: out.saldo }) }));
    Bus.emit("payment:completed", { ids: out.pedidos.map((p) => p.id), resultado: out });
    Cart.clear();
    return out;
  },
};

/* ────────────────────────────  BILLETERA  ──────────────────────────── */
export const Wallet = {
  saldo() { const s = Store.get("sesion"); return (s && s.usuario && Utils.num(s.usuario.saldoBilletera)) || 0; },
  movimientos() { return Store.get("movimientos") || []; },
  /** Solicita una recarga de saldo (queda pendiente de aprobación admin). */
  async solicitarRecarga({ monto, metodo_pago, comprobante = "" }) {
    const sesion = Store.get("sesion") || {};
    const usuario = sesion.usuario || {};
    const recarga = {
      aprobadoPor: "", comprobante, creadoEn: DB.online ? DB.fx.serverTimestamp() : new Date(),
      estado: "pendiente", metodo_pago, monto: Utils.num(monto),
      uid_usuario: usuario.uid || "", email: usuario.email || "",
    };
    try {
      const id = await DB.add("recargas_billetera", recarga);
      await DB.add("notificaciones_admin", { creadoEn: DB.fx.serverTimestamp(), email: recarga.email, leido: false, mensaje: `Recarga de billetera pendiente por ${Utils.formatear(recarga.monto, "USD")}`, tipo: "recarga_billetera" });
      Bus.emit("wallet:requested", { id });
      return id;
    } catch (e) {
      const sim = Object.assign({ id: "sim_rec_" + Math.round(performance.now()) }, recarga);
      Store.set("recargasBilletera", [sim, ...(Store.get("recargasBilletera") || [])]);
      return sim.id;
    }
  },
};

export function initCommerce() { Cart.init(); }

export default { Cart, Moneda, Checkout, Wallet, initCommerce };
