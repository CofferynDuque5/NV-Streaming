/**
 * Cifrado de credenciales en reposo (AES-256-GCM).
 *
 * Las contraseñas de las cuentas de streaming NUNCA se guardan en claro. Aquí se
 * cifran/descifran. La clave viene de CREDENTIALS_ENC_KEY (32 bytes en base64 o
 * hex). En desarrollo, si no está configurada, se deriva una clave temporal
 * (NO apta para producción) para no bloquear el arranque.
 */
import crypto from 'node:crypto';
import { env, isProd } from '../config/env.js';
import { logger } from './logger.js';

function resolveKey(): Buffer {
  const raw = env.CREDENTIALS_ENC_KEY.trim();
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
    throw new Error('CREDENTIALS_ENC_KEY debe representar 32 bytes (base64 o hex de 64 chars).');
  }
  if (isProd) throw new Error('CREDENTIALS_ENC_KEY es obligatoria en producción.');
  logger.warn('CREDENTIALS_ENC_KEY no configurada: usando clave de desarrollo (no usar en producción).');
  return crypto.createHash('sha256').update('nv-stream-dev-key').digest(); // 32 bytes
}

const KEY = resolveKey();

/** Cifra un texto plano → "iv:tag:ciphertext" en base64. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Descifra "iv:tag:ciphertext". Devuelve null si el formato/tag es inválido. */
export function decrypt(payload: string): string | null {
  try {
    const [ivB64, tagB64, ctB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
