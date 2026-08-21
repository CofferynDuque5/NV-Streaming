/**
 * admin.service.js — Operaciones transaccionales de Back Office y Revendedor.
 *
 * Controlador modular que consume NVCore (no reinicializa Firebase). Incluye:
 *   · Aprobar/rechazar pedidos (con notificación + plantilla WhatsApp).
 *   · Aprobar recargas de billetera con runTransaction (§4.2): lectura previa
 *     en servidor del saldo, escritura atómica de saldo + estado + auditoría.
 *   · CRUD de servicios, métodos de pago, combos, ofertas, FAQ.
 *   · Guardado del tema (No-Code) → repintado a 0ms.
 *   · Renovaciones: enviar cobros masivos y renovar (sale de vencimientos).
 *   · Chat de soporte: enviar mensaje + macros.
 * Todas las operaciones degradan a mutación del Store cuando no hay backend.
 */

import NVCore from "../core.js";
import { NVApi } from "./nv-api.js";

const { DB, Store, Bus, Utils } = NVCore;

function parametros() { return Store.get("parametros") || {}; }
function plantillas() { return Store.get("plantillas") || {}; }

// Mutación local del Store para modo offline (mantiene la UI consistente).
function patchLocal(key, id, patch) {
  const list = Store.get(key) || [];
  Store.set(key, list.map((x) => (x.id === id ? Object.assign({}, x, patch) : x)));
}
function removeLocal(key, id) { Store.set(key, (Store.get(key) || []).filter((x) => x.id !== id)); }
function addLocal(key, obj) { Store.set(key, [obj, ...(Store.get(key) || [])]); }

export const Pedidos = {
  async aprobar(id, credenciales = "") {
    // Endpoint dedicado del backend (cambia el estado del pedido en Postgres).
    try { await NVApi.cambiarEstadoPedido(id, "aprobado"); } catch (e) { patchLocal("pedidos", id, { estado: "aprobado" }); }
    Bus.emit("order:approved", { id });
    return this._waLink(id, "notificacion_pedido_aprobado", { credenciales });
  },
  async rechazar(id) {
    try { await NVApi.cambiarEstadoPedido(id, "rechazado"); } catch (e) { patchLocal("pedidos", id, { estado: "rechazado" }); }
    Bus.emit("order:rejected", { id });
    return this._waLink(id, "notificacion_pedido_rechazado", {});
  },
  _waLink(id, tplKey, extra) {
    const pedido = (Store.get("pedidos") || []).find((p) => p.id === id) || {};
    const datos = Object.assign({
      nombre: pedido.nombre_cliente || "cliente", id_pedido: id, id_tramite: id,
      credenciales: extra.credenciales || "", dias_garantia: parametros().garantia_dias || 7,
      total_usd: pedido.precio, moneda: pedido.moneda || "USD", referencia: id,
    }, extra);
    const texto = Utils.interpolar(plantillas()[tplKey] || "", datos);
    return Utils.waLink(parametros().whatsapp, texto);
  },
};

export const Billetera = {
  /**
   * Aprueba una recarga con aislamiento absoluto (runTransaction). Lee el saldo
   * del usuario EN SERVIDOR, suma el monto normalizado, y escribe atómicamente
   * saldo + estado de la recarga + registro en historial_movimientos.
   */
  async aprobarRecarga(idRecarga, coleccion = "recargas_billetera") {
    const recarga = (Store.get(coleccion === "recargas" ? "recargas" : "recargasBilletera") || []).find((r) => r.id === idRecarga);
    if (!recarga) throw new Error("Recarga no encontrada");
    const monto = Utils.num(recarga.monto); // §5.1 normaliza string→number
    const uid = recarga.uid_usuario;
    const aprobador = (Store.get("sesion")?.usuario?.uid) || "admin";

    if (!DB.online || !uid) {
      // Modo degradado: refleja el resultado en el Store.
      patchLocal(coleccion === "recargas" ? "recargas" : "recargasBilletera", idRecarga, { estado: "aprobado", aprobadoPor: aprobador });
      this._sumarLocal(uid, monto);
      addLocal("movimientos", { id: "mov_sim_" + Math.round(performance.now()), tipo: "ingreso", monto, descripcion: "Recarga aprobada", ejecutado_por: aprobador, usuario: uid, fecha: new Date(), saldo_anterior: 0, saldo_posterior: monto });
      Bus.emit("wallet:updated", { uid, monto });
      return true;
    }

    // El backend acredita el saldo + escribe el asiento de forma ATÓMICA
    // (transacción con bloqueo de fila) en un solo endpoint.
    await NVApi.aprobarRecarga(idRecarga);
    Bus.emit("wallet:updated", { uid, monto });
    return true;
  },
  async rechazarRecarga(idRecarga, coleccion = "recargas_billetera") {
    const key = coleccion === "recargas" ? "recargas" : "recargasBilletera";
    try { await NVApi.rechazarRecarga(idRecarga); }
    catch (e) { patchLocal(key, idRecarga, { estado: "rechazado" }); throw e; }
    patchLocal(key, idRecarga, { estado: "rechazado" });
    return true;
  },
  _sumarLocal(uid, monto) {
    const s = Store.get("sesion");
    if (s && s.usuario && s.usuario.uid === uid) Store.set("sesion", Object.assign({}, s, { usuario: Object.assign({}, s.usuario, { saldoBilletera: Utils.num(s.usuario.saldoBilletera) + monto }) }));
    patchLocal("usuarios", uid, {});
    const u = (Store.get("usuarios") || []).find((x) => x.uid === uid);
    if (u) patchLocal("usuarios", uid, { saldoBilletera: Utils.num(u.saldoBilletera) + monto });
  },
};

// CRUD genérico para módulos de gestión (servicios, métodos, combos, ofertas…).
export const Gestion = {
  async guardar(coll, id, data, storeKey) {
    if (id) {
      try { await DB.update(coll, id, data); } catch (e) { patchLocal(storeKey, id, data); }
    } else {
      const nuevo = Object.assign({}, data);
      try { const nid = await DB.add(coll, nuevo); addLocal(storeKey, Object.assign({ id: nid }, nuevo)); return nid; }
      catch (e) { const nid = "new_" + Math.round(performance.now()); addLocal(storeKey, Object.assign({ id: nid }, nuevo)); return nid; }
    }
    return id;
  },
  async eliminar(coll, id, storeKey) {
    try { await DB.remove(coll, id); } catch (e) {}
    removeLocal(storeKey, id);
  },
  // Edición inline de una celda (tabla estilo Excel del admin).
  async editarCampo(coll, id, campo, valor, storeKey) {
    const patch = { [campo]: valor };
    try { await DB.update(coll, id, patch); } catch (e) { patchLocal(storeKey, id, patch); }
  },
};

export const Tema = {
  // Guarda tokens del tema en configuracion_sistema/tema_interfaz → 0ms repintado.
  async guardar(tema) {
    NVCore.aplicarTema(tema);
    try { await DB.setOne("configuracion_sistema", "tema_interfaz", tema, true); } catch (e) {}
  },
  async guardarParametros(p) {
    Store.set("parametros", Object.assign({}, parametros(), p));
    try { await DB.setOne("configuracion_sistema", "parametros", p, true); } catch (e) {}
  },
};

export const Renovaciones = {
  // Envía cobros masivos por WhatsApp a varias renovaciones a la vez.
  enviarCobros(ids) {
    const rens = (Store.get("renovaciones") || []).filter((r) => ids.includes(r.id));
    const links = rens.map((r) => {
      const texto = Utils.interpolar(plantillas().notificacion_pedido_pendiente || "Hola {{nombre}}, tu servicio {{id_pedido}} vence pronto.", { nombre: r.nombre, id_pedido: r.servicio, total_usd: r.precio_renovacion, moneda: "USD", total_local: r.precio_renovacion, referencia: r.id_renovacion });
      return { id: r.id, nombre: r.nombre, link: Utils.waLink(parametros().whatsapp, texto) };
    });
    ids.forEach((id) => patchLocal("renovaciones", id, { estado_notificacion: "enviado" }));
    Bus.emit("renovaciones:cobros", { count: links.length });
    return links;
  },
  // Renueva: actualiza la suscripción, sale de la tabla de vencimientos.
  async renovar(idRenovacion) {
    const ren = (Store.get("renovaciones") || []).find((r) => r.id === idRenovacion);
    if (!ren) return;
    const nuevaFecha = new Date(); nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
    try {
      if (ren.id_suscripcion) await DB.update("suscripciones", ren.id_suscripcion, { vence: nuevaFecha, estado: "activo", actualizadoEn: DB.fx.serverTimestamp() });
      await DB.remove("renovaciones_pendientes", idRenovacion);
    } catch (e) {}
    patchLocal("suscripciones", ren.id_suscripcion, { vence: nuevaFecha, estado: "activo" });
    removeLocal("renovaciones", idRenovacion);
    Bus.emit("renovaciones:renovado", { id: idRenovacion });
  },
};

export const Soporte = {
  async enviarMensaje(idChat, texto) {
    const msg = { id_mensaje: "m_" + Math.round(performance.now()), remitente: "soporte", texto, leido: true, fecha: new Date().toISOString() };
    const chat = (Store.get("chats") || []).find((c) => c.id === idChat);
    // Array COMPLETO (no arrayUnion): el update por-usuario hace get+merge+put y
    // conserva el resto del chat (dueño, asunto…). REST no tiene arrayUnion.
    const mensajes = [...((chat && chat.mensajes) || []), msg];
    if (chat) patchLocal("chats", idChat, { mensajes, ultimo_mensaje: texto, actualizadoEn: new Date() });
    try {
      await DB.update("chats_soporte", idChat, { mensajes, ultimo_mensaje: texto, actualizadoEn: new Date().toISOString() });
    } catch (e) {}
    Bus.emit("chat:sent", { idChat });
  },
  macros() { return Store.get("respuestasRapidas") || []; },
};

/* ─────────────────────────  SELECTORES REVENDEDOR  ───────────────────── */
export const Revendedor = {
  perfil() { return (Store.get("sesion")?.usuario) || (Store.get("usuarios") || []).find((u) => u.rol === "revendedor") || {}; },
  clientes() {
    // Deriva clientes desde suscripciones (CRM del revendedor).
    const map = new Map();
    (Store.get("suscripciones") || []).forEach((s) => {
      const k = s.correo || s.nombre; if (!k) return;
      const prev = map.get(k) || { nombre: s.nombre, correo: s.correo, ws: s.ws, servicios: 0, total: 0, vence: s.vence };
      prev.servicios += 1; prev.total += Utils.num(s.precioVenta);
      map.set(k, prev);
    });
    return [...map.values()];
  },
  ventas() { return (Store.get("pedidos") || []).filter((p) => p.estado === "aprobado"); },
  kpis() {
    const ventas = this.ventas();
    const total = ventas.reduce((a, p) => a + Utils.num(p.precio), 0);
    return {
      ventasHoy: ventas.length,
      ingresos: total,
      ganancia: total * 0.28,
      clientes: this.clientes().length,
      conversion: ventas.length ? Math.min(99, Math.round((ventas.length / (Store.get("pedidos") || [1]).length) * 100)) : 0,
    };
  },
};

export default { Pedidos, Billetera, Gestion, Tema, Renovaciones, Soporte, Revendedor };
