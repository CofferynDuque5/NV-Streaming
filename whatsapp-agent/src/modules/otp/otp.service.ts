/**
 * otp.service.ts — lógica portada de las Cloud Functions (procesarPayload +
 * onCodigoCreado). Recibe el payload del webhook, extrae el código, marca los
 * anteriores como obsoletos, lo guarda, deja una alerta al admin y (si hay chat
 * de Telegram numérico) reenvía el código al cliente. Todo en el mismo proceso,
 * sin triggers de Firestore.
 */
import { CodigosRepository, type Codigo } from '../../db/repositories/codigos.repo.js';
import { CmsRepository } from '../../db/repositories/cms.repo.js';
import { parsearMensaje, type PayloadOtp, type Plataforma } from './otp-parser.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { whatsappSender, type WhatsAppClient } from '../../services/whatsapp.service.js';

// El sender es inyectable (para tests sin red).
let sender: WhatsAppClient = whatsappSender;
export function _setSenderParaTest(s: WhatsAppClient): void { sender = s; }

async function catalogoPlataformas(): Promise<Plataforma[]> {
  try {
    const docs = await CmsRepository.listar('plataformas');
    return docs.map((d) => {
      const kw = (d as { keywords?: string[] }).keywords;
      const plat: Plataforma = { id: String(d.id), nombre: String((d as { nombre?: unknown }).nombre || d.id) };
      if (Array.isArray(kw)) plat.keywords = kw;
      return plat;
    });
  } catch { return []; }
}

export async function procesarPayload(payload: PayloadOtp): Promise<{ ok: boolean; motivo?: string; id?: string; plataforma_id?: string | null; codigo?: string; entregado?: { whatsapp: boolean; telegram: boolean }; destinatario?: string | null }> {
  const catalogo = await catalogoPlataformas();
  const parsed = parsearMensaje(payload, catalogo);
  if (!parsed.ok) return { ok: false, motivo: parsed.motivo };

  // Resuelve el teléfono del cliente destinatario: destino explícito o, si no,
  // por la cuenta madre que recibió el código (suscripción activa → id_whatsapp).
  const telefono = await resolverDestino(payload);
  const telegramChatId = payload.telegram_chat_id != null ? String(payload.telegram_chat_id).trim() : '';

  // Marca obsoletos los códigos previos de esa plataforma y guarda el nuevo.
  await CodigosRepository.marcarObsoletos(null, parsed.plataforma_id);
  const codigo = await CodigosRepository.crear({
    plataformaId: parsed.plataforma_id, plataformaNombre: parsed.plataforma_nombre, codigo: parsed.codigo,
    clienteWs: telefono ?? telegramChatId ?? null,
    remitente: parsed.remitente, recibidoVia: parsed.recibido_via, textoOriginal: parsed.texto_original,
  });

  // Alerta para el back office (colección notificaciones_admin del CMS).
  try {
    await CmsRepository.upsert('notificaciones_admin', 'otp_' + codigo.id, {
      mensaje: `Nuevo código ${(parsed.plataforma_id || 'OTP').toUpperCase()} · ${parsed.codigo}`,
      tipo: 'codigo_otp', leido: false, creadoEn: new Date().toISOString(),
    });
  } catch (e) { logger.warn({ e }, 'no se pudo registrar la alerta OTP'); }

  const entregado = await entregar(codigo, { telefono, telegramChatId });
  return { ok: true, id: codigo.id, plataforma_id: parsed.plataforma_id, codigo: parsed.codigo, entregado, destinatario: telefono ?? (telegramChatId || null) };
}

/** Normaliza a E.164 sin '+': solo dígitos, longitud plausible de teléfono. */
function telefonoValido(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Teléfono del cliente: `destino` explícito o resuelto por la cuenta madre. */
async function resolverDestino(payload: PayloadOtp): Promise<string | null> {
  const explicito = telefonoValido(payload.destino);
  if (explicito) return explicito;
  const cuenta = String(payload.cuenta ?? '').trim();
  if (!cuenta) return null;
  try {
    const dest = await CodigosRepository.destinatarioPorCuenta(cuenta);
    return dest ? telefonoValido(dest.telefono) : null;
  } catch (e) { logger.warn({ e }, 'no se pudo resolver destinatario OTP por cuenta'); return null; }
}

/**
 * Reenvía el código al cliente. Prioriza WhatsApp Cloud API (si hay teléfono y
 * token configurado); además reenvía por Telegram si se pasó un chat, y siempre
 * deja el enlace `wa.me` como respaldo manual. Devuelve qué canales entregaron.
 */
async function entregar(c: Codigo, dest: { telefono: string | null; telegramChatId: string }): Promise<{ whatsapp: boolean; telegram: boolean }> {
  const texto = `Tu código de acceso de ${c.plataforma_nombre || c.plataforma_id || 'la plataforma'} es ${c.codigo}. Válido por 10 minutos. — NV Streaming`;
  const out = { whatsapp: false, telegram: false };

  // 1) WhatsApp Cloud API (canal principal).
  if (dest.telefono) {
    try {
      const r = await sender.sendText(dest.telefono, texto);
      out.whatsapp = !!r;
      if (r) logger.info({ to: dest.telefono, id: r.id }, 'OTP enviado por WhatsApp');
    } catch (e) { logger.error({ e }, 'fallo al enviar OTP por WhatsApp'); }
  }

  // 2) Telegram (si el forwarder pasó un chat numérico del cliente).
  const chatId = /^\d+$/.test(dest.telegramChatId) ? dest.telegramChatId : null;
  if (env.TELEGRAM_BOT_TOKEN && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      });
      out.telegram = !!(res && (res as { ok?: boolean }).ok);
      logger.info({ chatId }, 'OTP enviado por Telegram');
    } catch (e) { logger.error({ e }, 'fallo al enviar OTP por Telegram'); }
  }

  // 3) Respaldo: enlace wa.me para reenvío manual desde el back office.
  const tel = dest.telefono || telefonoValido(c.cliente_ws) || '';
  const avisoWa = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : null;
  try { await CodigosRepository.marcarNotificado(c.id, avisoWa); } catch { /* no crítico */ }
  return out;
}
