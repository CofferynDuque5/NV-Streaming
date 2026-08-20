/**
 * Servicio del Agente de IA (OpenAI · Function Calling).
 *
 * Orquesta el bucle agéntico:
 *   system + user → LLM → (tool_calls) → backend ejecuta la herramienta →
 *   resultado → LLM → … → respuesta final de texto.
 *
 * El cliente LLM se INYECTA (interfaz `ChatClient`) para poder testear el bucle
 * sin llamar a OpenAI. `createOpenAIClient()` construye el cliente real.
 */
import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOL_SCHEMAS, executeTool, defaultToolDeps, type ToolDeps, type ToolContext } from './tools.js';

/* Interfaz mínima del cliente de chat que usamos (compatible con el SDK real). */
export interface ChatClient {
  chat: {
    completions: {
      create(params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<{
        choices: { message: OpenAI.Chat.Completions.ChatCompletionMessage }[];
      }>;
    };
  };
}

export function createOpenAIClient(): ChatClient {
  if (!env.OPENAI_API_KEY) logger.warn('OPENAI_API_KEY vacío: el agente fallará al invocar al modelo.');
  return new OpenAI({ apiKey: env.OPENAI_API_KEY }) as unknown as ChatClient;
}

export interface AgentOptions {
  client?: ChatClient;
  deps?: ToolDeps;
  model?: string;
  maxSteps?: number;
}

export function createAgent(opts: AgentOptions = {}) {
  const client = opts.client ?? createOpenAIClient();
  const deps = opts.deps ?? defaultToolDeps;
  const model = opts.model ?? env.OPENAI_MODEL;
  const maxSteps = opts.maxSteps ?? 5;

  /**
   * Procesa el mensaje de un cliente y devuelve el texto de respuesta.
   * @param ctx contexto autenticado con el whatsappId REAL del remitente.
   */
  async function responder(userText: string, ctx: ToolContext): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ];

    for (let step = 0; step < maxSteps; step++) {
      const res = await client.chat.completions.create({
        model,
        messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.2,
      });

      const msg = res.choices[0]?.message;
      if (!msg) break;
      messages.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return (msg.content ?? '').trim() || 'Disculpa, no pude procesar tu mensaje. ¿Puedes reformularlo?';
      }

      // El modelo pidió ejecutar herramientas: las corre el BACKEND, no el modelo.
      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args vacíos */ }
        const result = await executeTool(call.function.name, args, ctx, deps);
        logger.info({ tool: call.function.name, encontrado: (result as { encontrado?: boolean })?.encontrado }, 'tool ejecutada');
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    logger.warn('El agente alcanzó el máximo de pasos sin respuesta final');
    return 'Estoy teniendo un inconveniente para completar tu solicitud. Un asesor te ayudará en breve.';
  }

  return { responder };
}

export type Agent = ReturnType<typeof createAgent>;
