/** Webhooks de OTP (Telegram / WhatsApp) + lectura para operadores. Portado de las Functions. */
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import * as Otp from './otp.service.js';
import { CodigosRepository } from '../../db/repositories/codigos.repo.js';

// Valida el token del webhook (bearer / cabecera de Telegram / query). Si el
// secreto está vacío NO bloquea (solo dev) — igual que la Cloud Function.
function tokenValido(req: Request, esperado: string): boolean {
  if (!esperado) return true;
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const tg = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  const q = typeof req.query.token === 'string' ? req.query.token : '';
  return bearer === esperado || tg === esperado || q === esperado;
}

export const OtpController = {
  async telegram(req: Request, res: Response): Promise<void> {
    if (!tokenValido(req, env.TELEGRAM_WEBHOOK_SECRET)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
    const u = (req.body || {}) as Record<string, any>;
    const msg = u.message || u.channel_post || u.edited_message || {};
    const texto = msg.text || msg.caption || '';
    const from = (msg.from && (msg.from.username || msg.from.id)) || (msg.chat && msg.chat.id) || '';
    res.status(200).json(await Otp.procesarPayload({
      texto, via: 'Telegram', remitente: String(from),
      cuenta: u.cuenta, destino: u.destino, telegram_chat_id: u.telegram_chat_id,
    }));
  },

  async whatsapp(req: Request, res: Response): Promise<void> {
    if (!tokenValido(req, env.WHATSAPP_OTP_TOKEN)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
    const b = (req.body || {}) as Record<string, any>;
    const data = b.data || b.message || b;
    const texto =
      (data.message && (data.message.conversation || (data.message.extendedTextMessage && data.message.extendedTextMessage.text))) ||
      data.body || data.text || b.text || '';
    const from = (data.key && data.key.remoteJid) || data.from || b.from || '';
    res.status(200).json(await Otp.procesarPayload({
      texto, via: 'WhatsApp', remitente: String(from),
      cuenta: b.cuenta || data.cuenta, destino: b.destino || data.destino, telegram_chat_id: b.telegram_chat_id,
    }));
  },

  // Operador/admin: últimos códigos recibidos.
  async listar(_req: Request, res: Response): Promise<void> {
    res.json({ codigos: await CodigosRepository.recientes() });
  },
};
