/**
 * otp-parser.js (funciones) — copia servidora del motor de extracción de OTP.
 * Mantener idéntico a site/js/modules/otp-parser.js. Se separa por la frontera
 * de despliegue (Cloud Functions solo empaqueta functions/).
 */
export const PLATAFORMAS_KEYWORDS = [
  { id: "netflix", nombre: "Netflix", keywords: ["netflix"] },
  { id: "disney", nombre: "Disney+", keywords: ["disney+", "disney plus", "disney"] },
  { id: "hbo", nombre: "Max (HBO)", keywords: ["hbo max", "hbo", "max"] },
  { id: "spotify", nombre: "Spotify", keywords: ["spotify"] },
  { id: "appletv", nombre: "Apple TV+", keywords: ["apple tv", "appletv", "apple"] },
  { id: "paramount", nombre: "Paramount+", keywords: ["paramount"] },
  { id: "crunchyroll", nombre: "Crunchyroll", keywords: ["crunchyroll"] },
  { id: "chatgpt", nombre: "ChatGPT", keywords: ["chatgpt", "openai"] },
  { id: "vix", nombre: "ViX", keywords: ["vix"] },
];

export function sanitizar(texto) {
  return String(texto == null ? "" : texto)
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 2000)
    .trim();
}

export function extraerCodigo(texto) {
  const t = String(texto || "");
  const ancla = t.match(/(?:c[oó]digo|code|verificaci[oó]n|otp|pin|acceso)\D{0,20}?(\d{4,8})\b/i);
  if (ancla) return ancla[1];
  const m = t.match(/(?:^|[\s\-:])(\d{4,8})(?=$|[\s\-.!]|\b)/);
  if (m) return m[1];
  const alfa = t.match(/\b([A-Z0-9]{6})\b/);
  if (alfa && /\d/.test(alfa[1]) && /[A-Z]/.test(alfa[1])) return alfa[1];
  return null;
}

export function detectarPlataforma(texto, catalogo) {
  const t = String(texto || "").toLowerCase();
  const list = catalogo && catalogo.length ? catalogo : PLATAFORMAS_KEYWORDS;
  for (const p of list) {
    const kws = p.keywords && p.keywords.length ? p.keywords : [String(p.nombre || p.id).toLowerCase()];
    for (const kw of kws) if (kw && t.includes(String(kw).toLowerCase())) return { id: p.id || p.id_servicio, nombre: p.nombre };
  }
  return null;
}

export function parsearMensaje(payload, catalogo) {
  const texto = sanitizar(payload && (payload.texto || payload.text || payload.message || payload.body));
  const remitente = sanitizar(payload && (payload.remitente || payload.from || payload.sender || payload.chatId || ""));
  const via = /whats/i.test((payload && payload.via) || "") ? "WhatsApp" : "Telegram";
  if (!texto) return { ok: false, motivo: "mensaje vacío" };
  const codigo = extraerCodigo(texto);
  if (!codigo) return { ok: false, motivo: "sin código detectable", texto, remitente, via };
  const plataforma = detectarPlataforma(texto, catalogo);
  return { ok: true, codigo, plataforma_id: plataforma ? plataforma.id : null, plataforma_nombre: plataforma ? plataforma.nombre : "Desconocida", remitente, recibido_via: via, texto_original: texto };
}
