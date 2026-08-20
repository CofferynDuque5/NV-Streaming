/**
 * Controlador del Webhook de WhatsApp.
 *
 *  GET  /webhook/whatsapp  → verificación de suscripción (hub.verify_token).
 *  POST /webhook/whatsapp  → recepción de mensajes entrantes.
 *
 * Seguridad:
 *   · GET valida hub.verify_token contra el token configurado.
 *   · POST valida la firma X-Hub-Signature-256 (HMAC-SHA256 con el App Secret)
 *     usando el cuerpo CRUDO, antes de confiar en el payload.
 *   · Se responde 200 de inmediato (Meta reintenta si tardamos) y el procesamiento
 *     ocurre después, de forma asíncrona.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { AgentController } from '../agent/agent.controller.js';
import type { WhatsAppWebhookBody, IncomingMessage } from './whatsapp.types.js';

/** Request de Express con el cuerpo crudo capturado para verificar la firma. */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// Idempotencia básica en memoria (Paso 1). En producción → Redis/tabla dedup.
const processedMessageIds = new Set<string>();
const MAX_IDS = 5000;

/* ─────────────────────────  VERIFICACIÓN (GET)  ───────────────────────── */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verificado por Meta ✓');
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  logger.warn({ mode }, 'Verificación de webhook rechazada (token inválido)');
  res.sendStatus(403);
}

/* ─────────────────────────  FIRMA (HMAC)  ───────────────────────── */
export function isValidSignature(req: RawBodyRequest): boolean {
  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ─────────────────────────  EXTRACCIÓN  ───────────────────────── */
/** Normaliza el payload de Meta a una lista de mensajes de texto propios. */
export function extractTextMessages(body: WhatsAppWebhookBody): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue; // p. ej. solo trae 'statuses'
      const phoneNumberId = value.metadata?.phone_number_id ?? '';
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const msg of value.messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue; // Paso 1: solo texto
        out.push({
          idWhatsapp: msg.from,
          messageId: msg.id,
          text: msg.text.body.trim(),
          contactName,
          phoneNumberId,
          timestamp: msg.timestamp,
        });
      }
    }
  }
  return out;
}

/* ─────────────────────────  RECEPCIÓN (POST)  ───────────────────────── */
export async function handleIncoming(req: RawBodyRequest, res: Response): Promise<void> {
  if (!isValidSignature(req)) {
    logger.warn('Firma X-Hub-Signature-256 inválida — payload descartado');
    res.sendStatus(401);
    return;
  }

  // Responder rápido: Meta reintenta si no recibimos 200 pronto.
  res.sendStatus(200);

  try {
    const body = req.body as WhatsAppWebhookBody;
    if (body.object !== 'whatsapp_business_account') return;

    const mensajes = extractTextMessages(body);
    for (const m of mensajes) {
      if (processedMessageIds.has(m.messageId)) continue; // idempotencia
      processedMessageIds.add(m.messageId);
      if (processedMessageIds.size > MAX_IDS) processedMessageIds.clear();

      // Asegura el usuario y delega al agente (el LLM llega en el Paso 2).
      const usuario = await UsersRepository.upsertByWhatsapp(m.idWhatsapp, m.contactName);
      logger.info({ idWhatsapp: m.idWhatsapp, usuarioId: usuario.id, texto: m.text }, 'Mensaje entrante');

      await AgentController.handleUserMessage({ usuario, mensaje: m });
    }
  } catch (err) {
    // Ya respondimos 200; registramos el error para no perder trazabilidad.
    logger.error({ err }, 'Error procesando el webhook entrante');
  }
}
