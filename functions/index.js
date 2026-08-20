/**
 * index.js — Cloud Functions de NV Streaming.
 * Módulo de Automatización de Credenciales y Mensajería (webhooks + OTP).
 *
 * Es el receptor centralizado de webhooks (Tarea A): unifica la lógica que antes
 * vivía dispersa en scripts procedimentales (procesar_telegram.php, etc.) en un
 * único controlador seguro. Valida el origen (token/secreto), sanitiza la
 * entrada, parsea el código con el motor compartido y persiste en Firestore.
 * Un trigger onCreate notifica al cliente final.
 *
 * Despliegue:  cd functions && npm i && firebase deploy --only functions
 * Secretos:    firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
 *              firebase functions:secrets:set WHATSAPP_API_TOKEN
 *              firebase functions:secrets:set TELEGRAM_BOT_TOKEN   (para notificar)
 */

import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { parsearMensaje } from "./otp-parser.js";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const WHATSAPP_API_TOKEN = defineSecret("WHATSAPP_API_TOKEN");
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
// Correo de bienvenida: la Cloud Function delega el envío al agente (SMTP).
const AGENT_URL = defineSecret("AGENT_URL");
const AGENT_ADMIN_TOKEN = defineSecret("AGENT_ADMIN_TOKEN");

initializeApp();
// ⚠️ Mismo fix que en el cliente: base nombrada `default` (sin paréntesis).
const db = getFirestore("default");
const TTL_MS = 10 * 60 * 1000;

/* ─────────────────────────  PROCESAMIENTO COMÚN  ─────────────────────── */
async function cargarPlataformas() {
  try {
    const snap = await db.collection("plataformas").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { return []; }
}

async function localizarCuentaMadre(plataformaId) {
  const snap = await db.collection("inventario").where("id_servicio", "==", plataformaId).limit(5).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return docs.find((c) => /disponible|activo/i.test(c.estado || "")) || docs[0] || null;
}

async function localizarPerfil(plataformaId, cuentaCorreo) {
  const snap = await db.collection("suscripciones").where("servicio", "==", plataformaId).limit(10).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return docs.find((s) => (!cuentaCorreo || s.cuentaCorreo === cuentaCorreo) && (s.correo || s.nombre)) || null;
}

/** Núcleo: parsea, valida, asocia y persiste el código. Devuelve el registro. */
async function procesarPayload(payload) {
  const plataformas = await cargarPlataformas();
  const parsed = parsearMensaje(payload, plataformas);
  if (!parsed.ok) return { ok: false, motivo: parsed.motivo };
  if (!parsed.plataforma_id) return { ok: false, motivo: "plataforma no reconocida" };

  const cuenta = await localizarCuentaMadre(parsed.plataforma_id);
  const perfil = await localizarPerfil(parsed.plataforma_id, cuenta?.credenciales?.usuario);
  const ahora = Date.now();

  // Obsoletiza códigos previos vigentes de la misma cuenta madre.
  if (cuenta) {
    const prev = await db.collection("codigos_verificacion")
      .where("cuenta_madre_id", "==", cuenta.id).where("obsoleto", "==", false).get();
    const batch = db.batch();
    prev.forEach((d) => batch.update(d.ref, { obsoleto: true }));
    await batch.commit();
  }

  const registro = {
    cuenta_madre_id: cuenta ? cuenta.id : "",
    plataforma_id: parsed.plataforma_id,
    codigo: parsed.codigo,
    recibido_via: parsed.recibido_via,
    remitente: parsed.remitente || "",
    texto_original: parsed.texto_original,
    fecha_recepcion: FieldValue.serverTimestamp(),
    expira_at: Timestamp.fromMillis(ahora + TTL_MS),
    leido: 0,
    obsoleto: false,
    perfil_id: perfil ? perfil.id : "",
    cliente_id: perfil ? (perfil.cliente_id || "") : "",
    cliente_ws: perfil ? (perfil.ws || "") : "",
  };
  const ref = await db.collection("codigos_verificacion").add(registro);
  await db.collection("notificaciones_admin").add({
    creadoEn: FieldValue.serverTimestamp(), email: "", leido: false,
    mensaje: `Nuevo código ${parsed.plataforma_id.toUpperCase()} · ${parsed.codigo}`, tipo: "codigo_otp",
  });
  return { ok: true, id: ref.id, plataforma_id: parsed.plataforma_id };
}

/* ─────────────────────────  SEGURIDAD  ─────────────────────── */
function tokenValido(req, esperado) {
  if (!esperado) return true; // sin secreto configurado → no bloquea (dev)
  const header = req.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tgSecret = req.get("x-telegram-bot-api-secret-token") || "";
  const queryTok = req.query && req.query.token;
  return bearer === esperado || tgSecret === esperado || queryTok === esperado;
}

/* ─────────────────────────  WEBHOOK TELEGRAM  ─────────────────────── */
export const telegramWebhook = onRequest({ secrets: [TELEGRAM_WEBHOOK_SECRET], cors: false }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!tokenValido(req, TELEGRAM_WEBHOOK_SECRET.value())) return res.status(401).json({ ok: false, error: "unauthorized" });
  try {
    const u = req.body || {};
    const msg = u.message || u.channel_post || u.edited_message || {};
    const texto = msg.text || msg.caption || "";
    const from = (msg.from && (msg.from.username || msg.from.id)) || (msg.chat && msg.chat.id) || "";
    const r = await procesarPayload({ texto, via: "Telegram", remitente: String(from) });
    return res.status(200).json(r);
  } catch (e) { logger.error("telegramWebhook", e); return res.status(500).json({ ok: false }); }
});

/* ─────────────────────────  WEBHOOK WHATSAPP  ─────────────────────── */
// Compatible con Evolution API / Baileys (payload messages.upsert) y genérico.
export const whatsappWebhook = onRequest({ secrets: [WHATSAPP_API_TOKEN], cors: false }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!tokenValido(req, WHATSAPP_API_TOKEN.value())) return res.status(401).json({ ok: false, error: "unauthorized" });
  try {
    const b = req.body || {};
    const data = b.data || b.message || b;
    const texto =
      (data.message && (data.message.conversation || (data.message.extendedTextMessage && data.message.extendedTextMessage.text))) ||
      data.body || data.text || b.text || "";
    const from = (data.key && data.key.remoteJid) || data.from || b.from || "";
    const r = await procesarPayload({ texto, via: "WhatsApp", remitente: String(from) });
    return res.status(200).json(r);
  } catch (e) { logger.error("whatsappWebhook", e); return res.status(500).json({ ok: false }); }
});

/* ─────────────────────────  TRIGGER: NOTIFICAR CLIENTE  ─────────────────── */
// Al crearse un código con cliente asignado, envía el OTP por Telegram/WhatsApp.
export const onCodigoCreado = onDocumentCreated(
  { document: "codigos_verificacion/{id}", database: "default", secrets: [TELEGRAM_BOT_TOKEN, WHATSAPP_API_TOKEN] },
  async (event) => {
    const c = event.data && event.data.data();
    if (!c || c.obsoleto) return;
    if (!c.perfil_id && !c.cliente_ws) return; // sin cliente asignado

    let params = {};
    try { const p = await db.doc("configuracion_sistema/parametros").get(); params = p.exists ? p.data() : {}; } catch (e) {}
    let plantilla = "Hola, tu código de acceso de {{plataforma}} es {{codigo}}. Válido por 10 minutos. — NV Streaming";
    try { const t = await db.doc("configuracion_sistema/plantillas_mensajes").get(); if (t.exists && t.data().notificacion_pedido_aprobado) plantilla = t.data().notificacion_pedido_aprobado; } catch (e) {}

    const texto = plantilla
      .replace(/\{\{\s*codigo\s*\}\}/g, c.codigo)
      .replace(/\{\{\s*plataforma\s*\}\}/g, c.plataforma_id)
      .replace(/\{\{\s*nombre\s*\}\}/g, "cliente")
      .replace(/\{\{\s*credenciales\s*\}\}/g, c.codigo)
      .replace(/\{\{\s*dias_garantia\s*\}\}/g, String(params.garantia_dias || 7));

    // Envío por Telegram Bot API (si hay token y chatId numérico del cliente).
    const tgToken = TELEGRAM_BOT_TOKEN.value();
    const chatId = c.cliente_ws && /^\d+$/.test(String(c.cliente_ws)) ? c.cliente_ws : null;
    if (tgToken && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: texto }),
        });
        logger.info("OTP enviado por Telegram a", chatId);
      } catch (e) { logger.error("telegram send", e); }
    }
    // WhatsApp: la integración concreta (Evolution/Cloud API) va aquí; se deja
    // el enlace wa.me como fallback registrado para uso manual del operador.
    const tel = String(c.cliente_ws || params.whatsapp || "").replace(/[^\d]/g, "");
    const waLink = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
    try { await event.data.ref.update({ notificado: true, aviso_wa: waLink }); } catch (e) {}
  }
);

/* ─────────────────────  TRIGGER: BIENVENIDA AL REGISTRARSE  ───────────────── */
// Al crearse un usuario en Firestore (registro/primer login en la web), delega
// al agente el envío del correo de bienvenida + Términos y Condiciones.
export const onUsuarioCreado = onDocumentCreated(
  { document: "usuarios/{uid}", database: "default", secrets: [AGENT_URL, AGENT_ADMIN_TOKEN] },
  async (event) => {
    const u = event.data && event.data.data();
    if (!u || !u.email) return;
    const base = AGENT_URL.value();
    const token = AGENT_ADMIN_TOKEN.value();
    if (!base || !token) { logger.warn("AGENT_URL/AGENT_ADMIN_TOKEN no configurados: bienvenida no enviada"); return; }
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/usuarios/bienvenida`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: u.email, nombre: u.nombre || u.displayName || "" }),
      });
      logger.info("Bienvenida solicitada", { email: u.email, status: res.status });
    } catch (e) { logger.error("onUsuarioCreado", e); }
  }
);
