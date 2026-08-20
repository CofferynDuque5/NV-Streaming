/**
 * otp-parser.ts — motor de extracción de OTP, portado de las Cloud Functions
 * (functions/otp-parser.js). Puro: sanea la entrada, extrae el código y detecta
 * la plataforma. Sin I/O.
 */
export type Plataforma = { id: string; nombre: string; keywords?: string[] };

export const PLATAFORMAS_KEYWORDS: Plataforma[] = [
  { id: 'netflix', nombre: 'Netflix', keywords: ['netflix'] },
  { id: 'disney', nombre: 'Disney+', keywords: ['disney+', 'disney plus', 'disney'] },
  { id: 'hbo', nombre: 'Max (HBO)', keywords: ['hbo max', 'hbo', 'max'] },
  { id: 'spotify', nombre: 'Spotify', keywords: ['spotify'] },
  { id: 'appletv', nombre: 'Apple TV+', keywords: ['apple tv', 'appletv', 'apple'] },
  { id: 'paramount', nombre: 'Paramount+', keywords: ['paramount'] },
  { id: 'crunchyroll', nombre: 'Crunchyroll', keywords: ['crunchyroll'] },
  { id: 'chatgpt', nombre: 'ChatGPT', keywords: ['chatgpt', 'openai'] },
  { id: 'vix', nombre: 'ViX', keywords: ['vix'] },
];

export function sanitizar(texto: unknown): string {
  return String(texto == null ? '' : texto)
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, 2000)
    .trim();
}

export function extraerCodigo(texto: unknown): string | null {
  const t = String(texto || '');
  const ancla = t.match(/(?:c[oó]digo|code|verificaci[oó]n|otp|pin|acceso)\D{0,20}?(\d{4,8})\b/i);
  if (ancla) return ancla[1]!;
  const m = t.match(/(?:^|[\s\-:])(\d{4,8})(?=$|[\s\-.!]|\b)/);
  if (m) return m[1]!;
  const alfa = t.match(/\b([A-Z0-9]{6})\b/);
  if (alfa && /\d/.test(alfa[1]!) && /[A-Z]/.test(alfa[1]!)) return alfa[1]!;
  return null;
}

export function detectarPlataforma(texto: unknown, catalogo?: Plataforma[]): { id: string; nombre: string } | null {
  const t = String(texto || '').toLowerCase();
  const list = catalogo && catalogo.length ? catalogo : PLATAFORMAS_KEYWORDS;
  for (const p of list) {
    const kws = p.keywords && p.keywords.length ? p.keywords : [String(p.nombre || p.id).toLowerCase()];
    for (const kw of kws) if (kw && t.includes(String(kw).toLowerCase())) return { id: p.id, nombre: p.nombre };
  }
  return null;
}

export type PayloadOtp = {
  texto?: string; text?: string; message?: string; body?: string;
  remitente?: string; from?: string; sender?: string; chatId?: string; via?: string;
  // Enrutado del reenvío al cliente:
  //  - cuenta: correo (o id) de la cuenta madre que recibió el código → se resuelve
  //    al cliente con suscripción activa en esa cuenta.
  //  - destino: teléfono E.164 del cliente (sin '+'), si el forwarder ya lo conoce.
  //  - telegram_chat_id: chat de Telegram del cliente para reenviar por ese canal.
  cuenta?: string; destino?: string; telegram_chat_id?: string | number;
};
export type OtpParseado =
  | { ok: false; motivo: string; texto?: string; remitente?: string; via?: string }
  | { ok: true; codigo: string; plataforma_id: string | null; plataforma_nombre: string; remitente: string; recibido_via: string; texto_original: string };

export function parsearMensaje(payload: PayloadOtp, catalogo?: Plataforma[]): OtpParseado {
  const texto = sanitizar(payload && (payload.texto || payload.text || payload.message || payload.body));
  const remitente = sanitizar(payload && (payload.remitente || payload.from || payload.sender || payload.chatId || ''));
  const via = /whats/i.test((payload && payload.via) || '') ? 'WhatsApp' : 'Telegram';
  if (!texto) return { ok: false, motivo: 'mensaje vacío' };
  const codigo = extraerCodigo(texto);
  if (!codigo) return { ok: false, motivo: 'sin código detectable', texto, remitente, via };
  const plataforma = detectarPlataforma(texto, catalogo);
  return {
    ok: true, codigo, plataforma_id: plataforma ? plataforma.id : null,
    plataforma_nombre: plataforma ? plataforma.nombre : 'Desconocida',
    remitente, recibido_via: via, texto_original: texto,
  };
}
