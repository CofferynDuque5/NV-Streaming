import { generateKeyPairSync } from 'node:crypto';
import { type DNSResolver, dkimSign } from 'mailauth';

/**
 * Llaves DKIM de prueba: firman correos «de Binance» y un resolvedor DNS falso
 * publica la llave pública solo para binance.com (selector «nv»).
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privada = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const publica = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

export const resolverPruebas: DNSResolver = async (dominio, tipo) => {
  if (tipo === 'TXT' && dominio === 'nv._domainkey.binance.com') {
    return [[`v=DKIM1; k=rsa; p=${publica}`]];
  }
  const e = new Error(`sin registro ${tipo} ${dominio}`) as Error & { code: string };
  e.code = 'ENOTFOUND';
  throw e;
};

export interface DatosCorreoPrueba {
  remitente?: string;
  monto?: string;
  fecha?: Date;
  codigo?: string;
  de?: string;
  asunto?: string;
  idMensaje?: string;
  /** Dominio que firma; con uno distinto de binance.com la firma no valida. */
  firmaDominio?: string | null;
}

const fechaUtc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

/** Un aviso «Pago recibido correctamente» de Binance, firmado con la llave de prueba. */
export async function correoBinance(d: DatosCorreoPrueba = {}): Promise<Buffer> {
  const fecha = d.fecha ?? new Date();
  const html = `<html><body><h2>Pago recibido correctamente</h2><p>Recibiste una transferencia:</p>
<table><tr><td>Fecha y hora:</td><td>${fechaUtc(fecha)}(UTC)</td></tr>
<tr><td>Remitente:</td><td>${d.remitente ?? 'Katy-2207'}</td></tr>
<tr><td>Monto:</td><td>${d.monto ?? '2.5'} USDT</td></tr></table>
<p>No respondas a este mensaje automático.</p>
<p>Anti-phishing</p><p>${d.codigo ?? 'NVSECRETO1'}</p></body></html>`;
  const crudo = [
    `From: Binance <${d.de ?? 'do_not_reply@mgdirectmail.binance.com'}>`,
    'To: tienda@example.com',
    `Subject: ${d.asunto ?? `[Binance] Pago recibido correctamente - ${fechaUtc(fecha)} (UTC)`}`,
    `Date: ${fecha.toUTCString()}`,
    `Message-ID: <${d.idMensaje ?? `${Math.random().toString(36).slice(2)}@binance.com`}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  if (d.firmaDominio === null) return Buffer.from(crudo);
  const firma = await dkimSign(crudo, {
    signatureData: [
      { signingDomain: d.firmaDominio ?? 'binance.com', selector: 'nv', privateKey: privada },
    ],
  } as never);
  return Buffer.from(`${firma.signatures}${crudo}`);
}
