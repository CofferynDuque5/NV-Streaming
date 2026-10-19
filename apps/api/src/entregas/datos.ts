import type { Cifrador } from '../comun/cripto.js';
import type { DatosCliente } from './adaptadores/tipos.js';

/**
 * Código y enlace de una entrega, cifrados con AES-256-GCM atados al id de la
 * entrega. Se guardan como `<marca>|<cifrado>`: la marca («c» si hay código,
 * «e» si hay enlace) deja saber qué hay sin descifrar (ver `contenidoGuardado`).
 * Las instrucciones no son secretas y van en su propia columna.
 */
export const contextoEntrega = (id: string) => `entrega:${id}`;

export interface DatosSecretos {
  codigo: string | null;
  enlace: string | null;
}

export function guardarDatos(
  cifrador: Cifrador,
  entregaId: string,
  datos: Pick<DatosCliente, 'codigo' | 'enlace'> | undefined,
): string | null {
  const codigo = datos?.codigo?.trim() || null;
  const enlace = datos?.enlace?.trim() || null;
  if (!codigo && !enlace) return null;
  const marca = `${codigo ? 'c' : ''}${enlace ? 'e' : ''}`;
  const cifrado = cifrador.cifrar(JSON.stringify({ codigo, enlace }), contextoEntrega(entregaId));
  return `${marca}|${cifrado}`;
}

export function leerDatos(
  cifrador: Cifrador,
  entregaId: string,
  guardado: string | null,
): DatosSecretos {
  if (!guardado) return { codigo: null, enlace: null };
  const corte = guardado.indexOf('|');
  const cifrado = corte >= 0 ? guardado.slice(corte + 1) : guardado;
  const v = JSON.parse(cifrador.descifrar(cifrado, contextoEntrega(entregaId))) as Record<
    string,
    unknown
  >;
  return {
    codigo: typeof v['codigo'] === 'string' ? v['codigo'] : null,
    enlace: typeof v['enlace'] === 'string' ? v['enlace'] : null,
  };
}
