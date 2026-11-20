import { createHash } from 'node:crypto';
import { type DNSResolver, dkimVerify } from 'mailauth';
import { simpleParser } from 'mailparser';

/** Dominio que firma (DKIM) y envía los avisos de Binance. */
const DOMINIO_BINANCE = 'binance.com';

/** Lo que NV saca de un aviso «Pago recibido correctamente». */
export interface PagoBinanceLeido {
  remitente: string;
  /** Texto decimal con 2 decimales ("2.50"). */
  monto: string;
  moneda: string;
  /** Fecha y hora del pago según el correo (UTC). */
  pagadoEn: Date;
}

export type CorreoBinanceRevisado =
  | { valido: true; huella: string; pago: PagoBinanceLeido }
  | { valido: false; huella: string; motivo: string };

const esDeBinance = (dominio: string | undefined | null): boolean => {
  const d = (dominio ?? '').trim().toLowerCase().replace(/\.$/, '');
  return d === DOMINIO_BINANCE || d.endsWith(`.${DOMINIO_BINANCE}`);
};

/** Quita etiquetas HTML y entidades comunes: los avisos de Binance son una tabla HTML. */
export function textoPlano(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|h\d|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t\r\f\v]+/g, ' ');
}

/** Asunto de un aviso de pago recibido (en español o inglés). */
export function esAsuntoDePagoRecibido(asunto: string): boolean {
  return /pago recibido|payment received|received (a )?payment/i.test(asunto);
}

/**
 * Lee remitente, monto y fecha del cuerpo del aviso. Devuelve null si falta algo:
 * un correo dudoso nunca confirma un pago.
 */
export function leerPagoBinance(texto: string): PagoBinanceLeido | null {
  const t = texto.replace(/\u00a0/g, ' ');
  const remitente =
    /(?:Remitente|Sender)\s*:?\s*([^\s<>:][^\n<>]{0,79}?)\s*(?=\n|$|Monto\b|Amount\b|Fecha\b|Date\b)/i.exec(
      t,
    )?.[1];
  const monto = /(?:Monto|Amount)\s*:?\s*\n?\s*([\d.,]+)\s*([A-Z]{2,10})\b/i.exec(t);
  const fecha =
    /(?:Fecha y hora|Date(?: & | and )?Time|Time|Fecha)\s*:?\s*\n?\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*\(?\s*UTC/i.exec(
      t,
    );
  if (!remitente || !monto || !fecha) return null;
  const numero = normalizarMonto(monto[1] ?? '');
  if (!numero) return null;
  const pagadoEn = new Date(`${fecha[1]}T${fecha[2]}Z`);
  if (Number.isNaN(pagadoEn.getTime())) return null;
  return {
    remitente: remitente.trim(),
    monto: numero,
    moneda: (monto[2] ?? '').toUpperCase(),
    pagadoEn,
  };
}

/** "2.5" → "2.50", "1,234.5" → "1234.50". Más de 2 decimales no se redondea: se rechaza. */
export function normalizarMonto(crudo: string): string | null {
  const limpio = crudo.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(limpio)) return null;
  const [entero = '0', dec = ''] = limpio.split('.');
  return `${Number(entero)}.${dec.padEnd(2, '0')}`;
}

/** Mismo usuario de Binance, sin importar mayúsculas ni espacios de los bordes. */
export const mismoUsuario = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Revisa un correo crudo: firma DKIM válida de binance.com alineada con el
 * remitente (From), asunto de pago recibido, código anti-phishing (si está
 * configurado) y datos completos. Cualquier duda lo descarta.
 */
export async function revisarCorreoBinance(
  crudo: Buffer,
  opciones: { codigoAntiPhishing: string | null; resolver?: DNSResolver },
): Promise<CorreoBinanceRevisado> {
  const correo = await simpleParser(crudo);
  const idMensaje = correo.messageId?.trim();
  const huella = createHash('sha256')
    .update(idMensaje ? `id:${idMensaje.toLowerCase()}` : crudo)
    .digest('hex');
  const descartar = (motivo: string): CorreoBinanceRevisado => ({ valido: false, huella, motivo });

  const de = correo.from?.value?.[0]?.address ?? '';
  const dominioDe = de.split('@')[1];
  if (!esDeBinance(dominioDe)) return descartar('El remitente no es de binance.com.');
  if (!esAsuntoDePagoRecibido(correo.subject ?? '')) {
    return descartar('No es un aviso de pago recibido.');
  }

  let firmaValida = false;
  try {
    const r = await dkimVerify(crudo, opciones.resolver ? { resolver: opciones.resolver } : {});
    const fromFirmado = (r.headerFrom ?? []).map((x) => x.toLowerCase());
    firmaValida =
      fromFirmado.length === 1 &&
      fromFirmado.every(esDeBinance) &&
      r.results.some((x) => x.status?.result === 'pass' && esDeBinance(x.signingDomain));
  } catch {
    firmaValida = false;
  }
  if (!firmaValida) return descartar('La firma DKIM de binance.com no es válida.');

  // Del HTML se sacan las celdas en líneas separadas; si no hay HTML, el texto plano.
  const texto = (
    typeof correo.html === 'string' ? textoPlano(correo.html) : (correo.text ?? '')
  ).trim();
  const codigo = opciones.codigoAntiPhishing?.trim();
  if (codigo && !new RegExp(`(^|[^\\w])${escaparRegex(codigo)}([^\\w]|$)`).test(texto)) {
    return descartar('No trae tu código anti-phishing.');
  }
  const pago = leerPagoBinance(texto);
  if (!pago) return descartar('No se pudo leer el remitente, el monto o la fecha.');
  if (pago.moneda !== 'USDT') return descartar(`Moneda ${pago.moneda}: solo se acepta USDT.`);
  return { valido: true, huella, pago };
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
