import { createHash } from 'node:crypto';
import { type DNSResolver, dkimVerify } from 'mailauth';
import { simpleParser } from 'mailparser';
import { normalizarMonto, textoPlano } from '../binance/correo-binance.js';

/** Dominio que firma (DKIM) y envía los avisos de PayPal (service@intl.paypal.com, service@paypal.com…). */
const DOMINIO_PAYPAL = 'paypal.com';

/** Lo que NV saca de un aviso «Ha recibido un pago» de PayPal. */
export interface PagoPaypalLeido {
  /** Nombre del pagador tal como lo muestra PayPal («Samuel Amador»). */
  pagador: string;
  /** «Importe recibido», antes de la comisión, con 2 decimales ("3.17"). */
  monto: string;
  moneda: string;
  /** Id. de transacción del lado de quien recibe (el del cliente es otro). */
  idTransaccion: string | null;
  /** Nota que escribió el pagador, si la trae. */
  nota: string | null;
  /** Hora del correo (el cuerpo solo trae el día). */
  pagadoEn: Date;
}

export type CorreoPaypalRevisado =
  | { valido: true; huella: string; pago: PagoPaypalLeido }
  | { valido: false; huella: string; motivo: string };

const esDePaypal = (dominio: string | undefined | null): boolean => {
  const d = (dominio ?? '').trim().toLowerCase().replace(/\.$/, '');
  return d === DOMINIO_PAYPAL || d.endsWith(`.${DOMINIO_PAYPAL}`);
};

/** Asunto de un aviso de dinero recibido (español o inglés). */
export function esAsuntoDePagoPaypal(asunto: string): boolean {
  return /(ha|has) recibido (un )?(pago|dinero)|recibiste (un )?(pago|dinero)|you(['’]ve| have)? (got|received) (money|a payment)/i.test(
    asunto,
  );
}

/**
 * Referencia del pago en NV dentro de la nota (L-7K2M9QX4). Admite minúsculas y
 * un espacio en vez del guion, porque el cliente la escribe a mano.
 */
export function referenciaEn(texto: string | null | undefined): string | null {
  const m = /\bL[-\s]?([2-9A-HJKMNP-Z]{8})\b/i.exec(texto ?? '');
  return m?.[1] ? `L-${m[1].toUpperCase()}` : null;
}

/**
 * Lee pagador, importe recibido, Id. y nota del cuerpo. Devuelve null si falta
 * el pagador o el importe: un correo dudoso nunca confirma un pago.
 */
export function leerPagoPaypal(texto: string, fecha: Date): PagoPaypalLeido | null {
  const t = texto.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const pagador =
    /(?:^|\n)\s*([^\n$]{2,120}?)\s+(?:le ha enviado|te ha enviado|te envió|le envió|sent you)\s*\n?\s*[$€]?\s*[\d.,]+/i.exec(
      t,
    )?.[1];
  const importe =
    /(?:Importe recibido|Monto recibido|Cantidad recibida|Amount received)\s*:?\s*\n?\s*[$€]?\s*([\d.,]+)\s*([A-Z]{3})\b/i.exec(
      t,
    ) ??
    /(?:le ha enviado|te ha enviado|te envió|le envió|sent you)\s*\n?\s*[$€]?\s*([\d.,]+)\s*([A-Z]{3})\b/i.exec(
      t,
    );
  if (!pagador || !importe) return null;
  const monto = normalizarMonto(importe[1] ?? '');
  if (!monto) return null;
  const id =
    // La tabla pone «Id. de transacción» y «Fecha…» en la misma fila: el Id. viene poco después.
    /(?:Id\.? de (?:la )?transacci[oó]n|N[uú]mero de transacci[oó]n|Transaction ID)[\s\S]{0,120}?\b([0-9A-Z]{17})\b/i.exec(
      t,
    )?.[1] ?? null;
  const nota =
    /(?:Nota de [^\n:]{1,80}|Mensaje de [^\n:]{1,80}|Nota|Note from [^\n:]{1,80})\s*:?\s*\n\s*([^\n]{1,300})/i
      .exec(t)?.[1]
      ?.trim() ?? null;
  return {
    pagador: pagador.trim(),
    monto,
    moneda: (importe[2] ?? '').toUpperCase(),
    idTransaccion: id ? id.toUpperCase() : null,
    nota,
    pagadoEn: fecha,
  };
}

/** Mismo nombre sin importar mayúsculas, tildes ni espacios repetidos. */
export function mismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return !!a && !!b && n(a) === n(b);
}

/**
 * Revisa un correo crudo: firma DKIM válida de paypal.com alineada con el
 * remitente, asunto de dinero recibido y datos completos. Cualquier duda lo descarta.
 */
export async function revisarCorreoPaypal(
  crudo: Buffer,
  opciones: { resolver?: DNSResolver } = {},
): Promise<CorreoPaypalRevisado> {
  const correo = await simpleParser(crudo);
  const idMensaje = correo.messageId?.trim();
  const huella = createHash('sha256')
    .update(idMensaje ? `id:${idMensaje.toLowerCase()}` : crudo)
    .digest('hex');
  const descartar = (motivo: string): CorreoPaypalRevisado => ({ valido: false, huella, motivo });

  const de = correo.from?.value?.[0]?.address ?? '';
  if (!esDePaypal(de.split('@')[1])) return descartar('El remitente no es de paypal.com.');
  if (!esAsuntoDePagoPaypal(correo.subject ?? '')) {
    return descartar('No es un aviso de dinero recibido.');
  }

  let firmaValida = false;
  try {
    const r = await dkimVerify(crudo, opciones.resolver ? { resolver: opciones.resolver } : {});
    const fromFirmado = (r.headerFrom ?? []).map((x) => x.toLowerCase());
    firmaValida =
      fromFirmado.length === 1 &&
      fromFirmado.every((x) => esDePaypal(x.split('@')[1] ?? x)) &&
      r.results.some((x) => x.status?.result === 'pass' && esDePaypal(x.signingDomain));
  } catch {
    firmaValida = false;
  }
  if (!firmaValida) return descartar('La firma DKIM de paypal.com no es válida.');

  const texto = (
    typeof correo.html === 'string' ? textoPlano(correo.html) : (correo.text ?? '')
  ).trim();
  const pago = leerPagoPaypal(texto, correo.date ?? new Date());
  if (!pago) return descartar('No se pudo leer el pagador o el importe recibido.');
  if (pago.moneda !== 'USD') return descartar(`Moneda ${pago.moneda}: solo se acepta USD.`);
  return { valido: true, huella, pago };
}
