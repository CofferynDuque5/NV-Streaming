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
