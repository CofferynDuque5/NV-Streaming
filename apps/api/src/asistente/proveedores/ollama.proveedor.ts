import { randomBytes } from 'node:crypto';
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

/** Ventana de contexto que se pide a Ollama (tokens). 8k cabe de sobra en 8 GB con un modelo 7B. */
export const CONTEXTO_OLLAMA = 8192;

/**
 * Modelo abierto servido por Ollama en el mismo servidor (`POST /api/chat`, sin
 * streaming). Los datos no salen de la máquina y no hay costo por token.
 *
 * Formato de herramientas de Ollama: `tools: [{ type: "function", function: {
 * name, description, parameters } }]`; el modelo responde con
 * `message.tool_calls: [{ function: { name, arguments } }]` (sin id, así que se
 * genera uno) y los resultados vuelven como mensajes `{ role: "tool", content,
 * tool_name }`. Los tokens salen de `prompt_eval_count` y `eval_count`.
 */
@Injectable()
export class ProveedorOllama implements ProveedorAsistente {
  readonly proveedor = 'local' as const;
  readonly modelo: string;
  /** Tiempo máximo por respuesta (las pruebas lo acortan). */
  tiempoLimiteMs: number;
  private readonly base: string;

  constructor(@Inject(ENTORNO) entorno: Entorno) {
    this.base = entorno.OLLAMA_URL.replace(/\/+$/, '');
    this.modelo = entorno.OLLAMA_MODELO;
    this.tiempoLimiteMs = entorno.OLLAMA_TIEMPO_LIMITE_S * 1000;
  }

  disponible(): Disponibilidad {
    if (!this.base) return { ok: false, motivo: 'Falta OLLAMA_URL en el entorno del servidor.' };
    if (!this.modelo)
      return { ok: false, motivo: 'Falta OLLAMA_MODELO en el entorno del servidor.' };
    return { ok: true, motivo: null };
  }

  /**
   * Comprobación opcional (panel de configuración): Ollama responde y el modelo
   * está descargado. Tiempo corto: no debe frenar la página.
   */
  async comprobar(modelo = this.modelo, tiempoMs = 2000): Promise<Disponibilidad> {
    const base = this.disponible();
    if (!base.ok) return base;
    try {
      const r = await pedirJson(
        `${this.base}/api/tags`,
        { metodo: 'GET', cabeceras: {} },
        tiempoMs,
        'Ollama',
      );
      if (r.estado !== 200) return { ok: false, motivo: `Ollama respondió ${r.estado}.` };
      const modelos = comoObjeto(r.cuerpo)['models'];
      const nombres = Array.isArray(modelos)
        ? modelos.map((m) => String(comoObjeto(m)['name'] ?? comoObjeto(m)['model'] ?? ''))
        : [];
      const buscado = modelo.includes(':') ? modelo : `${modelo}:latest`;
      if (!nombres.includes(buscado) && !nombres.includes(modelo)) {
        return {
          ok: false,
          motivo: `Ollama responde, pero el modelo ${modelo} no está descargado: ejecuta «ollama pull ${modelo}».`,
        };
      }
      return { ok: true, motivo: null };
    } catch {
      return {
        ok: false,
        motivo: 'Ollama no responde en OLLAMA_URL. Comprueba que el servicio esté encendido.',
      };
    }
  }

  async responder(e: EntradaModelo): Promise<SalidaModelo> {
    const d = this.disponible();
    if (!d.ok) throw new ErrorProveedorIa(d.motivo ?? 'El modelo local no está configurado.');
    const modelo = e.modelo || this.modelo;
    const mensajes: Record<string, unknown>[] = [{ role: 'system', content: e.sistema }];
    for (const m of e.mensajes) {
      if (m.rol === 'usuario') mensajes.push({ role: 'user', content: m.texto });
      else if (m.rol === 'asistente') {
        mensajes.push({
          role: 'assistant',
          content: m.texto,
          ...(m.llamadas?.length
            ? {
                tool_calls: m.llamadas.map((l) => ({
                  function: { name: l.nombre, arguments: comoObjeto(l.argumentos) },
                })),
              }
            : {}),
        });
      } else {
        for (const r of m.resultados) {
          mensajes.push({ role: 'tool', content: r.contenido, tool_name: r.nombre });
        }
      }
    }
    const r = await pedirJson(
      `${this.base}/api/chat`,
      {
        metodo: 'POST',
        cabeceras: {},
        cuerpo: {
          model: modelo,
          messages: mensajes,
          ...(e.herramientas.length
            ? {
                tools: e.herramientas.map((h) => ({
                  type: 'function',
                  function: {
                    name: h.nombre,
                    description: h.descripcion,
                    parameters: h.esquemaJson,
                  },
                })),
              }
            : {}),
          stream: false,
          // Mantiene el modelo cargado un rato: cargarlo en CPU tarda.
          keep_alive: '30m',
          options: { temperature: 0.2, num_ctx: CONTEXTO_OLLAMA, num_predict: e.maxTokens },
        },
      },
      Math.min(this.tiempoLimiteMs, e.plazoMs ?? Infinity),
      'el modelo local (Ollama)',
    );
    if (r.estado === 404) {
      throw new ErrorProveedorIa(
        `El modelo ${modelo} no está descargado en Ollama: ejecuta «ollama pull ${modelo}».`,
      );
    }
    if (r.estado >= 400) {
      throw new ErrorProveedorIa(`El modelo local respondió con error ${r.estado}.`);
    }
    const c = comoObjeto(r.cuerpo);
    const mensaje = comoObjeto(c['message']);
    const llamadas: LlamadaHerramienta[] = [];
    const crudas = mensaje['tool_calls'];
    if (Array.isArray(crudas)) {
      for (const [i, x] of crudas.entries()) {
        const f = comoObjeto(comoObjeto(x)['function']);
        const nombre = codigoSeguro(f['name']);
        if (!nombre) continue;
        let argumentos: unknown = f['arguments'];
        // Algunos modelos devuelven los argumentos como texto JSON.
        if (typeof argumentos === 'string') {
          try {
            argumentos = JSON.parse(argumentos);
          } catch {
            argumentos = {};
          }
        }
        const id =
          codigoSeguro(comoObjeto(x)['id']) ?? `local_${i}_${randomBytes(4).toString('hex')}`;
        llamadas.push({ id, nombre, argumentos });
      }
    }
    return {
      texto: typeof mensaje['content'] === 'string' ? mensaje['content'].trim() : '',
      llamadas,
      tokensEntrada: entero(c['prompt_eval_count']),
      tokensSalida: entero(c['eval_count']),
      detenido: llamadas.length ? 'herramientas' : c['done_reason'] === 'length' ? 'limite' : 'fin',
    };
  }
}
