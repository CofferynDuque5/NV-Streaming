/**
 * normalizers.js — Normalizadores de dominio.
 *
 * Ningún dato de PostgreSQL llega crudo a los componentes (Documento 1 · §4.11,
 * §5.5). Cada colección se convierte aquí a un contrato homogéneo: tipos
 * corregidos, valores por defecto y las inconsistencias del §5 del blueprint
 * resueltas (monto string→number en recargas_billetera, flyers array→map, etc.).
 */

import { Utils } from "./core.js";

const bool = (v, d = false) => (typeof v === "boolean" ? v : v == null ? d : !!v);
const str = (v, d = "") => (v == null ? d : String(v));
const num = (v, d = 0) => (v == null || v === "" ? d : Utils.num(v));

export const normalizarServicio = (s) => ({
  id: s.id || s.id_servicio || "",
  id_servicio: str(s.id_servicio || s.id),
  nombre_display: str(s.nombre_display || s.nombre || "Servicio"),
  descripcion: str(s.descripcion),
  categoria: str(s.categoria || "GENERAL").toUpperCase(),
  mundo: str(s.mundo || s.categoria || "streaming").toLowerCase(),
  activo: bool(s.activo, true),
  destacado: bool(s.destacado),
  nuevo: bool(s.nuevo),
  en_oferta: bool(s.en_oferta),
  en_stock: s.en_stock != null ? bool(s.en_stock) : num(s.stock, 1) > 0,
  stock: num(s.stock, s.en_stock === false ? 0 : 99),
  precio: num(s.precio),
  precio_rev: num(s.precio_rev, num(s.precio) * 0.75),
  logo_url: str(s.logo_url),
  tarjeta_url: str(s.tarjeta_url || s.logo_url),
  tipo_entrega: str(s.tipo_entrega || "Perfil compartido"),
  tags: Array.isArray(s.tags) ? s.tags : [],
  orden: num(s.orden, 99),
});

export const normalizarOferta = (o) => ({
  id: o.id || o._id || "",
  id_servicio: str(o.id_servicio),
  nombre: str(o.nombre),
  etiqueta: str(o.etiqueta || "OFERTA"),
  descuento_pct: num(o.descuento_pct),
  precio_normal: num(o.precio_normal),
  precio_oferta: num(o.precio_oferta),
  logo_url: str(o.logo_url),
  activo: bool(o.activo, true),
  orden: num(o.orden, 99),
});

export const normalizarCombo = (c) => ({
  id: c.id || c._id || "",
  nombre_combo: str(c.nombre_combo || c.id_combo || "Combo"),
  descripcion: str(c.descripcion),
  precio_publico_combo: num(c.precio_publico_combo),
  precio_revendedor_combo: num(c.precio_revendedor_combo),
  servicios_included: Array.isArray(c.servicios_included) ? c.servicios_included : [],
  banner_url: str(c.banner_url),
  activo: bool(c.activo, true),
  fin_validez: c.fin_validez || null,
});

export const normalizarCartelera = (e) => ({
  id: e.id || e._id || "",
  id_estreno: str(e.id_estreno),
  titulo_banner: str(e.titulo_banner),
  plataforma: str(e.plataforma),
  imagen_background: str(e.imagen_background),
  llamado_accion: str(e.llamado_accion || "Ver ahora"),
  activo: bool(e.activo, true),
});

export const normalizarMetodoPago = (m) => ({
  id: m.id || m.id_pago || m._id || "",
  id_pago: str(m.id_pago || m.id),
  tipo: str(m.tipo || "banco"),
  tipo_banco: str(m.tipo_banco),
  titular: str(m.titular || "Nathan Quevedo"),
  documento_identidad: str(m.documento_identidad),
  telefono_pago: str(m.telefono_pago),
  correo_zelle: str(m.correo_zelle),
  correo_paypal: str(m.correo_paypal),
  correo_binance: str(m.correo_binance),
  logo_url: str(m.logo_url),
  instrucciones: str(m.instrucciones),
  estado_activo: bool(m.estado_activo, true),
  orden: num(m.orden, 99),
});

export const normalizarUsuario = (u) => ({
  id: u.id || u.uid || "",
  uid: str(u.uid || u.id),
  nombre: str(u.nombre),
  email: str(u.email),
  telefono: str(u.telefono),
  rol: str(u.rol || "cliente"),
  activo: bool(u.activo, true),
  baneado: bool(u.baneado),
  saldoBilletera: num(u.saldoBilletera),
  fechacreado: u.fechacreado || null,
  ultimoLogin: u.ultimoLogin || null,
});

export const normalizarPedido = (p) => ({
  id: p.id || p._id || "",
  id_servicio: str(p.id_servicio),
  estado: str(p.estado || "pendiente"),
  precio: num(p.precio),
  tipo_precio: str(p.tipo_precio || "detal"),
  metodo_pago: str(p.metodo_pago),
  comprobante: str(p.comprobante),
  nombre_cliente: str(p.nombre_cliente),
  email_cliente: str(p.email_cliente),
  uid_cliente: str(p.uid_cliente),
  creadoEn: p.creadoEn || null,
});

// §5.1: recargas_billetera.monto puede venir como string "50" → number.
export const normalizarRecarga = (r) => ({
  id: r.id || r._id || "",
  estado: str(r.estado || "pendiente"),
  monto: num(r.monto),
  metodo_pago: str(r.metodo_pago),
  comprobante: str(r.comprobante),
  aprobadoPor: str(r.aprobadoPor),
  uid_usuario: str(r.uid_usuario),
  email: str(r.email),
  creadoEn: r.creadoEn || null,
});

export const normalizarSuscripcion = (s) => ({
  id: s.id || s._id || "",
  nombre: str(s.nombre),
  correo: str(s.correo),
  servicio: str(s.servicio),
  tipo: str(s.tipo || "individual"),
  estado: str(s.estado || "activo"),
  perfil: str(s.perfil),
  pinPerfil: str(s.pinPerfil),
  cuentaCorreo: str(s.cuentaCorreo),
  cuentaPass: str(s.cuentaPass),
  precioVenta: num(s.precioVenta),
  ws: str(s.ws),
  notas: str(s.notas),
  vence: s.vence || null,
  creadoEn: s.creadoEn || null,
  actualizadoEn: s.actualizadoEn || null,
});

export const normalizarRenovacion = (r) => ({
  id: r.id || r._id || "",
  id_renovacion: str(r.id_renovacion),
  id_suscripcion: str(r.id_suscripcion),
  email_usuario: str(r.email_usuario),
  nombre: str(r.nombre),
  servicio: str(r.servicio),
  dias_para_vencer: num(r.dias_para_vencer),
  precio_renovacion: num(r.precio_renovacion),
  estado_notificacion: str(r.estado_notificacion || "pendiente"),
});

export const normalizarComentario = (c) => ({
  id: c.id || c._id || "",
  nombre: str(c.nombre || "Anónimo"),
  texto: str(c.texto),
  estrellas: num(c.estrellas, 5),
  id_servicio: str(c.id_servicio),
  aprobado: bool(c.aprobado),
  creadoEn: c.creadoEn || null,
});

export const normalizarFaq = (f) => ({
  id: f.id || f._id || "",
  id_faq: str(f.id_faq),
  categoria: str(f.categoria || "general"),
  pregunta: str(f.pregunta),
  respuesta: str(f.respuesta),
  orden: num(f.orden, 99),
});

export const normalizarInventario = (i) => ({
  id: i.id || i._id || "",
  id_servicio: str(i.id_servicio),
  estado: str(i.estado || "disponible"),
  credenciales: i.credenciales && typeof i.credenciales === "object"
    ? { usuario: str(i.credenciales.usuario), clave: str(i.credenciales.clave), perfil: str(i.credenciales.perfil), pin: str(i.credenciales.pin) }
    : { usuario: "", clave: "", perfil: "", pin: "" },
});

export const normalizarChat = (c) => ({
  id: c.id || c._id || "",
  id_canal: str(c.id_canal || c.id),
  nombre_usuario: str(c.nombre_usuario || "Cliente"),
  email_usuario: str(c.email_usuario),
  rol_usuario: str(c.rol_usuario || "cliente"),
  estado_canal: str(c.estado_canal || "esperando_soporte"),
  ultimo_mensaje: str(c.ultimo_mensaje),
  actualizadoEn: c.actualizadoEn || null,
  mensajes: Array.isArray(c.mensajes)
    ? c.mensajes.map((m) => ({ id_mensaje: str(m.id_mensaje), remitente: str(m.remitente || "cliente"), texto: str(m.texto), leido: bool(m.leido), fecha: m.fecha || null }))
    : [],
});

export const normalizarTicket = (t) => ({
  id: t.id || t._id || "",
  id_ticket: str(t.id_ticket),
  email_usuario: str(t.email_usuario),
  estado: str(t.estado || "en_revision"),
  tipo_falla: str(t.tipo_falla),
  mensaje_cliente: str(t.mensaje_cliente),
  id_suscripcion_afectada: str(t.id_suscripcion_afectada),
  historial_respuestas: Array.isArray(t.historial_respuestas) ? t.historial_respuestas : [],
  creadoEn: t.creadoEn || null,
});

export const normalizarNotifAdmin = (n) => ({
  id: n.id || n._id || "",
  email: str(n.email),
  mensaje: str(n.mensaje),
  tipo: str(n.tipo),
  leido: bool(n.leido),
  creadoEn: n.creadoEn || null,
});

export const normalizarMovimiento = (m) => ({
  id: m.id || m._id || "",
  descripcion: str(m.descripcion),
  tipo: str(m.tipo || "ingreso"),
  monto: num(m.monto),
  saldo_anterior: num(m.saldo_anterior),
  saldo_posterior: num(m.saldo_posterior),
  ejecutado_por: str(m.ejecutado_por),
  usuario: str(m.usuario),
  referencia: str(m.referencia),
  fecha: m.fecha || null,
});

export const normalizarRespuestaRapida = (r) => ({
  id: r.id || r._id || "",
  atajo_teclado: str(r.atajo_teclado),
  categoria: str(r.categoria || "general"),
  titulo_macro: str(r.titulo_macro),
  cuerpo_mensaje: str(r.cuerpo_mensaje),
});

// §5.3: flyers_revendedores.configuraciones array heterogéneo → map coherente.
export const normalizarFlyer = (f) => {
  let cfg = f.configuraciones;
  if (Array.isArray(cfg)) {
    const m = {};
    cfg.forEach((v) => {
      if (typeof v === "string" && /^https?:|#/.test(v)) { if (v[0] === "#") m.color_fondo = m.color_fondo || v; }
    });
    cfg = { id_servicio: "", color_fondo: "#05050b", color_texto: "#00d2ff", slogan: "", activo: true };
  }
  return {
    id: f.id || f._id || "",
    nombre_negocio: str(f.nombre_negocio || "NV Streaming"),
    uid_revendedor: str(f.uid_revendedor),
    configuraciones: {
      id_servicio: str(cfg && cfg.id_servicio),
      color_fondo: str(cfg && cfg.color_fondo, "#05050b"),
      color_texto: str(cfg && cfg.color_texto, "#00d2ff"),
      slogan: str(cfg && cfg.slogan),
      activo: bool(cfg && cfg.activo, true),
    },
    ultima_actualizacion: f.ultima_actualizacion || null,
  };
};

export const normalizarTarjetaHeader = (t) => ({
  id: t.id || t._id || "",
  id_tarjeta: str(t.id_tarjeta),
  titulo: str(t.titulo),
  imagen_url: str(t.imagen_url),
  activo: bool(t.activo, true),
  orden: num(t.orden, 99),
});

/* ─────────────────  MÓDULO OTP · AUTOMATIZACIÓN DE CREDENCIALES  ───────────── */
export const normalizarPlataforma = (p) => ({
  id: p.id || p._id || "",
  nombre: str(p.nombre),
  id_servicio: str(p.id_servicio || p.id),
  estado: p.estado == null ? 1 : num(p.estado, 1),
  keywords: Array.isArray(p.keywords) ? p.keywords : [String(p.nombre || "").toLowerCase()],
});

export const normalizarCodigo = (c) => {
  const exp = c.expira_at || null;
  const expDate = exp ? (typeof exp.toDate === "function" ? exp.toDate() : new Date(typeof exp.seconds === "number" ? exp.seconds * 1000 : exp)) : null;
  const vigente = expDate ? expDate.getTime() > Date.now() : true;
  const leido = num(c.leido) === 1 || c.leido === true;
  const obsoleto = bool(c.obsoleto);
  return {
    id: c.id || c._id || "",
    cuenta_madre_id: str(c.cuenta_madre_id),
    plataforma_id: str(c.plataforma_id),
    codigo: str(c.codigo),
    recibido_via: str(c.recibido_via || "Telegram"),
    remitente: str(c.remitente),
    texto_original: str(c.texto_original),
    fecha_recepcion: c.fecha_recepcion || null,
    expira_at: exp,
    leido: leido ? 1 : 0,
    obsoleto,
    perfil_id: str(c.perfil_id),
    cliente_id: str(c.cliente_id),
    // Estado derivado (contrato para la UI): Usado / Expirado / Pendiente.
    estado: obsoleto ? "Obsoleto" : leido ? "Usado" : vigente ? "Pendiente" : "Expirado",
    vigente,
  };
};

export const normalizarPermiso = (p) => ({
  id: p.id || p._id || "",
  rol: str(p.rol || "cliente"),
  puede_inyectar: bool(p.puede_inyectar),
  puede_ver_global: bool(p.puede_ver_global),
  puede_configurar_api: bool(p.puede_configurar_api),
  puede_asignar_masivo: bool(p.puede_asignar_masivo),
  plataformas_permitidas: Array.isArray(p.plataformas_permitidas) ? p.plataformas_permitidas : [],
});

export default {
  normalizarPlataforma, normalizarCodigo, normalizarPermiso,
  normalizarServicio, normalizarOferta, normalizarCombo, normalizarCartelera,
  normalizarMetodoPago, normalizarUsuario, normalizarPedido, normalizarRecarga,
  normalizarSuscripcion, normalizarRenovacion, normalizarComentario, normalizarFaq,
  normalizarInventario, normalizarChat, normalizarTicket, normalizarNotifAdmin,
  normalizarMovimiento, normalizarRespuestaRapida, normalizarFlyer, normalizarTarjetaHeader,
};
