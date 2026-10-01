import { hash, verify } from '@node-rs/argon2';

// Parámetros recomendados por OWASP para Argon2id (19 MiB, 2 iteraciones, 1 hilo).
const OPCIONES = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, OPCIONES);
}

// Hash de referencia para igualar el tiempo de respuesta cuando el correo no existe.
let hashFicticio: Promise<string> | null = null;

export async function verificarContrasena(
  hashGuardado: string | null,
  contrasena: string,
): Promise<boolean> {
  if (!hashGuardado) {
    hashFicticio ??= hash('contraseña-inexistente-para-igualar-tiempos', OPCIONES);
    await verify(await hashFicticio, contrasena).catch(() => false);
    return false;
  }
  return verify(hashGuardado, contrasena).catch(() => false);
}
