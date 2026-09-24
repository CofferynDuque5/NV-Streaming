import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** SHA-256 en hexadecimal. Se usa para guardar tokens sin poder recuperarlos. */
export function sha256(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

/** Token aleatorio de 256 bits, apto para URLs. */
export function tokenAleatorio(): string {
  return randomBytes(32).toString('base64url');
}

const ALFABETO_RESPALDO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de respaldo legible con el formato XXXXX-XXXXX (sin caracteres ambiguos). */
export function codigoRespaldo(): string {
  const bytes = randomBytes(10);
  let texto = '';
  for (let i = 0; i < 10; i++) {
    texto += ALFABETO_RESPALDO[bytes[i]! % ALFABETO_RESPALDO.length];
    if (i === 4) texto += '-';
  }
  return texto;
}

/**
 * Cifrado simétrico AES-256-GCM con identificador de clave para poder rotarla.
 * Formato: `v1.<idClave>.<iv>.<tag>.<cifrado>` (base64url).
 */
export class Cifrador {
  private readonly claves: Map<string, Buffer>;

  constructor(
    claveActiva: Buffer,
    private readonly idClaveActiva = 'k1',
    anteriores: Record<string, Buffer> = {},
  ) {
    if (claveActiva.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes.');
    this.claves = new Map([...Object.entries(anteriores), [idClaveActiva, claveActiva]]);
  }

  cifrar(textoPlano: string, contexto: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.claves.get(this.idClaveActiva)!, iv);
    // El contexto (AAD) ata el valor cifrado a su uso: no se puede copiar a otro campo.
    cipher.setAAD(Buffer.from(contexto, 'utf8'));
    const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.idClaveActiva, iv, tag, cifrado]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  descifrar(valor: string, contexto: string): string {
    const [version, idClave, iv, tag, cifrado] = valor.split('.');
    if (version !== 'v1' || !idClave || !iv || !tag || !cifrado) {
      throw new Error('Formato de valor cifrado no reconocido.');
    }
    const clave = this.claves.get(idClave);
    if (!clave) throw new Error(`Clave de cifrado desconocida: ${idClave}`);
    const decipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(contexto, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(cifrado, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
