/**
 * data.service.js — Carga inicial y sincronización en tiempo real.
 *
 * Es la puerta de entrada de datos (Documento 1 · Cap. 7). Para cada colección:
 *   1. Publica INMEDIATAMENTE el seed local en el Store → primer render sin
 *      esperar a la red (regla: nunca bloquear la UI esperando Firebase).
 *   2. Abre un `onSnapshot` (sin orderBy). Si PostgreSQL devuelve datos, los
 *      normaliza, ordena en cliente y REEMPLAZA el seed en el Store.
 *   3. Si PostgreSQL falla o está vacío, conserva el seed → sin placeholders.
 *
 * PostgreSQL → Service → Normalizer → Store → Componentes.
 */

import NVCore from "../core.js";
import SEED from "../seed.js";
import N from "../normalizers.js";
import { motorPrecios } from "./pricing.engine.js";
import { indiceBusqueda } from "./search.index.js";

const { DB, Store, Bus, Utils } = NVCore;

// Tabla de colecciones: storeKey ← colección, con normalizador y orden en cliente.
const TABLA = [
  { coll: "servicios_sistema", key: "servicios", norm: N.normalizarServicio, seed: SEED.servicios_sistema, sort: ["orden", "asc"] },
  { coll: "ofertas", key: "ofertas", norm: N.normalizarOferta, seed: SEED.ofertas, sort: ["orden", "asc"] },
  { coll: "combos_suscripciones", key: "combos", norm: N.normalizarCombo, seed: SEED.combos_suscripciones },
  { coll: "carteleras_estrenos", key: "carteleras", norm: N.normalizarCartelera, seed: SEED.carteleras_estrenos },
  { coll: "metodos_pago_config", key: "metodosPago", norm: N.normalizarMetodoPago, seed: SEED.metodos_pago_config, sort: ["orden", "asc"] },
  { coll: "tarjetas_header", key: "tarjetasHeader", norm: N.normalizarTarjetaHeader, seed: SEED.tarjetas_header, sort: ["orden", "asc"] },
  { coll: "preguntas_frecuentes", key: "faqs", norm: N.normalizarFaq, seed: SEED.preguntas_frecuentes, sort: ["orden", "asc"] },
  { coll: "comentarios", key: "comentarios", norm: N.normalizarComentario, seed: SEED.comentarios, sort: ["creadoEn", "desc"] },
  { coll: "usuarios", key: "usuarios", norm: N.normalizarUsuario, seed: SEED.usuarios },
  { coll: "pedidos", key: "pedidos", norm: N.normalizarPedido, seed: SEED.pedidos, sort: ["creadoEn", "desc"] },
  { coll: "recargas", key: "recargas", norm: N.normalizarRecarga, seed: SEED.recargas, sort: ["creadoEn", "desc"] },
  { coll: "recargas_billetera", key: "recargasBilletera", norm: N.normalizarRecarga, seed: SEED.recargas_billetera, sort: ["creadoEn", "desc"] },
  { coll: "historial_movimientos", key: "movimientos", norm: N.normalizarMovimiento, seed: SEED.historial_movimientos, sort: ["fecha", "desc"] },
  { coll: "suscripciones", key: "suscripciones", norm: N.normalizarSuscripcion, seed: SEED.suscripciones, sort: ["creadoEn", "desc"] },
  { coll: "renovaciones_pendientes", key: "renovaciones", norm: N.normalizarRenovacion, seed: SEED.renovaciones_pendientes, sort: ["dias_para_vencer", "asc"] },
  { coll: "inventario", key: "inventario", norm: N.normalizarInventario, seed: SEED.inventario },
  { coll: "chats_soporte", key: "chats", norm: N.normalizarChat, seed: SEED.chats_soporte, sort: ["actualizadoEn", "desc"] },
  { coll: "tickets_soporte", key: "tickets", norm: N.normalizarTicket, seed: SEED.tickets_soporte, sort: ["creadoEn", "desc"] },
  { coll: "notificaciones_admin", key: "notifAdmin", norm: N.normalizarNotifAdmin, seed: SEED.notificaciones_admin, sort: ["creadoEn", "desc"] },
  { coll: "respuestas_rapidas", key: "respuestasRapidas", norm: N.normalizarRespuestaRapida, seed: SEED.respuestas_rapidas },
  { coll: "flyers_revendedores", key: "flyers", norm: N.normalizarFlyer, seed: SEED.flyers_revendedores },
  { coll: "plataformas", key: "plataformas", norm: N.normalizarPlataforma, seed: SEED.plataformas },
  { coll: "codigos_verificacion", key: "codigos", norm: N.normalizarCodigo, seed: SEED.codigos_verificacion, sort: ["fecha_recepcion", "desc"] },
  { coll: "plantillas_permisos", key: "permisos", norm: N.normalizarPermiso, seed: SEED.plantillas_permisos },
];

function ordenar(list, sort) {
  if (!sort) return list;
  return Utils.sortBy(list, sort[0], sort[1] || "desc");
}

function publicar(entry, rawDocs, origen) {
  const norm = ordenar((rawDocs || []).map(entry.norm), entry.sort);
  Store.set(entry.key, norm);
  Store.patch("_meta", { [entry.key]: origen });
  // El índice de búsqueda se reconstruye SOLO cuando cambia el catálogo.
  if (entry.key === "servicios") indiceBusqueda.construir(norm);
}

const unsubs = [];

/** Inicia carga + sincronización de todas las colecciones. */
export function iniciarCargaDatos() {
  Store.set("_meta", {});

  // 1. Seed inmediato (primer render instantáneo).
  for (const entry of TABLA) publicar(entry, entry.seed.map((d) => ({ id: d._id || d.id, ...d })), "seed");

  // 2. Config del sistema (parametros + tema + plantillas).
  cargarConfiguracion();

  // 3. Snapshots reactivos con fallback (solo si hay backend).
  if (!DB.online) { Bus.emit("data:ready", { online: false }); return; }

  for (const entry of TABLA) {
    const un = DB.watch(
      entry.coll,
      // PostgreSQL MANDA cuando hay conexión: publicamos su verdad SIEMPRE, incluso
      // si la colección está vacía. Así, al borrar/editar datos, la web refleja la
      // realidad (estado vacío) y el seed deja de enmascarar tus datos reales.
      (docs) => { publicar(entry, docs || [], "api"); },
      () => {/* error de lectura (reglas/red): conserva el último estado */}
    );
    unsubs.push(un);
  }
  Bus.emit("data:ready", { online: true });
}

async function cargarConfiguracion() {
  // Seed inmediato.
  Store.set("parametros", SEED.configuracion_sistema.parametros);
  Store.set("plantillas", SEED.configuracion_sistema.plantillas_mensajes);
  NVCore.aplicarTema(SEED.configuracion_sistema.tema_interfaz);

  if (!DB.online) return;

  // tema_interfaz reactivo (repintado a 0ms).
  unsubs.push(
    DB.watch("configuracion_sistema", (docs) => {
      for (const d of docs) {
        if (d.id === "tema_interfaz") NVCore.aplicarTema(Object.assign({}, SEED.configuracion_sistema.tema_interfaz, d));
        if (d.id === "parametros") Store.set("parametros", Object.assign({}, SEED.configuracion_sistema.parametros, d));
        if (d.id === "plantillas_mensajes") Store.set("plantillas", Object.assign({}, SEED.configuracion_sistema.plantillas_mensajes, d));
      }
    })
  );
}

export function detenerCargaDatos() {
  while (unsubs.length) { const u = unsubs.pop(); try { u && u(); } catch (e) {} }
}

/* ─────────────────────  SELECTORES DE CATÁLOGO  ───────────────────── */
export const Catalogo = {
  servicios() { return Store.get("servicios") || []; },
  activos() { return this.servicios().filter((s) => s.activo); },
  destacados() { return this.activos().filter((s) => s.destacado); },
  porMundo(mundo) { return this.activos().filter((s) => s.mundo === mundo); },
  porId(id) { return this.servicios().find((s) => s.id_servicio === id || s.id === id) || null; },
  ofertas() { return (Store.get("ofertas") || []).filter((o) => o.activo); },
  combos() { return (Store.get("combos") || []).filter((c) => c.activo); },
  /**
   * Búsqueda por índice invertido/prefijo (O(long_consulta)), no escaneo lineal.
   * Devuelve solo servicios activos que coinciden, en el orden del índice.
   */
  buscar(texto) {
    const q = String(texto || "").trim();
    if (!q) return this.activos();
    if (indiceBusqueda.tamano === 0) indiceBusqueda.construir(this.servicios());
    const ids = indiceBusqueda.idsCoincidentes(q);
    if (ids === null) return this.activos();
    return indiceBusqueda.buscar(q).filter((s) => s.activo);
  },
  /**
   * Precio final en USD. Si NO se fuerza el tipo, el Motor de Precios aplica la
   * regla de negocio por rol (revendedor → tarifa preferencial automática).
   */
  precioFinalUSD(servicio, tipo) {
    return motorPrecios.precioServicioUSD(servicio, tipo);
  },
  precioComboUSD(combo, tipo) {
    return motorPrecios.precioComboUSD(combo, tipo);
  },
  desglosePrecio(servicio, tipo) {
    return motorPrecios.desgloseServicio(servicio, tipo);
  },
};

export default { iniciarCargaDatos, detenerCargaDatos, Catalogo };
