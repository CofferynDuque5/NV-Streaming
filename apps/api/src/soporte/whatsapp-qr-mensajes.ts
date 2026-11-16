import type { TipoMedioWhatsApp } from '@nv/shared';
import { getContentType, normalizeMessageContent, type proto } from 'baileys';

/** Lo que se guarda de un mensaje que no es texto: el equipo lo abre en su WhatsApp. */
const ETIQUETAS: Partial<Record<keyof proto.IMessage, string>> = {
  imageMessage: '📷 Imagen',
  audioMessage: '🎤 Nota de voz',
  videoMessage: '🎬 Video',
  ptvMessage: '🎬 Video',
  documentMessage: '📄 Documento',
  documentWithCaptionMessage: '📄 Documento',
  stickerMessage: 'Sticker',
  locationMessage: '📍 Ubicación',
  liveLocationMessage: '📍 Ubicación en tiempo real',
  contactMessage: '👤 Contacto',
  contactsArrayMessage: '👤 Contactos',
  reactionMessage: 'Reacción',
  pollCreationMessage: '📊 Encuesta',
  pollCreationMessageV3: '📊 Encuesta',
};

/** Mensajes de control (borrados, ediciones, claves de cifrado…): no son conversación. */
const IGNORADOS = new Set<keyof proto.IMessage>([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'pollUpdateMessage',
  'keepInChatMessage',
  'pinInChatMessage',
  'encReactionMessage',
]);

/** Mensajes con archivo que se pueden ver o escuchar en el panel. */
const MEDIOS: Partial<Record<keyof proto.IMessage, TipoMedioWhatsApp>> = {
  imageMessage: 'imagen',
  audioMessage: 'audio',
  videoMessage: 'video',
  ptvMessage: 'video',
  stickerMessage: 'sticker',
  documentMessage: 'documento',
  documentWithCaptionMessage: 'documento',
};

/** Las etiquetas con que empieza el texto guardado de un mensaje con archivo. */
const PREFIJOS_MEDIO = [...new Set(Object.values(ETIQUETAS))].filter((e) =>
  /Imagen|Nota de voz|Video|Documento|Sticker/.test(e),
);

/** El texto propio de un mensaje con archivo (su pie), sin la etiqueta «📷 Imagen». */
export function leyendaDeMedio(texto: string): string {
  for (const p of PREFIJOS_MEDIO) {
    if (texto === p) return '';
    if (texto.startsWith(`${p}: `)) return texto.slice(p.length + 2);
  }
  return texto;
}

export interface MedioQr {
  tipo: TipoMedioWhatsApp;
  mime: string | null;
  segundos: number | null;
  /** Tamaño que anuncia WhatsApp, en bytes. */
  tamano: number | null;
}

/** Qué archivo trae un mensaje (imagen, audio…), sin bajarlo; nulo si no trae. */
export function medioDeMensajeQr(mensaje: proto.IMessage | null | undefined): MedioQr | null {
  const m = normalizeMessageContent(mensaje);
  const tipo = getContentType(m);
  if (!m || !tipo) return null;
  const clase = MEDIOS[tipo];
  if (!clase) return null;
  const datos = (
    tipo === 'documentWithCaptionMessage'
      ? m.documentWithCaptionMessage?.message?.documentMessage
      : (m as Record<string, unknown>)[tipo]
  ) as { mimetype?: string | null; seconds?: number | null; fileLength?: unknown } | null;
  if (!datos) return null;
  const largo = Number(datos.fileLength ?? NaN);
  return {
    tipo: clase,
    mime: typeof datos.mimetype === 'string' ? datos.mimetype.slice(0, 100) : null,
    segundos: typeof datos.seconds === 'number' ? datos.seconds : null,
    tamano: Number.isFinite(largo) ? largo : null,
  };
}

const limpio = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Texto que se guarda para un mensaje recibido por el número vinculado; nulo si no es conversación. */
export function textoMensajeQr(
  mensaje: proto.IMessage | null | undefined,
): { tipo: string; texto: string } | null {
  const m = normalizeMessageContent(mensaje);
  const tipo = getContentType(m);
  if (!m || !tipo || IGNORADOS.has(tipo)) return null;
  const leido =
    limpio(m.conversation) ??
    limpio(m.extendedTextMessage?.text) ??
    limpio(m.buttonsResponseMessage?.selectedDisplayText) ??
    limpio(m.listResponseMessage?.title) ??
    limpio(m.templateButtonReplyMessage?.selectedDisplayText);
  const corto = String(tipo)
    .replace(/Message(V\d)?$/, '')
    .slice(0, 20);
  if (leido) return { tipo: 'text', texto: leido.slice(0, 4096) };
  if (tipo === 'reactionMessage' && !limpio(m.reactionMessage?.text)) return null; // Quitó la reacción.
  const etiqueta = ETIQUETAS[tipo] ?? 'Mensaje que no se puede mostrar aquí';
  const extra =
    limpio(m.imageMessage?.caption) ??
    limpio(m.videoMessage?.caption) ??
    limpio(m.documentMessage?.caption) ??
    limpio(m.documentMessage?.fileName) ??
    limpio(m.documentWithCaptionMessage?.message?.documentMessage?.caption) ??
    limpio(m.reactionMessage?.text) ??
    limpio(m.contactMessage?.displayName) ??
    limpio(m.pollCreationMessage?.name) ??
    limpio(m.pollCreationMessageV3?.name);
  return { tipo: corto, texto: (extra ? `${etiqueta}: ${extra}` : etiqueta).slice(0, 4096) };
}

/** Teléfono (solo dígitos) de un JID de persona («584141234567@s.whatsapp.net»); nulo si no lo es. */
export function telefonoDeJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const [usuario, servidor] = jid.split('@');
  if (servidor !== 's.whatsapp.net' || !usuario) return null;
  const digitos = usuario.split(':')[0]!.replace(/\D/g, '');
  return digitos.length >= 6 && digitos.length <= 20 ? digitos : null;
}

/** Estados de entrega de WhatsApp Web (WebMessageInfo.Status) en el idioma de la bandeja. */
export function estadoEntregaQr(status: number | null | undefined): string | null {
  switch (status) {
    case 0:
      return 'fallido';
    case 2:
      return 'enviado';
    case 3:
      return 'entregado';
    case 4:
    case 5:
      return 'leido';
    default:
      return null;
  }
}

/** Cambios sobre un mensaje ya enviado: reacción, borrado para todos o edición. */
export type CambioQr =
  | { tipo: 'reaccion'; waId: string; emoji: string | null }
  | { tipo: 'eliminado'; waId: string }
  | { tipo: 'editado'; waId: string; texto: string };

/** Si el mensaje es una reacción, un borrado o una edición de otro mensaje; nulo si no. */
export function cambioDeMensajeQr(mensaje: proto.IMessage | null | undefined): CambioQr | null {
  const m = normalizeMessageContent(mensaje);
  if (!m) return null;
  const r = m.reactionMessage;
  if (r?.key?.id) {
    return {
      tipo: 'reaccion',
      waId: r.key.id.slice(0, 160),
      emoji: limpio(r.text)?.slice(0, 16) ?? null,
    };
  }
  const p = m.protocolMessage;
  if (p?.key?.id) {
    // 0 = REVOKE (borrado para todos), 14 = MESSAGE_EDIT.
    if (p.type === 0) return { tipo: 'eliminado', waId: p.key.id.slice(0, 160) };
    if (p.type === 14) {
      const editado = p.editedMessage ? textoMensajeQr(p.editedMessage) : null;
      if (editado?.tipo === 'text') {
        return { tipo: 'editado', waId: p.key.id.slice(0, 160), texto: editado.texto };
      }
    }
  }
  return null;
}

/** Id del mensaje citado (si el mensaje responde a otro). */
export function citaDeMensajeQr(mensaje: proto.IMessage | null | undefined): string | null {
  const m = normalizeMessageContent(mensaje);
  const tipo = getContentType(m);
  if (!m || !tipo) return null;
  const contenido = (m as Record<string, unknown>)[tipo] as
    { contextInfo?: { stanzaId?: string | null } | null } | null | undefined;
  const id = contenido && typeof contenido === 'object' ? contenido.contextInfo?.stanzaId : null;
  return typeof id === 'string' && id ? id.slice(0, 160) : null;
}
