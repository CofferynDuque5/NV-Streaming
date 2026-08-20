/**
 * whatsapp.service.ts — Envío de mensajes por WhatsApp Cloud API (Meta).
 *
 * POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
 * con Bearer token. Se usa para responder al cliente (agente) y para los avisos
 * del job de renovaciones.
 *
 * El `fetch` es inyectable para poder testear sin red. Si falta el token, no
 * revienta: registra y devuelve null (modo degradado).
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface Sender {
  sendText(to: string, body: string): Promise<{ id: string } | null>;
}

/** Envío de Template Messages (necesario para iniciar conversación fuera de 24h). */
export interface TemplateSender {
  sendTemplate(to: string, name: string, languageCode: string, bodyParams: string[]): Promise<{ id: string } | null>;
}

export interface WhatsAppClient extends Sender, TemplateSender {}

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface WhatsAppSenderOptions {
  fetchImpl?: FetchLike;
  token?: string;
  phoneNumberId?: string;
  apiVersion?: string;
}

export function createWhatsAppSender(opts: WhatsAppSenderOptions = {}): WhatsAppClient {
  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const token = opts.token ?? env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = opts.phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = opts.apiVersion ?? env.WHATSAPP_API_VERSION;

  // POST único a /messages; devuelve el message id o null (modo tolerante).
  async function post(payload: Record<string, unknown>, to: string): Promise<{ id: string } | null> {
    if (!token || !phoneNumberId) {
      logger.warn('WhatsApp no configurado (token/phoneNumberId): mensaje no enviado');
      return null;
    }
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        logger.error({ status: res.status, err: await res.text() }, 'Fallo enviando mensaje de WhatsApp');
        return null;
      }
      const data = (await res.json()) as { messages?: { id: string }[] };
      const id = data.messages?.[0]?.id ?? '';
      logger.info({ to, id, tipo: payload['type'] }, 'Mensaje de WhatsApp enviado');
      return { id };
    } catch (err) {
      logger.error({ err }, 'Excepción enviando mensaje de WhatsApp');
      return null;
    }
  }

  function sendText(to: string, body: string) {
    return post({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }, to);
  }

  function sendTemplate(to: string, name: string, languageCode: string, bodyParams: string[]) {
    return post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
          : [],
      },
    }, to);
  }

  return { sendText, sendTemplate };
}

// Instancia por defecto (usa la config del entorno).
export const whatsappSender: WhatsAppClient = createWhatsAppSender();
