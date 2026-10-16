import { Inject, Injectable } from '@nestjs/common';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import {
  codigoSeguro,
  comoObjeto,
  type Disponibilidad,
  type EntradaModelo,
  entero,
  ErrorProveedorIa,
  type LlamadaHerramienta,
  pedirJson,
  type ProveedorAsistente,
  type SalidaModelo,
} from './proveedor.js';

/** API de mensajes de Anthropic. */
export const URL_API_ANTHROPIC = 'https://api.anthropic.com';
export const VERSION_API_ANTHROPIC = '2023-06-01';
const TIEMPO_LIMITE_MS = 60_000;

type Bloque = Record<string, unknown>;
interface MensajeAnthropic {
  role: 'user' | 'assistant';
  content: Bloque[];
}

/**
 * Claude por la API de mensajes de Anthropic (`POST /v1/messages`), sin SDK.
 * El modelo es el que se configure (`ANTHROPIC_MODELO`, copiado de la consola de
 * Anthropic): aquí no hay ningún nombre de modelo fijo. Las herramientas van
 * como `tools: [{ name, description, input_schema }]`; el modelo pide
 * `tool_use` y los resultados vuelven como bloques `tool_result` en un mensaje
 * del usuario. El costo se calcula con los precios por millón del entorno.
 */
@Injectable()
export class ProveedorAnthropic implements ProveedorAsistente {
  readonly proveedor = 'claude' as const;
  readonly modelo: string;
  tiempoLimiteMs = TIEMPO_LIMITE_MS;
  private readonly base: string;

  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {
    this.base = (entorno.ANTHROPIC_API_URL || URL_API_ANTHROPIC).replace(/\/+$/, '');
    this.modelo = entorno.ANTHROPIC_MODELO;
  }

  disponible(): Disponibilidad {
    const e = this.entorno;
    if (!e.ANTHROPIC_API_KEY)
      return { ok: false, motivo: 'Falta ANTHROPIC_API_KEY en el entorno.' };
    if (!e.ANTHROPIC_MODELO) {
      return {
        ok: false,
        motivo: 'Falta ANTHROPIC_MODELO: copia el id del modelo desde la consola de Anthropic.',
      };
    }
    if (!e.ANTHROPIC_PRECIO_ENTRADA_MTOK || !e.ANTHROPIC_PRECIO_SALIDA_MTOK) {
      return {
        ok: false,
        motivo:
          'Faltan ANTHROPIC_PRECIO_ENTRADA_MTOK y ANTHROPIC_PRECIO_SALIDA_MTOK (USD por millón de tokens), necesarios para el tope de gasto.',
      };
    }
    return { ok: true, motivo: null };
  }

  /** Precios en USD por millón de tokens (texto decimal). */
  get precios(): { entrada: string; salida: string } {
    return {
      entrada: this.entorno.ANTHROPIC_PRECIO_ENTRADA_MTOK || '0',
      salida: this.entorno.ANTHROPIC_PRECIO_SALIDA_MTOK || '0',
    };
  }

  async responder(e: EntradaModelo): Promise<SalidaModelo> {
    const d = this.disponible();
    if (!d.ok) throw new ErrorProveedorIa(d.motivo ?? 'Claude no está configurado.');
    const r = await pedirJson(
      `${this.base}/v1/messages`,
      {
        metodo: 'POST',
        cabeceras: {
          'x-api-key': this.entorno.ANTHROPIC_API_KEY,
          'anthropic-version': VERSION_API_ANTHROPIC,
        },
        cuerpo: {
          model: e.modelo || this.modelo,
          max_tokens: e.maxTokens,
          temperature: 0.2,
          system: e.sistema,
          messages: aMensajesAnthropic(e),
          ...(e.herramientas.length
            ? {
                tools: e.herramientas.map((h) => ({
                  name: h.nombre,
                  description: h.descripcion,
                  input_schema: h.esquemaJson,
                })),
              }
            : {}),
        },
      },
      Math.min(this.tiempoLimiteMs, e.plazoMs ?? Infinity),
      'Anthropic',
    );
    if (r.estado >= 400) throw errorAnthropic(r.estado, r.cuerpo);
    const c = comoObjeto(r.cuerpo);
    const bloques = Array.isArray(c['content']) ? c['content'] : [];
    const textos: string[] = [];
    const llamadas: LlamadaHerramienta[] = [];
    for (const b of bloques) {
      const o = comoObjeto(b);
      if (o['type'] === 'text' && typeof o['text'] === 'string') textos.push(o['text']);
      if (o['type'] === 'tool_use') {
        const id = codigoSeguro(o['id']);
        const nombre = codigoSeguro(o['name']);
        if (id && nombre) llamadas.push({ id, nombre, argumentos: o['input'] ?? {} });
      }
    }
    const uso = comoObjeto(c['usage']);
    return {
      texto: textos.join('\n').trim(),
      llamadas,
      // Los tokens de caché también se cobran: cuentan como entrada (estimación por lo alto).
      tokensEntrada:
        entero(uso['input_tokens']) +
        entero(uso['cache_creation_input_tokens']) +
        entero(uso['cache_read_input_tokens']),
      tokensSalida: entero(uso['output_tokens']),
      detenido:
        c['stop_reason'] === 'tool_use' || llamadas.length
          ? 'herramientas'
          : c['stop_reason'] === 'max_tokens'
            ? 'limite'
            : 'fin',
    };
  }
}

/**
 * Historial neutro → mensajes de Anthropic: deben empezar por el usuario y
 * alternar; los mensajes seguidos del mismo rol se unen.
 */
export function aMensajesAnthropic(e: Pick<EntradaModelo, 'mensajes'>): MensajeAnthropic[] {
  const salida: MensajeAnthropic[] = [];
  for (const m of e.mensajes) {
    let actual: MensajeAnthropic;
    if (m.rol === 'usuario') {
      actual = { role: 'user', content: [{ type: 'text', text: m.texto }] };
    } else if (m.rol === 'asistente') {
      const content: Bloque[] = [];
      if (m.texto) content.push({ type: 'text', text: m.texto });
      for (const l of m.llamadas ?? []) {
        content.push({
          type: 'tool_use',
          id: l.id,
          name: l.nombre,
          input: comoObjeto(l.argumentos),
        });
      }
      if (!content.length) continue;
      actual = { role: 'assistant', content };
    } else {
      actual = {
        role: 'user',
        content: m.resultados.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.contenido,
          ...(r.error ? { is_error: true } : {}),
        })),
      };
    }
    const previo = salida.at(-1);
    if (!previo && actual.role === 'assistant') continue;
    if (previo && previo.role === actual.role) previo.content.push(...actual.content);
    else salida.push(actual);
  }
  return salida;
}

/** Error de la API sin el mensaje del cuerpo (solo el estado y el tipo). */
function errorAnthropic(estado: number, cuerpo: unknown): ErrorProveedorIa {
  const tipo = codigoSeguro(comoObjeto(comoObjeto(cuerpo)['error'])['type']);
  if (estado === 401 || estado === 403) {
    return new ErrorProveedorIa(
      `Anthropic rechazó la clave (${estado}). Revisa ANTHROPIC_API_KEY y los permisos de la cuenta.`,
    );
  }
  if (estado === 404) {
    return new ErrorProveedorIa(
      'Anthropic no reconoce el modelo configurado. Revisa ANTHROPIC_MODELO en la consola de Anthropic.',
    );
  }
  if (estado === 429) {
    return new ErrorProveedorIa('Anthropic limitó las peticiones (429). Inténtalo en un momento.');
  }
  if (estado >= 500) {
    return new ErrorProveedorIa(
      `Anthropic no pudo responder (${estado}${tipo ? `: ${tipo}` : ''}).`,
    );
  }
  return new ErrorProveedorIa(
    `Anthropic rechazó la petición (${estado}${tipo ? `: ${tipo}` : ''}).`,
  );
}
