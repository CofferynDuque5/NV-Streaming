import type { ProveedorIa } from '@nv/shared';

/** Llamada a una herramienta que pide el modelo. `id` enlaza la llamada con su resultado. */
export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: unknown;
}

/** Resultado de una herramienta tal como vuelve al modelo (ya delimitado y redactado). */
export interface ResultadoHerramienta {
  id: string;
  nombre: string;
  contenido: string;
  error: boolean;
}

/**
 * Historial neutro (independiente del motor). Las respuestas de herramientas
 * solo existen dentro de una misma petición: nunca se guardan.
 */
export type MensajeIa =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto: string; llamadas?: LlamadaHerramienta[] }
  | { rol: 'herramienta'; resultados: ResultadoHerramienta[] };

export interface HerramientaOfrecida {
  nombre: string;
  descripcion: string;
  esquemaJson: Record<string, unknown>;
}

export interface EntradaModelo {
  sistema: string;
  mensajes: MensajeIa[];
  herramientas: HerramientaOfrecida[];
  maxTokens: number;
  /** Modelo elegido en la configuración; sin él, el del entorno. */
  modelo?: string | null;
  /** Tiempo que queda para toda la respuesta (ms); acorta el límite propio del motor. */
  plazoMs?: number;
}

export interface SalidaModelo {
  texto: string;
  llamadas: LlamadaHerramienta[];
  tokensEntrada: number;
  tokensSalida: number;
  /** "fin": terminó de contestar; "herramientas": pide herramientas; "limite": se cortó por tokens. */
  detenido: 'fin' | 'herramientas' | 'limite';
}

export interface Disponibilidad {
  ok: boolean;
  motivo: string | null;
}

/**
 * Un motor de IA. Reglas para quien implemente uno nuevo:
 * - Nunca registres el contenido de los mensajes, los resultados ni las claves.
 * - Los errores son `ErrorProveedorIa` con un mensaje en español sin secretos
 *   (estado HTTP y tipo de error como mucho, nunca el cuerpo de la respuesta).
 * - `disponible()` no hace llamadas de red: solo mira la configuración.
 */
export interface ProveedorAsistente {
  readonly proveedor: ProveedorIa;
  /** Modelo por defecto (el del entorno). */
  readonly modelo: string;
  disponible(): Disponibilidad;
  responder(entrada: EntradaModelo): Promise<SalidaModelo>;
}

/** Falla del motor (red, tiempo, clave rechazada...). El mensaje no lleva secretos. */
export class ErrorProveedorIa extends Error {
  override readonly name = 'ErrorProveedorIa';
}

/** Lee el cuerpo JSON de una respuesta con límite de tiempo; los errores de red salen en español. */
export async function pedirJson(
  url: string,
  init: { metodo: 'GET' | 'POST'; cabeceras: Record<string, string>; cuerpo?: unknown },
  tiempoLimiteMs: number,
  quien: string,
): Promise<{ estado: number; cuerpo: unknown }> {
  let estado: number;
  let crudo: string;
  try {
    const res = await fetch(url, {
      method: init.metodo,
      headers: {
        Accept: 'application/json',
        ...(init.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.cabeceras,
      },
      ...(init.cuerpo === undefined ? {} : { body: JSON.stringify(init.cuerpo) }),
      redirect: 'error',
      signal: AbortSignal.timeout(tiempoLimiteMs),
    });
    estado = res.status;
    crudo = await res.text();
  } catch (err) {
    const nombre = err instanceof Error ? err.name : '';
    throw new ErrorProveedorIa(
      nombre === 'TimeoutError' || nombre === 'AbortError'
        ? `${quien} no respondió a tiempo (${Math.round(tiempoLimiteMs / 1000)} s).`
        : `No se pudo conectar con ${quien}.`,
    );
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = crudo ? JSON.parse(crudo) : null;
  } catch {
    cuerpo = null;
  }
  return { estado, cuerpo };
}

export const comoObjeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const entero = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

/** Código de error seguro para un mensaje (solo letras, números y _). */
export const codigoSeguro = (v: unknown): string | null =>
  typeof v === 'string' && v ? v.replace(/[^\w.-]/g, '').slice(0, 60) || null : null;
