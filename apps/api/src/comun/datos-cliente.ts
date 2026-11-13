import type { DatoRequerido } from '@nv/shared';
import type { Cifrador } from './cripto.js';

/**
 * Datos que el cliente escribe al comprar (ID de jugador, correo de su cuenta…).
 * Los de tipo «clave» (la contraseña de su cuenta para activarle el plan) se
 * guardan cifrados con AES-256-GCM, atados al cliente y al dato, y solo los ve
 * el equipo con permiso para revelar credenciales.
 */
export const PREFIJO_CIFRADO = 'nv-cifrado:';

const contexto = (clienteId: string, clave: string) => `dato-cliente:${clienteId}:${clave}`;

export const esDatoCifrado = (v: string) => v.startsWith(PREFIJO_CIFRADO);

/** Cifra los valores de los datos de tipo «clave»; el resto queda igual. */
export function cifrarDatosSecretos(
  cifrador: Cifrador,
  clienteId: string,
  pedidos: DatoRequerido[],
  valores: Record<string, string>,
): Record<string, string> {
  const secretos = new Set(pedidos.filter((d) => d.tipo === 'clave').map((d) => d.clave));
  return Object.fromEntries(
    Object.entries(valores).map(([clave, v]) => [
      clave,
      secretos.has(clave) ? PREFIJO_CIFRADO + cifrador.cifrar(v, contexto(clienteId, clave)) : v,
    ]),
  );
}

/** Descifra los datos cifrados de una suscripción. */
export function descifrarDatosSecretos(
  cifrador: Cifrador,
  clienteId: string,
  valores: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valores).map(([clave, v]) => [
      clave,
      esDatoCifrado(v)
        ? cifrador.descifrar(v.slice(PREFIJO_CIFRADO.length), contexto(clienteId, clave))
        : v,
    ]),
  );
}

/** Solo los valores {clave: texto} guardados (lo demás se ignora). */
export function valoresDeDatos(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
}
