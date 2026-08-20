/**
 * Tipos del payload entrante de la WhatsApp Cloud API (Meta).
 * Solo modelamos lo que necesitamos en el Paso 1 (mensajes de texto).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export interface WhatsAppTextMessage {
  from: string;                 // número del remitente (id_whatsapp), E.164 sin '+'
  id: string;                   // wamid — id único del mensaje (idempotencia)
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'interactive' | string;
  text?: { body: string };
}

export interface WhatsAppContact {
  wa_id: string;
  profile?: { name?: string };
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppTextMessage[];
  statuses?: unknown[];         // acuses de entrega/lectura (se ignoran en Paso 1)
}

export interface WhatsAppChange {
  field: string;                // 'messages'
  value: WhatsAppValue;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookBody {
  object: string;               // 'whatsapp_business_account'
  entry: WhatsAppEntry[];
}

/** Mensaje ya normalizado que pasa al controlador del agente. */
export interface IncomingMessage {
  idWhatsapp: string;           // remitente
  messageId: string;            // wamid (para idempotencia)
  text: string;                 // cuerpo de texto
  contactName: string | null;   // nombre de perfil, si viene
  phoneNumberId: string;        // número emisor (para responder en pasos futuros)
  timestamp: string;
}
