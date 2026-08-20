/**
 * credentials.service.js — Módulo de Automatización de Credenciales y Mensajería.
 *
 * Capa de dominio (cliente) del módulo OTP. Consume NVCore (no toca PostgreSQL
 * directo desde la UI). Implementa:
 *   · Permisos (Tarea D) — RBAC leído de `plantillas_permisos`.
 *   · Procesamiento (Tarea A/B) — parseo del mensaje, asociación a cuenta_madre,
 *     registro en `codigos_verificacion` con expiración (10 min) y obsolescencia
 *     del código anterior.
 *   · Asignación masiva (Tarea C) — reparte credenciales/códigos entre perfiles
 *     libres.
 *   · Notificación — genera el enlace WhatsApp/Telegram al cliente final.
 *
 * El webhook real vive en `functions/index.js` (Cloud Function). Este servicio
 * también permite "simular recepción" desde el panel para probar sin bot.
 */

import NVCore from "../core.js";
import { parsearMensaje } from "../modules/otp-parser.js";

const { DB, Store, Bus, Utils } = NVCore;
const TTL_MS = 10 * 60 * 1000; // 10 minutos de vigencia del OTP.

const codigos = () => Store.get("codigos") || [];
const plataformas = () => Store.get("plataformas") || [];
const inventario = () => Store.get("inventario") || [];
const suscripciones = () => Store.get("suscripciones") || [];
const parametros = () => Store.get("parametros") || {};
const plantillas = () => Store.get("plantillas") || {};

function sesionRol() { const s = Store.get("sesion"); return (s && s.usuario && s.usuario.rol) || "invitado"; }

/* ───────────────────────────  PERMISOS (Tarea D)  ─────────────────────── */
export const Permisos = {
  _perfil(rol) {
    const found = (Store.get("permisos") || []).find((p) => p.rol === (rol || sesionRol()));
    if (found) return found;
    // Sin backend/rol → admin en demo (window.NV_ENFORCE activa el estricto).
    return { rol: rol || "admin", puede_inyectar: !window.NV_ENFORCE, puede_ver_global: !window.NV_ENFORCE, puede_configurar_api: !window.NV_ENFORCE, puede_asignar_masivo: !window.NV_ENFORCE, plataformas_permitidas: ["*"] };
  },
  puede(accion, rol) { return !!this._perfil(rol)[accion]; },
  plataformasPermitidas(rol) { const p = this._perfil(rol).plataformas_permitidas || []; return p; },
  autorizaPlataforma(plataformaId, rol) {
    const list = this.plataformasPermitidas(rol);
    return list.includes("*") || list.includes(plataformaId);
  },
};

/* ───────────────────────────  PROCESAMIENTO  ──────────────────────────── */
function localizarCuentaMadre(plataformaId) {
  const inv = inventario().filter((c) => c.id_servicio === plataformaId);
  // Prioriza cuentas activas/disponibles; si no, cualquiera de la plataforma.
  return inv.find((c) => /disponible|activo/i.test(c.estado)) || inv[0] || null;
}
function localizarPerfilCliente(plataformaId, cuentaCorreo) {
  return suscripciones().find((s) => s.servicio === plataformaId && (!cuentaCorreo || s.cuentaCorreo === cuentaCorreo) && (s.correo || s.nombre)) || null;
}

/**
 * Procesa un mensaje entrante (o simulado). Devuelve `{ ok, registro, aviso }`.
 * No lanza; ante error de permiso o parseo devuelve `{ ok:false, motivo }`.
 */
export async function procesarMensaje({ texto, via = "Telegram", remitente = "" }) {
  const parsed = parsearMensaje({ texto, via, remitente }, plataformas());
  if (!parsed.ok) return { ok: false, motivo: parsed.motivo };

  const platId = parsed.plataforma_id;
  if (!platId) return { ok: false, motivo: `plataforma no reconocida en: "${parsed.texto_original}"` };
  if (!Permisos.puede("puede_inyectar")) return { ok: false, motivo: "sin permiso para inyectar códigos" };
  if (!Permisos.autorizaPlataforma(platId)) return { ok: false, motivo: `rol sin autorización para ${platId}` };

  const cuenta = localizarCuentaMadre(platId);
  const perfil = localizarPerfilCliente(platId, cuenta && cuenta.credenciales && cuenta.credenciales.usuario);
  const ahora = new Date();
  const registro = {
    cuenta_madre_id: cuenta ? cuenta.id : "",
    plataforma_id: platId,
    codigo: parsed.codigo,
    recibido_via: parsed.recibido_via,
    remitente: parsed.remitente || remitente,
    texto_original: parsed.texto_original,
    fecha_recepcion: DB.online ? DB.fx.serverTimestamp() : ahora,
    expira_at: new Date(ahora.getTime() + TTL_MS),
    leido: 0,
    obsoleto: false,
    perfil_id: perfil ? perfil.id : "",
    cliente_id: perfil ? (perfil.cliente_id || "") : "",
  };

  // Marca como obsoletos los códigos previos vigentes de esa cuenta_madre.
  const previos = codigos().filter((c) => c.cuenta_madre_id === registro.cuenta_madre_id && !c.obsoleto && c.plataforma_id === platId);
  await Promise.all(previos.map((c) => marcarObsoleto(c.id)));

  let id;
  try {
    id = await DB.add("codigos_verificacion", registro);
  } catch (e) {
    id = "otp_sim_" + Date.now();
    Store.set("codigos", [Object.assign({ id }, registro, { estado: "Pendiente", vigente: true, leido: 0 }), ...codigos()]);
  }
  // Notificación al admin (bandeja interna).
  try { await DB.add("notificaciones_admin", { creadoEn: DB.fx.serverTimestamp(), email: "", leido: false, mensaje: `Nuevo código ${platId.toUpperCase()} · ${parsed.codigo}`, tipo: "codigo_otp" }); } catch (e) {}

  Bus.emit("otp:recibido", { id, plataforma_id: platId });
  const aviso = perfil ? construirAviso(registro, perfil, cuenta) : null;
  return { ok: true, registro: Object.assign({ id }, registro), aviso };
}

/* ───────────────────────────  NOTIFICACIÓN  ───────────────────────────── */
function construirAviso(registro, perfil, cuenta) {
  const plantilla = plantillas().notificacion_pedido_aprobado ||
    "Hola {{nombre}}, tu código de acceso de {{plataforma}} es {{codigo}}. Válido por 10 minutos.";
  const datos = {
    nombre: (perfil && perfil.nombre) || "cliente",
    plataforma: registro.plataforma_id,
    codigo: registro.codigo,
    credenciales: cuenta && cuenta.credenciales ? `${cuenta.credenciales.usuario} / Perfil ${perfil ? perfil.perfil : ""}` : registro.codigo,
    dias_garantia: parametros().garantia_dias || 7,
  };
  const texto = Utils.interpolar(plantilla, datos);
  const tel = (perfil && perfil.ws) || parametros().whatsapp;
  return { destinatario: perfil ? perfil.nombre : "", whatsapp: Utils.waLink(tel, texto), telegram: `https://t.me/share/url?url=&text=${encodeURIComponent(texto)}`, texto };
}
export function avisoDeCodigo(id) {
  const c = codigos().find((x) => x.id === id); if (!c) return null;
  const perfil = suscripciones().find((s) => s.id === c.perfil_id) || localizarPerfilCliente(c.plataforma_id);
  const cuenta = inventario().find((x) => x.id === c.cuenta_madre_id);
  return construirAviso(c, perfil, cuenta);
}

/* ───────────────────────────  ESTADO DE CÓDIGOS  ──────────────────────── */
export async function marcarUsado(id) {
  try { await DB.update("codigos_verificacion", id, { leido: 1 }); } catch (e) {}
  Store.set("codigos", codigos().map((c) => (c.id === id ? Object.assign({}, c, { leido: 1, estado: "Usado" }) : c)));
}
export async function marcarObsoleto(id) {
  try { await DB.update("codigos_verificacion", id, { obsoleto: true }); } catch (e) {}
  Store.set("codigos", codigos().map((c) => (c.id === id ? Object.assign({}, c, { obsoleto: true, estado: "Obsoleto" }) : c)));
}

/* ─────────────────────────  ASIGNACIÓN MASIVA (Tarea C)  ──────────────── */
/**
 * Reparte una lista pegada por el admin entre los perfiles libres.
 * Cada línea admite:
 *   · credencial:  `plataforma | correo | clave | pin`  (separadores | , ; tab)
 *   · código:      un mensaje de OTP suelto (se procesa con el parser).
 */
export async function asignarMasivo(texto) {
  if (!Permisos.puede("puede_asignar_masivo")) return { ok: false, motivo: "sin permiso para asignación masiva" };
  const lineas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const res = { credenciales: 0, codigos: 0, errores: [], detalle: [] };

  // Perfiles libres (estado_asignacion Libre / sin cliente).
  let libres = suscripciones().filter((s) => !s.correo && !s.nombre || /libre|mantenimiento/i.test(s.estado));
  for (const linea of lineas) {
    const partes = linea.split(/[|,;\t]/).map((x) => x.trim()).filter(Boolean);
    if (partes.length >= 3) {
      // Credencial: plataforma | correo | clave [| pin | perfil]
      const [plat, correo, clave, pin = "", perfilNombre = "Perfil 1"] = partes;
      const platId = (plataformas().find((p) => p.nombre.toLowerCase() === plat.toLowerCase() || p.id === plat.toLowerCase()) || {}).id || plat.toLowerCase();
      const doc = { id_servicio: platId, estado: "disponible", credenciales: { usuario: correo, clave, perfil: perfilNombre, pin } };
      try { const nid = await DB.add("inventario", doc); Store.set("inventario", [Object.assign({ id: nid }, doc), ...inventario()]); }
      catch (e) { Store.set("inventario", [Object.assign({ id: "inv_" + Date.now() + res.credenciales }, doc), ...inventario()]); }
      res.credenciales++;
      res.detalle.push(`✔ Credencial ${platId} → ${correo}`);
    } else {
      // Se interpreta como mensaje de código.
      const r = await procesarMensaje({ texto: linea, via: "WhatsApp" });
      if (r.ok) { res.codigos++; res.detalle.push(`✔ Código ${r.registro.plataforma_id} ${r.registro.codigo}`); }
      else { res.errores.push(`✗ ${linea.slice(0, 40)} — ${r.motivo}`); }
    }
  }
  Bus.emit("otp:masivo", res);
  return Object.assign({ ok: true }, res);
}

/* ───────────────────────────  SELECTORES  ─────────────────────────────── */
export const Codigos = {
  recientes(limit = 50) { return Utils.sortBy(codigos(), "fecha_recepcion", "desc").slice(0, limit); },
  pendientes() { return codigos().filter((c) => c.estado === "Pendiente"); },
  porPlataforma(id) { return codigos().filter((c) => c.plataforma_id === id); },
  conteoPorEstado() {
    const acc = { Pendiente: 0, Usado: 0, Expirado: 0, Obsoleto: 0 };
    codigos().forEach((c) => { acc[c.estado] = (acc[c.estado] || 0) + 1; });
    return acc;
  },
};

export default { Permisos, procesarMensaje, asignarMasivo, marcarUsado, marcarObsoleto, avisoDeCodigo, Codigos };
