import type { EnlaceCodigo, TipoEnlaceCodigo } from '@nv/shared';

/**
 * Lee el código o el enlace de un correo de un servicio (Netflix, Disney+…).
 * Funciones puras: no tocan la red ni la base.
 */

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodificarEntidades(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** Texto visible de un HTML, con saltos de línea donde hay bloques. */
export function textoDeHtml(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|td|h[1-6]|li|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

/** Nunca se muestran: restablecer clave, darse de baja, ayuda, términos… */
const ENLACE_PROHIBIDO =
  /password|passwd|contrase|reset|restablec|unsubscribe|desuscrib|notificationsettings|privacy|privacidad|terms|terminos|help\.|ayuda|contactus|\/browse\b|manage-?profiles/i;

const ENLACES: { tipo: TipoEnlaceCodigo; patron: RegExp }[] = [
  { tipo: 'hogar', patron: /update-?primary-?location|update-?household|travel\/verify/i },
  {
    tipo: 'verificar',
    patron:
      /verify|verifica|confirm|approve|aprobar|(?:auth|account|secure)\.(?:hbo)?max\.com|one-?time|otp/i,
  },
  { tipo: 'acceso', patron: /nftoken|signin|sign-in|login|magic/i },
];

/** Enlaces http(s) del correo, en orden, sin duplicados. */
export function enlacesDe(html: string | null, texto: string): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  const agregar = (u: string) => {
    const url = decodificarEntidades(u.trim()).replace(/[).,;>\]]+$/, '');
    if (!/^https:\/\//i.test(url) || vistos.has(url)) return;
    vistos.add(url);
    salida.push(url);
  };
  if (html) {
    for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) agregar(m[1]!);
  }
  for (const m of texto.matchAll(/https:\/\/[^\s"'<>]+/gi)) agregar(m[0]);
  return salida;
}

export function enlaceUtil(enlaces: string[]): EnlaceCodigo | null {
  for (const { tipo, patron } of ENLACES) {
    const url = enlaces.find(
      (u) => /^https:\/\//i.test(u) && patron.test(u) && !ENLACE_PROHIBIDO.test(u),
    );
    if (url) return { url, tipo };
  }
  return null;
}

const CLAVES_FUERTES =
  /c[oó]digo|code|codice|kod|pin\b|otp|passcode|contrase[nñ]a temporal|verificaci[oó]n|verification|one-?time|un solo uso|acceso temporal|temporary/i;
const CLAVES_MEDIAS =
  /ingresa|introduce|escribe|enter|usa|use|acceso|access|inicio de sesi[oó]n|sign[ -]?in|login/i;

const esAnio = (s: string) => /^(19|20)\d\d$/.test(s);

/**
 * Código numérico de 4 a 8 dígitos. Primero el asunto («1234 es tu código»);
 * luego el cuerpo, puntuando las líneas cercanas a «código», «ingresa»…
 * Descarta años, precios, pedidos y números largos.
 */
export function codigoDe(asunto: string, texto: string): string | null {
  const enAsunto =
    /^\s*(\d{4,8})\b/.exec(asunto)?.[1] ??
    /(?:c[oó]digo|code|pin)\D{0,12}(\d{4,8})\b/i.exec(asunto)?.[1] ??
    null;
  if (enAsunto && !esAnio(enAsunto)) return enAsunto;

  const lineas = texto
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let mejor: { codigo: string; puntos: number } | null = null;
  lineas.forEach((linea, i) => {
    if (/https?:\/\//i.test(linea) && linea.replace(/https?:\/\/\S+/g, '').trim().length < 4)
      return;
    // «123 456» o «123-456» cuentan como un solo código.
    const limpia = linea.replace(/\b(\d{3})[\s-](\d{3})\b/g, '$1$2');
    for (const m of limpia.matchAll(/(?<![\d$#.,:/-])(\d{4,8})(?![\d.,:/-])/g)) {
      const candidato = m[1]!;
      if (esAnio(candidato)) continue;
      const antes = limpia.slice(Math.max(0, m.index! - 24), m.index!);
      if (
        /(pedido|orden|order|factura|invoice|tarjeta|card|ref|#|\$|usd|bs)\s*:?\s*$/i.test(antes)
      ) {
        continue;
      }
      const contexto = [lineas[i - 2], lineas[i - 1], linea].filter(Boolean).join(' ');
      let puntos = 0;
      if (CLAVES_FUERTES.test(contexto)) puntos += 10;
      if (CLAVES_MEDIAS.test(contexto)) puntos += 4;
      if (limpia.replace(/\s/g, '') === candidato) puntos += 8; // sola en su línea
      if (!mejor || puntos > mejor.puntos) mejor = { codigo: candidato, puntos };
    }
  });
  const final = mejor as { codigo: string; puntos: number } | null;
  return final && final.puntos >= 8 ? final.codigo : null;
}

/** Texto corto y limpio para mostrar: sin enlaces largos ni líneas vacías. */
export function extractoDe(texto: string, max = 600): string {
  const limpio = texto
    .replace(/https?:\/\/\S+/gi, '[enlace]')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

export interface CodigoLeido {
  codigo: string | null;
  enlace: EnlaceCodigo | null;
  extracto: string;
}

export function leerCorreo(asunto: string, texto: string | null, html: string | null): CodigoLeido {
  const plano = texto?.trim() ? texto : html ? textoDeHtml(html) : '';
  return {
    codigo: codigoDe(asunto, plano),
    enlace: enlaceUtil(enlacesDe(html, plano)),
    extracto: extractoDe(plano),
  };
}

/** Sin tildes y en minúsculas, para comparar asuntos. */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function coincideAsunto(asunto: string, asuntos: string[]): boolean {
  const a = normalizar(asunto);
  return asuntos.some((x) => a.includes(normalizar(x)));
}
