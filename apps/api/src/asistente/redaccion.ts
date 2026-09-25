/**
 * Filtro final de redacción: todo lo que sale hacia un motor de IA (mensajes
 * de la persona, resultados de herramientas) y la respuesta que se guarda pasa
 * por aquí. Las herramientas ya devuelven vistas sin secretos; esto es la red
 * de seguridad por si un dato sensible llega escrito en texto libre (un cliente
 * que pega su tarjeta en un ticket, una clave en una nota...).
 */

export const REDACTADO = '[redactado]';

/** Claves de objeto cuyo valor nunca se envía. */
const CLAVE_SENSIBLE =
  /(pass(word|wd)?|contrase[nñ]a|hash|token|secret|secreto|totp|api[_-]?key|apikey|clave|cvv|cvc|tarjeta|card|iban)/i;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** "password: x", "token=x", "contraseña: x"... conserva la clave y oculta el valor. */
const CLAVE_VALOR =
  /\b(pass(?:word|wd)?|contrase(?:ñ|n)a|token|secreto|secret|api[_-]?key|clave|pin)(["']?\s*[:=]\s*["']?)([^\s"',;{}]+)/gi;

/** Código de seguridad de tarjeta mencionado con su nombre. */
const CODIGO_SEGURIDAD = /\b(cvv2?|cvc2?|c[oó]digo de seguridad)\b(\s*(?:es|:|=)?\s*)\d{3,4}\b/gi;

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PORTADOR = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}|\b(Basic)\s+[A-Za-z0-9+/]{16,}={0,2}/gi;

/** Prefijos conocidos de claves de API y tokens de servicios. */
const PREFIJOS_CLAVE = [
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAPP_USR-[A-Za-z0-9_-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bsbx_[a-z]+_[A-Za-z0-9_-]{6,}/g,
];

const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;

/** Secuencias largas de dígitos (con espacios o guiones sueltos). */
const DIGITOS = /(?<![\w.,])\d(?:[ -]?\d){11,33}(?!\w)/g;

/** Cadenas largas sin espacios que parecen aleatorias (tokens, hashes, claves). */
const CADENA_LARGA = /[A-Za-z0-9+_=-]{32,}/g;

/** Algoritmo de Luhn (números de tarjeta). */
export function luhnValido(digitos: string): boolean {
  let suma = 0;
  let doble = false;
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let n = digitos.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (doble) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
    doble = !doble;
  }
  return suma % 10 === 0;
}

function pareceSecreto(c: string): boolean {
  if (/^[a-f0-9]{32,}$/i.test(c)) return true;
  const mayus = /[A-Z]/.test(c);
  const minus = /[a-z]/.test(c);
  const digito = /\d/.test(c);
  if (mayus && minus && digito) return true;
  const guiones = c.split('-').length - 1;
  return (mayus || minus) && digito && guiones <= 1 && c.length >= 40;
}

/** Redacta datos sensibles en texto libre. Los identificadores (UUID) se conservan. */
export function redactarTexto(texto: string): string {
  if (!texto) return texto;
  const ids: string[] = [];
  let t = texto.replace(UUID, (u) => {
    ids.push(u);
    return `⟦${ids.length - 1}⟧`;
  });
  t = t.replace(CLAVE_VALOR, (_m, clave: string, sep: string) => `${clave}${sep}${REDACTADO}`);
  t = t.replace(
    CODIGO_SEGURIDAD,
    (_m, nombre: string, sep: string) => `${nombre}${sep}${REDACTADO}`,
  );
  t = t.replace(JWT, '[token redactado]');
  t = t.replace(
    PORTADOR,
    (_m, bearer: string | undefined, basic: string | undefined) =>
      `${bearer ?? basic ?? ''} ${REDACTADO}`,
  );
  for (const p of PREFIJOS_CLAVE) t = t.replace(p, '[clave redactada]');
  t = t.replace(IBAN, '[cuenta redactada]');
  t = t.replace(DIGITOS, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length >= 13 && d.length <= 19 && luhnValido(d)) return '[tarjeta redactada]';
    if (d.length >= 20) return '[cuenta redactada]';
    return m;
  });
  t = t.replace(CADENA_LARGA, (c) => (pareceSecreto(c) ? '[secreto redactado]' : c));
  return t.replace(/⟦(\d+)⟧/g, (_m, i: string) => ids[Number(i)] ?? '');
}

/**
 * Redacta un valor estructurado: las claves sensibles pierden su valor y cada
 * texto pasa por `redactarTexto`.
 */
export function redactarValor(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 10) return '[…]';
  if (typeof valor === 'string') return redactarTexto(valor);
  if (Array.isArray(valor)) return valor.map((v) => redactarValor(v, profundidad + 1));
  if (valor && typeof valor === 'object') {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      r[k] =
        CLAVE_SENSIBLE.test(k) && v !== null && v !== undefined
          ? REDACTADO
          : redactarValor(v, profundidad + 1);
    }
    return r;
  }
  return valor;
}
