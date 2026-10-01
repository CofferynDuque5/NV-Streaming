import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HERRAMIENTAS, NOMBRES_HERRAMIENTA, PARAMETROS_HERRAMIENTA } from '@nv/shared';
import { esquemaJson, HERRAMIENTAS_MODELO } from '../../src/asistente/herramientas/esquemas.js';
import {
  aMensajesAnthropic,
  ProveedorAnthropic,
} from '../../src/asistente/proveedores/anthropic.proveedor.js';
import { ProveedorOllama } from '../../src/asistente/proveedores/ollama.proveedor.js';
import { type EntradaModelo, ErrorProveedorIa } from '../../src/asistente/proveedores/proveedor.js';
import { ProveedorSandboxIa } from '../../src/asistente/proveedores/sandbox.proveedor.js';
import { cargarEntorno, type Entorno } from '../../src/config/entorno.js';

const CLAVE = 'clave-anthropic-de-prueba-que-no-debe-salir';

// ── Servidor falso para Ollama y Anthropic ──────────────────────────────────

const falso = {
  peticiones: [] as { ruta: string; cabeceras: IncomingMessage['headers']; cuerpo: any }[],
  respuestas: [] as { estado: number; cuerpo: unknown }[],
  demoraMs: 0,
  reiniciar() {
    this.peticiones = [];
    this.respuestas = [];
    this.demoraMs = 0;
  },
};

async function atender(req: IncomingMessage, res: ServerResponse) {
  let crudo = '';
  for await (const trozo of req) crudo += String(trozo);
  falso.peticiones.push({
    ruta: req.url ?? '',
    cabeceras: req.headers,
    cuerpo: crudo ? JSON.parse(crudo) : null,
  });
  if (falso.demoraMs) await new Promise((r) => setTimeout(r, falso.demoraMs));
  const r = falso.respuestas.shift() ?? { estado: 500, cuerpo: { error: 'sin guion' } };
  res.writeHead(r.estado, { 'content-type': 'application/json' });
  res.end(JSON.stringify(r.cuerpo));
}

let servidor: Server;
let base = '';
beforeAll(async () => {
  servidor = createServer((req, res) => void atender(req, res));
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => servidor.close(r)));
beforeEach(() => falso.reiniciar());

const entorno = (extra: Record<string, string> = {}): Entorno =>
  cargarEntorno({
    DATABASE_URL: 'postgresql://nv:nv_local_dev@localhost:5432/nv',
    WEB_ORIGEN: 'http://localhost:3000',
    CLAVE_CIFRADO: Buffer.alloc(32, 1).toString('base64'),
    ...extra,
  });

const entrada: EntradaModelo = {
  sistema: 'Instrucciones de prueba',
  mensajes: [
    { rol: 'usuario', texto: 'Hola' },
    { rol: 'asistente', texto: 'Hola, ¿qué necesitas?' },
    { rol: 'usuario', texto: '¿Qué tickets hay?' },
  ],
  herramientas: [HERRAMIENTAS_MODELO.tickets_abiertos],
  maxTokens: 512,
};

async function capturarError(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('No falló');
}

describe('esquemas JSON de las herramientas', () => {
  it('genera un objeto válido para cada herramienta del catálogo', () => {
    expect(NOMBRES_HERRAMIENTA).toHaveLength(17);
    for (const n of NOMBRES_HERRAMIENTA) {
      const js = esquemaJson(n);
      expect(js['type']).toBe('object');
      expect(js['properties']).toBeTypeOf('object');
      expect(js).not.toHaveProperty('$schema');
      expect(JSON.stringify(js)).not.toContain('"pattern"');
      expect(HERRAMIENTAS[n].nombre).toBe(n);
      expect(HERRAMIENTAS_MODELO[n].descripcion.length).toBeGreaterThan(10);
    }
    expect(esquemaJson('ver_ticket')).toMatchObject({
      properties: { ticketId: { type: 'string', format: 'uuid' } },
      required: ['ticketId'],
    });
    // Con valor por defecto: opcional para el modelo.
    const vencer = esquemaJson('suscripciones_por_vencer');
    expect(vencer['required']).toBeUndefined();
    expect(vencer['properties']).toMatchObject({
      dias: { type: 'integer', minimum: 0, maximum: 60, default: 7 },
    });
    expect(esquemaJson('actualizar_ticket')['properties']).toHaveProperty('estado.enum');
    expect(HERRAMIENTAS_MODELO.pausar_suscripcion.descripcion).toMatch(/propuesta/);
  });

  it('los parámetros se validan con el mismo esquema', () => {
    const id = '6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b';
    expect(PARAMETROS_HERRAMIENTA.actualizar_ticket.safeParse({ ticketId: 'x' }).success).toBe(
      false,
    );
    // Sin cambios: el refine lo rechaza aunque el JSON Schema no lo exprese.
    expect(PARAMETROS_HERRAMIENTA.actualizar_ticket.safeParse({ ticketId: id }).success).toBe(
      false,
    );
    expect(PARAMETROS_HERRAMIENTA.suscripciones_por_vencer.parse({})).toEqual({ dias: 7 });
  });
});

describe('motor local (Ollama)', () => {
  it('ida y vuelta con herramientas y conteo de tokens', async () => {
    const ollama = new ProveedorOllama(entorno({ OLLAMA_URL: `${base}/` }));
    expect(ollama.disponible()).toEqual({ ok: true, motivo: null });
    expect(ollama.modelo).toBe('qwen2.5:7b-instruct');
    falso.respuestas.push({
      estado: 200,
      cuerpo: {
        model: 'qwen2.5:7b-instruct',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'tickets_abiertos', arguments: { soloMios: true } } }],
        },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 321,
        eval_count: 12,
      },
    });
    const r = await ollama.responder(entrada);
    expect(r).toMatchObject({
      texto: '',
      tokensEntrada: 321,
      tokensSalida: 12,
      detenido: 'herramientas',
      llamadas: [{ nombre: 'tickets_abiertos', argumentos: { soloMios: true } }],
    });
    const p = falso.peticiones[0]!;
    expect(p.ruta).toBe('/api/chat');
    expect(p.cuerpo).toMatchObject({
      model: 'qwen2.5:7b-instruct',
      stream: false,
      options: { temperature: 0.2, num_ctx: 8192, num_predict: 512 },
      messages: [
        { role: 'system', content: 'Instrucciones de prueba' },
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Hola, ¿qué necesitas?' },
        { role: 'user', content: '¿Qué tickets hay?' },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'tickets_abiertos', parameters: { type: 'object' } },
        },
      ],
    });

    // Segunda vuelta: los resultados viajan como mensajes "tool"; argumentos en texto JSON.
    falso.respuestas.push({
      estado: 200,
      cuerpo: {
        message: { role: 'assistant', content: 'Hay 2 tickets abiertos.' },
        done_reason: 'stop',
        prompt_eval_count: 400,
        eval_count: 9,
      },
    });
    const r2 = await ollama.responder({
      ...entrada,
      modelo: 'llama3.1:8b',
      mensajes: [
        ...entrada.mensajes,
        { rol: 'asistente', texto: '', llamadas: r.llamadas },
        {
          rol: 'herramienta',
          resultados: [
            {
              id: r.llamadas[0]!.id,
              nombre: 'tickets_abiertos',
              contenido: '{"total":2}',
              error: false,
            },
          ],
        },
      ],
    });
    expect(r2).toMatchObject({ texto: 'Hay 2 tickets abiertos.', llamadas: [], detenido: 'fin' });
    const p2 = falso.peticiones[1]!.cuerpo;
    expect(p2.model).toBe('llama3.1:8b');
    expect(p2.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'tickets_abiertos', arguments: { soloMios: true } } }],
      },
      { role: 'tool', content: '{"total":2}', tool_name: 'tickets_abiertos' },
    ]);

    falso.respuestas.push({
      estado: 200,
      cuerpo: {
        message: {
          role: 'assistant',
          content: 'x',
          tool_calls: [{ function: { name: 'ver_ticket', arguments: '{"ticketId":"abc"}' } }],
        },
        done_reason: 'length',
      },
    });
    const r3 = await ollama.responder(entrada);
    expect(r3.llamadas[0]!.argumentos).toEqual({ ticketId: 'abc' });
    expect(r3.tokensEntrada).toBe(0);
  });

  it('errores claros: modelo no descargado, error HTTP, sin conexión y tiempo agotado', async () => {
    const ollama = new ProveedorOllama(entorno({ OLLAMA_URL: base }));
    falso.respuestas.push({ estado: 404, cuerpo: { error: "model 'x' not found" } });
    const e1 = await capturarError(ollama.responder(entrada));
    expect(e1).toBeInstanceOf(ErrorProveedorIa);
    expect(e1.message).toMatch(/ollama pull qwen2.5:7b-instruct/);

    falso.respuestas.push({ estado: 500, cuerpo: { error: 'boom' } });
    expect((await capturarError(ollama.responder(entrada))).message).toBe(
      'El modelo local respondió con error 500.',
    );

    const caido = new ProveedorOllama(entorno({ OLLAMA_URL: 'http://127.0.0.1:9' }));
    expect((await capturarError(caido.responder(entrada))).message).toMatch(
      /No se pudo conectar con el modelo local/,
    );

    ollama.tiempoLimiteMs = 50;
    falso.demoraMs = 300;
    falso.respuestas.push({ estado: 200, cuerpo: {} });
    expect((await capturarError(ollama.responder(entrada))).message).toMatch(
      /no respondió a tiempo/,
    );

    const sinUrl = new ProveedorOllama(entorno({ OLLAMA_URL: '' }));
    expect(sinUrl.disponible()).toEqual({
      ok: false,
      motivo: 'Falta OLLAMA_URL en el entorno del servidor.',
    });
  });

  it('comprobación del panel: responde y el modelo está descargado', async () => {
    const ollama = new ProveedorOllama(entorno({ OLLAMA_URL: base }));
    falso.respuestas.push({ estado: 200, cuerpo: { models: [{ name: 'qwen2.5:7b-instruct' }] } });
    expect(await ollama.comprobar()).toEqual({ ok: true, motivo: null });
    expect(falso.peticiones[0]!.ruta).toBe('/api/tags');
    falso.respuestas.push({ estado: 200, cuerpo: { models: [{ name: 'llama3.1:8b' }] } });
    expect((await ollama.comprobar()).motivo).toMatch(/ollama pull qwen2.5:7b-instruct/);
    const caido = new ProveedorOllama(entorno({ OLLAMA_URL: 'http://127.0.0.1:9' }));
    expect((await caido.comprobar()).ok).toBe(false);
  });
});

describe('Claude (API de Anthropic)', () => {
  const variables = {
    ANTHROPIC_API_KEY: CLAVE,
    ANTHROPIC_MODELO: 'modelo-de-prueba',
    ANTHROPIC_PRECIO_ENTRADA_MTOK: '3',
    ANTHROPIC_PRECIO_SALIDA_MTOK: '15',
  };

  it('solo está disponible con clave, modelo y precios', () => {
    expect(new ProveedorAnthropic(entorno()).disponible().motivo).toMatch(/ANTHROPIC_API_KEY/);
    expect(
      new ProveedorAnthropic(entorno({ ANTHROPIC_API_KEY: CLAVE })).disponible().motivo,
    ).toMatch(/ANTHROPIC_MODELO/);
    expect(
      new ProveedorAnthropic(
        entorno({ ANTHROPIC_API_KEY: CLAVE, ANTHROPIC_MODELO: 'modelo-de-prueba' }),
      ).disponible().motivo,
    ).toMatch(/PRECIO/);
    expect(new ProveedorAnthropic(entorno(variables)).disponible()).toEqual({
      ok: true,
      motivo: null,
    });
  });

  it('ida y vuelta con tool_use / tool_result y tokens (incluida la caché)', async () => {
    const claude = new ProveedorAnthropic(entorno({ ...variables, ANTHROPIC_API_URL: base }));
    falso.respuestas.push({
      estado: 200,
      cuerpo: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Lo reviso.' },
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'tickets_abiertos',
            input: { soloMios: false },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 800, output_tokens: 30, cache_read_input_tokens: 200 },
      },
    });
    const r = await claude.responder(entrada);
    expect(r).toEqual({
      texto: 'Lo reviso.',
      llamadas: [{ id: 'toolu_01', nombre: 'tickets_abiertos', argumentos: { soloMios: false } }],
      tokensEntrada: 1000,
      tokensSalida: 30,
      detenido: 'herramientas',
    });
    const p = falso.peticiones[0]!;
    expect(p.ruta).toBe('/v1/messages');
    expect(p.cabeceras['x-api-key']).toBe(CLAVE);
    expect(p.cabeceras['anthropic-version']).toBe('2023-06-01');
    expect(p.cuerpo).toMatchObject({
      model: 'modelo-de-prueba',
      max_tokens: 512,
      system: 'Instrucciones de prueba',
      tools: [{ name: 'tickets_abiertos', input_schema: { type: 'object' } }],
    });

    falso.respuestas.push({
      estado: 200,
      cuerpo: {
        content: [{ type: 'text', text: 'No hay tickets.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 900, output_tokens: 5 },
      },
    });
    const r2 = await claude.responder({
      ...entrada,
      mensajes: [
        ...entrada.mensajes,
        { rol: 'asistente', texto: r.texto, llamadas: r.llamadas },
        {
          rol: 'herramienta',
          resultados: [
            { id: 'toolu_01', nombre: 'tickets_abiertos', contenido: '{"total":0}', error: false },
          ],
        },
      ],
    });
    expect(r2).toMatchObject({ texto: 'No hay tickets.', detenido: 'fin', tokensSalida: 5 });
    expect(falso.peticiones[1]!.cuerpo.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Lo reviso.' },
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'tickets_abiertos',
            input: { soloMios: false },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: '{"total":0}' }],
      },
    ]);

    falso.respuestas.push({
      estado: 200,
      cuerpo: { content: [{ type: 'text', text: 'Corto' }], stop_reason: 'max_tokens', usage: {} },
    });
    expect((await claude.responder(entrada)).detenido).toBe('limite');
  });

  it('historial: empieza por el usuario y une mensajes seguidos del mismo rol', () => {
    expect(
      aMensajesAnthropic({
        mensajes: [
          { rol: 'asistente', texto: 'saludo previo' },
          { rol: 'usuario', texto: 'a' },
          { rol: 'usuario', texto: 'b' },
          { rol: 'asistente', texto: '' },
          { rol: 'asistente', texto: 'c' },
        ],
      }),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'c' }] },
    ]);
  });

  it('errores en español y sin secretos ni el cuerpo de la respuesta', async () => {
    const claude = new ProveedorAnthropic(entorno({ ...variables, ANTHROPIC_API_URL: base }));
    const casos: [number, string, RegExp][] = [
      [401, 'authentication_error', /rechazó la clave \(401\)/],
      [404, 'not_found_error', /no reconoce el modelo/],
      [429, 'rate_limit_error', /limitó las peticiones/],
      [529, 'overloaded_error', /no pudo responder \(529: overloaded_error\)/],
      [400, 'invalid_request_error', /rechazó la petición \(400: invalid_request_error\)/],
    ];
    for (const [estado, tipo, patron] of casos) {
      falso.respuestas.push({
        estado,
        cuerpo: { type: 'error', error: { type: tipo, message: `detalle con ${CLAVE}` } },
      });
      const e = await capturarError(claude.responder(entrada));
      expect(e).toBeInstanceOf(ErrorProveedorIa);
      expect(e.message).toMatch(patron);
      expect(e.message).not.toContain(CLAVE);
      expect(e.message).not.toContain('detalle');
    }
    claude.tiempoLimiteMs = 50;
    falso.demoraMs = 300;
    falso.respuestas.push({ estado: 200, cuerpo: {} });
    const t = await capturarError(claude.responder(entrada));
    expect(t.message).toBe('Anthropic no respondió a tiempo (0 s).');
    expect(t.message).not.toContain(CLAVE);
  });
});

describe('asistente de pruebas (sandbox)', () => {
  const sandbox = new ProveedorSandboxIa(entorno());
  const con = (texto: string, herramientas = Object.values(HERRAMIENTAS_MODELO)) =>
    sandbox.responder({ ...entrada, mensajes: [{ rol: 'usuario', texto }], herramientas });

  it('reconoce frases y solo pide herramientas ofrecidas', async () => {
    expect((await con('¿Qué suscripciones vencen en 3 días?')).llamadas[0]).toMatchObject({
      nombre: 'suscripciones_por_vencer',
      argumentos: { dias: 3 },
    });
    const id = '6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b';
    expect((await con(`Agrega una nota al cliente ${id}: Llamar mañana.`)).llamadas[0]).toEqual({
      id: 'sbx_1',
      nombre: 'agregar_nota_cliente',
      argumentos: { clienteId: id, texto: 'Llamar mañana.' },
    });
    expect((await con(`Cierra el ticket ${id}`)).llamadas[0]).toMatchObject({
      nombre: 'actualizar_ticket',
      argumentos: { ticketId: id, estado: 'cerrado' },
    });
    const sinPermiso = await con('Pagos por conciliar', [HERRAMIENTAS_MODELO.buscar_clientes]);
    expect(sinPermiso).toMatchObject({ llamadas: [], detenido: 'fin' });
    expect(sinPermiso.texto).toMatch(/No tengo acceso/);
  });

  it('en producción no está disponible', () => {
    expect(
      new ProveedorSandboxIa(entorno({ ASISTENTE_SANDBOX_HABILITADO: 'false' })).disponible().ok,
    ).toBe(false);
  });
});
