/**
 * otp-parser.js — Motor de extracción de códigos OTP (Tarea B del spec).
 *
 * Función pura, sin dependencias, reutilizable en cliente y en la Cloud Function
 * (`functions/index.js` la importa como CommonJS mediante un pequeño wrapper).
 * Toma el cuerpo de un mensaje entrante (Telegram/WhatsApp) y extrae:
 *   · el código numérico/alfanumérico (4–8 dígitos),
 *   · la plataforma de origen (por palabras clave),
 *   · el remitente (cuando el payload lo aporta).
 */

// Catálogo de plataformas por defecto (se puede sustituir por el de PostgreSQL).
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

// Sanitiza texto entrante contra XSS/inyección antes de persistir o mostrar.
export function sanitizar(texto) {
  return String(texto == null ? "" : texto)
    .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
    .replace(/[\u0000-\u001F\u007F]/g, "") // elimina caracteres de control
    .slice(0, 2000)
    .trim();
}

/**
 * Extrae el código OTP. Estrategia por prioridad:
 *   1) patrón "código/code ... NNNN" (más fiable),
 *   2) secuencia aislada de 4–8 dígitos `/(?:\b|-)(\d{4,8})(?:\b|-)/`,
 *   3) código alfanumérico de 6 (algunos servicios).
 * Evita capturar años, precios o números de teléfono largos.
 */
export function extraerCodigo(texto) {
  const t = String(texto || "");
  // 1) Cerca de una palabra ancla.
  const ancla = t.match(/(?:c[oó]digo|code|verificaci[oó]n|otp|pin|acceso)\D{0,20}?(\d{4,8})\b/i);
  if (ancla) return ancla[1];
  // 2) Secuencia aislada 4–8 dígitos (no precedida/seguida de más dígitos).
  const m = t.match(/(?:^|[\s\-:])(\d{4,8})(?=$|[\s\-.!]|\b)/);
  if (m && !/\d/.test(t[t.indexOf(m[1]) - 1] || "") ) return m[1];
  // 3) Alfanumérico de 6 en mayúsculas (fallback).
  const alfa = t.match(/\b([A-Z0-9]{6})\b/);
  if (alfa && /\d/.test(alfa[1]) && /[A-Z]/.test(alfa[1])) return alfa[1];
  return null;
}

/** Identifica la plataforma por palabras clave. `catalogo` opcional. */
export function detectarPlataforma(texto, catalogo) {
  const t = String(texto || "").toLowerCase();
  const list = (catalogo && catalogo.length ? catalogo : PLATAFORMAS_KEYWORDS);
  for (const p of list) {
    const kws = p.keywords && p.keywords.length ? p.keywords : [String(p.nombre || p.id).toLowerCase()];
    for (const kw of kws) if (kw && t.includes(String(kw).toLowerCase())) return { id: p.id || p.id_servicio, nombre: p.nombre };
  }
  return null;
}

/**
 * Parseo completo. Devuelve un contrato homogéneo, con `ok` y `motivo` cuando
 * falla, para que el llamador decida (no lanza ni muestra UI).
 */
export function parsearMensaje(payload, catalogo) {
  const texto = sanitizar(payload && (payload.texto || payload.text || payload.message || payload.body));
  const remitente = sanitizar(payload && (payload.remitente || payload.from || payload.sender || payload.chatId || ""));
  const via = /whats/i.test(payload && payload.via || "") ? "WhatsApp" : /tele/i.test(payload && payload.via || "") ? "Telegram" : (payload && payload.via) || "Telegram";
  if (!texto) return { ok: false, motivo: "mensaje vacío" };
  const codigo = extraerCodigo(texto);
  if (!codigo) return { ok: false, motivo: "sin código detectable", texto, remitente, via };
  const plataforma = detectarPlataforma(texto, catalogo);
  return {
    ok: true,
    codigo,
    plataforma_id: plataforma ? plataforma.id : null,
    plataforma_nombre: plataforma ? plataforma.nombre : "Desconocida",
    remitente,
    recibido_via: via,
    texto_original: texto,
  };
}

export default { parsearMensaje, extraerCodigo, detectarPlataforma, sanitizar, PLATAFORMAS_KEYWORDS };
