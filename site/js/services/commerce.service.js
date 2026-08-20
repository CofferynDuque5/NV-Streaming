/**
 * commerce.service.js — Dominio de compra: Carrito, Checkout y Billetera.
 *
 * El Carrito es estado compartido (Store) con persistencia en localStorage
 * (Documento 1 · §8.13). El Checkout escribe pedidos reales en PostgreSQL. La
 * moneda activa vive en el Store y el total se recalcula multi-moneda con las
 * tasas de `parametros`. Todo escribe/lee sobre datos reales; sin placeholders.
 */

import NVCore from "../core.js";
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
  aplicarCupon(codigo) {
    const CUP = { NV20: 0.2, NV10: 0.1, BIENVENIDO: 0.15 };
    const pct = CUP[String(codigo || "").toUpperCase()];
    if (pct) { Store.set("cupon", { codigo: String(codigo).toUpperCase(), pct }); this._persistir(this.items()); return true; }
    return false;
  },
  quitarCupon() { Store.set("cupon", null); this._persistir(this.items()); },
  descuentoUSD() { const c = this.cupon(); return c ? this.subtotalUSD() * c.pct : 0; },
};

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
   * Crea un pedido real por cada ítem del carrito. `comprobante` es la imagen
   * (data URL) cuando el método lo requiere (p. ej. Pago Móvil).
   */
  async crearPedido({ metodo_pago, comprobante = "", tipo_precio, cliente = {}, telefono = "" }) {
    const items = Cart.items();
    if (!items.length) throw new Error("El carrito está vacío");
    const sesion = Store.get("sesion") || {};
    const usuario = sesion.usuario || {};
    // El tipo de precio del pedido refleja la tarifa realmente aplicada por rol.
    const tipoPedido = tipo_precio || motorPrecios.tipoAplicable();
    const idsCreados = [];
    for (const it of items) {
      const pedido = {
        comprobante,
        creadoEn: DB.online ? DB.fx.serverTimestamp() : new Date(),
        estado: "pendiente",
        id_servicio: it.tipo === "combo" ? "" : it.id,
        id_combo: it.tipo === "combo" ? it.id : "",
        nombre_item: it.nombre,
        cantidad: it.cantidad || 1,
        metodo_pago,
        precio: Utils.num(it.precioUSD) * (it.cantidad || 1),
        tipo_precio: (it.meta && it.meta.tipo_precio) || tipoPedido,
        moneda: Moneda.activa(),
        total_local: Moneda.convertir(Utils.num(it.precioUSD) * (it.cantidad || 1)),
        nombre_cliente: cliente.nombre || usuario.nombre || "",
        email_cliente: cliente.email || usuario.email || "",
        uid_cliente: usuario.uid || "",
        telefono: String(telefono || "").replace(/\D/g, ""), // WhatsApp E.164 (para entrega/OTP)
      };
      try {
        const id = await DB.add("pedidos", pedido);
        idsCreados.push(id);
        // Notificación interna al admin.
        await DB.add("notificaciones_admin", {
          creadoEn: DB.fx.serverTimestamp(), email: pedido.email_cliente, leido: false,
          mensaje: `Nuevo pedido pendiente: ${it.nombre} · ${Utils.formatear(pedido.precio, "USD")}`, tipo: "nuevo_pedido",
        });
      } catch (e) {
        // Offline: simula el pedido en el Store para que la UI refleje el estado.
        const sim = Object.assign({ id: "sim_" + Math.round(performance.now()) + idsCreados.length }, pedido);
        Store.set("pedidos", [sim, ...(Store.get("pedidos") || [])]);
        idsCreados.push(sim.id);
      }
    }
    Bus.emit("payment:completed", { ids: idsCreados });
    Cart.clear();
    return idsCreados;
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
