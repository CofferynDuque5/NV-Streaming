import { normalizarMonto } from '../binance/correo-binance.js';
import { mismoNombre, referenciaEn } from './correo-paypal.js';

/**
 * Lo que se pudo leer de la captura de un pago de PayPal (del lado de quien paga).
 * Solo sirve para llenar el formulario y avisar al cliente: NUNCA confirma un pago,
 * porque una imagen se puede editar y PayPal le da al pagador un Id. de transacción
 * distinto del que recibe la tienda en su correo.
 */
export interface ComprobantePaypalLeido {
  monto: string | null;
  moneda: string | null;
  idTransaccion: string | null;
  /** A quién se envió, tal como lo muestra PayPal (nombre o correo). */
  destinatario: string | null;
  /** Referencia de NV escrita en la nota (L-XXXXXXXX), si se ve. */
  referencia: string | null;
}

/** Monto como lo muestra PayPal: «1,234.50» o, en español, «1.234,50» / «12,50». */
function montoPaypal(crudo: string): string | null {
  const c = crudo.replace(/[.,]$/, '');
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(c) || /^\d+,\d{1,2}$/.test(c)) {
    return normalizarMonto(c.replace(/\./g, '').replace(',', '.'));
  }
  return normalizarMonto(c);
}

const VERBO_ENVIO = /(?:Enviaste|Le enviaste|Has enviado|Pagaste|You sent|You paid)/i;

/** Lee los datos de un pago de PayPal del texto que salió de la captura (OCR). */
export function leerComprobantePaypal(texto: string): ComprobantePaypalLeido {
  const t = texto.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const lineas = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const importe =
    new RegExp(`${VERBO_ENVIO.source}\\s*[-–]?\\s*[$€]?\\s*([\\d.,]+)\\s*([A-Z]{3})\\b`, 'i').exec(
      t,
    ) ??
    /(?:^|\n)\s*Total\s*:?\s*[-–]?\s*[$€]?\s*([\d.,]+)\s*([A-Z]{3})\b/i.exec(t) ??
    /[-–]\s*[$€]\s*([\d.,]+)\s*([A-Z]{3})\b/.exec(t);
  const monto = importe?.[1] ? montoPaypal(importe[1]) : null;

  const id =
    /(?:Id\.?\s*de\s*(?:la\s*)?transacci[oó]n|N[uú]mero\s*de\s*transacci[oó]n|Transaction\s*ID)[\s\S]{0,120}?\b([0-9A-Z]{17})\b/i.exec(
      t,
    )?.[1] ??
    // Sin la etiqueta: un código de 17 letras y números (con al menos un número y una letra).
    lineas
      .map((l) => /^([0-9A-Z]{17})$/.exec(l)?.[1])
      .find((x) => x && /\d/.test(x) && /[A-Z]/.test(x)) ??
    null;

  let destinatario: string | null = null;
  const iVerbo = lineas.findIndex((l) => VERBO_ENVIO.test(l));
  if (iVerbo >= 0) {
    const resto = /\b(?:a|to)\s+(.{2,80})$/i.exec(lineas[iVerbo] ?? '')?.[1];
    destinatario = resto?.trim() || lineas[iVerbo + 1] || null;
  }
  if (!destinatario) {
    const iEnviado = lineas.findIndex((l) => /^(?:Enviado a|Sent to|Pagado a|Paid to)\b/i.test(l));
    if (iEnviado >= 0) destinatario = lineas[iEnviado + 1] ?? null;
  }

  return {
    monto,
    moneda: importe?.[2]?.toUpperCase() ?? null,
    idTransaccion: id ? id.toUpperCase() : null,
    destinatario: destinatario ? destinatario.slice(0, 80) : null,
    referencia: referenciaEn(t),
  };
}

/**
 * ¿El texto de la captura nombra a quien cobra? Se compara con el titular y el correo
 * escritos en las instrucciones del método («Titular: Ana Pérez Correo: ana@…»). El OCR
 * confunde letras, así que basta con el usuario del correo o dos palabras del nombre.
 */
export function nombraAlTitular(textoCaptura: string, instrucciones: string): boolean | null {
  const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const captura = sinTildes(textoCaptura);
  const correos = instrucciones.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
  const titular =
    /Titular\s*:?\s*([^\n]+?)(?=\s+(?:Correo|Email|Usuario|ID|Tel[eé]fono)\b|\n|$)/i.exec(
      instrucciones,
    )?.[1];
  if (correos.length === 0 && !titular) return null;
  if (correos.some((c) => captura.includes(sinTildes(c.split('@')[0] ?? '')))) return true;
  if (titular) {
    if (mismoNombre(titular, textoCaptura)) return true;
    const palabras = sinTildes(titular)
      .split(/\s+/)
      .filter((p) => p.length >= 3);
    const vistas = palabras.filter((p) => captura.includes(p)).length;
    if (vistas >= Math.min(2, palabras.length)) return true;
  }
  return false;
}
