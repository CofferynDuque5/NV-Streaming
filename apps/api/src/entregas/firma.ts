import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Firma de los webhooks de entrega (contrato documentado en el README,
 * sección «Entregas y proveedores»):
 *
 *   NV-Firma: t=<segundos unix>,v1=<hex de HMAC-SHA256(clave, "<t>.<cuerpo>")>
 *
 * El proveedor recalcula el HMAC con la clave compartida sobre el cuerpo
 * crudo, compara en tiempo constante y rechaza firmas de hace más de 5 minutos.
 */
export const CABECERA_FIRMA = 'nv-firma';
export const TOLERANCIA_FIRMA_SEGUNDOS = 300;

/** Contexto del cifrado de la clave de firma de un proveedor (atado a su id). */
export const contextoSecretoWebhook = (proveedorId: string) => `proveedor:${proveedorId}:webhook`;

/** Clave nueva para firmar: 32 bytes aleatorios. Se muestra una sola vez. */
export function generarSecretoWebhook(): string {
  return `nvwh_${randomBytes(32).toString('base64url')}`;
}

export function firmar(secreto: string, marcaTiempo: number, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${marcaTiempo}.${cuerpo}`, 'utf8').digest('hex');
}

/** Valor de la cabecera `NV-Firma` para un cuerpo. */
export function cabeceraFirma(secreto: string, cuerpo: string, ahora = Date.now()): string {
  const t = Math.floor(ahora / 1000);
  return `t=${t},v1=${firmar(secreto, t, cuerpo)}`;
}

/** Verifica una cabecera `NV-Firma` (lo que haría el proveedor). */
export function verificarFirma(
  secreto: string,
  cabecera: string | undefined,
  cuerpo: string,
  opciones: { ahora?: number; toleranciaSegundos?: number } = {},
): boolean {
  if (!cabecera) return false;
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(partes['t']);
  const v1 = partes['v1'];
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false;
  const ahora = Math.floor((opciones.ahora ?? Date.now()) / 1000);
  if (Math.abs(ahora - t) > (opciones.toleranciaSegundos ?? TOLERANCIA_FIRMA_SEGUNDOS)) {
    return false;
  }
  const esperada = Buffer.from(firmar(secreto, t, cuerpo), 'hex');
  return timingSafeEqual(esperada, Buffer.from(v1, 'hex'));
}
