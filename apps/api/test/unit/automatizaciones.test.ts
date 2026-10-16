import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { enmascararDestino, normalizarTelefono } from '../../src/avisos/destinos.js';
import { WhatsAppCloudApi } from '../../src/avisos/whatsapp.js';
import {
  claveRanura,
  DESFASE_CARACAS_MS,
  fechaCaracas,
  inicioDiaCaracas,
  programaDe,
  proximaRanura,
  ranuraActual,
} from '../../src/automatizaciones/horario.js';
import {
  descargar,
  ErrorFuenteTasa,
  extraerPorRuta,
  leerTasaBcv,
  leerTasaJson,
  normalizarNumero,
} from '../../src/automatizaciones/tasas/fuentes.js';
import { esperaReintento } from '../../src/automatizaciones/trabajos.service.js';

const BCV = readFileSync(new URL('./fixtures/bcv.html', import.meta.url), 'utf8');
/** Instante a partir de una hora de Caracas (UTC−4). */
const caracas = (texto: string) => new Date(`${texto}-04:00`);

describe('horario de Venezuela', () => {
  it('el desfase fijo coincide con la zona America/Caracas', () => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      timeZoneName: 'longOffset',
    });
    for (const fecha of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z', '2027-03-30T02:00:00Z']) {
      const zona = f.formatToParts(new Date(fecha)).find((p) => p.type === 'timeZoneName');
      expect(zona?.value).toBe('GMT-04:00');
    }
    expect(DESFASE_CARACAS_MS).toBe(-4 * 3600_000);
  });

  it('el día de Venezuela cambia a las 04:00 UTC', () => {
    expect(fechaCaracas(new Date('2026-09-25T03:59:00Z'))).toBe('2026-09-24');
    expect(fechaCaracas(new Date('2026-09-25T04:00:00Z'))).toBe('2026-09-25');
    expect(inicioDiaCaracas(new Date('2026-09-25T02:00:00Z')).toISOString()).toBe(
      '2026-09-24T04:00:00.000Z',
    );
    expect(inicioDiaCaracas(new Date('2026-09-25T02:00:00Z'), 3).toISOString()).toBe(
      '2026-09-27T04:00:00.000Z',
    );
  });

  it('ranura diaria: la última hora ya pasada del día, o ninguna antes de la primera', () => {
    const p = { tipo: 'diaria', horas: [13, 9] } as const;
    expect(ranuraActual(p, caracas('2026-09-24T08:59:59'))).toBeNull();
    expect(ranuraActual(p, caracas('2026-09-24T09:00:00'))?.toISOString()).toBe(
      '2026-09-24T13:00:00.000Z',
    );
    expect(ranuraActual(p, caracas('2026-09-24T12:30:00'))?.toISOString()).toBe(
      '2026-09-24T13:00:00.000Z',
    );
    expect(ranuraActual(p, caracas('2026-09-24T23:30:00'))?.toISOString()).toBe(
      '2026-09-24T17:00:00.000Z',
    );
    // 22:00 de Caracas es otro día en UTC: la ranura sigue siendo la de las 13:00 locales.
    expect(ranuraActual(p, new Date('2026-09-25T02:00:00Z'))?.toISOString()).toBe(
      '2026-09-24T17:00:00.000Z',
    );
  });

  it('próxima ranura diaria y por intervalo', () => {
    const d = { tipo: 'diaria', horas: [9, 13] } as const;
    expect(proximaRanura(d, caracas('2026-09-24T09:00:00')).toISOString()).toBe(
      '2026-09-24T17:00:00.000Z',
    );
    expect(proximaRanura(d, caracas('2026-09-24T20:00:00')).toISOString()).toBe(
      '2026-09-25T13:00:00.000Z',
    );
    const i = { tipo: 'intervalo', minutos: 60 } as const;
    expect(ranuraActual(i, caracas('2026-09-24T10:59:00'))?.toISOString()).toBe(
      '2026-09-24T14:00:00.000Z',
    );
    expect(proximaRanura(i, caracas('2026-09-24T10:59:00')).toISOString()).toBe(
      '2026-09-24T15:00:00.000Z',
    );
    // Un intervalo de un día se alinea con la medianoche de Venezuela.
    const dia = { tipo: 'intervalo', minutos: 1440 } as const;
    expect(ranuraActual(dia, caracas('2026-09-24T18:00:00'))?.toISOString()).toBe(
      '2026-09-24T04:00:00.000Z',
    );
  });

  it('programa según el tipo y clave única de la ranura', () => {
    expect(programaDe('recordatorio_vencimiento', { diasAntes: [3], hora: 9 })).toEqual({
      tipo: 'diaria',
      horas: [9],
    });
    expect(
      programaDe('tasa_automatica', { fuente: 'bcv', horas: [9, 13], variacionMaximaPct: 10 }),
    ).toEqual({ tipo: 'diaria', horas: [9, 13] });
    expect(programaDe('alerta_sla_tickets', { cadaMinutos: 30 })).toEqual({
      tipo: 'intervalo',
      minutos: 30,
    });
    expect(programaDe('escalado_suspension', { diasSuspendida: 3, prioridad: 'alta' })).toEqual({
      tipo: 'intervalo',
      minutos: 60,
    });
    expect(programaDe('aviso_gracia', {})).toBeNull();
    expect(claveRanura('tasa_automatica', new Date('2026-09-24T13:00:00Z'))).toBe(
      'auto:tasa_automatica:2026-09-24T13:00:00.000Z',
    );
  });
});

describe('cola de trabajos', () => {
  it('espera exponencial entre reintentos con tope de una hora', () => {
    expect([1, 2, 3, 4].map(esperaReintento)).toEqual([30, 60, 120, 240]);
    expect(esperaReintento(20)).toBe(3600);
  });
});

describe('fuente BCV', () => {
  it('lee el dólar del bloque "dolar" con coma decimal (no el euro ni el yuan)', () => {
    expect(leerTasaBcv(BCV)).toBe('36.50140000');
  });

  it('acepta separador de miles y comillas simples', () => {
    const html = "<div id='dolar'><div><strong>1.036,5</strong></div></div>";
    expect(leerTasaBcv(html)).toBe('1036.5');
  });

  it('falla con un mensaje claro si la página cambió', () => {
    expect(() => leerTasaBcv('<html><body>Mantenimiento</body></html>')).toThrow(
      /bloque del dólar/,
    );
    // Sin <strong> en el bloque del dólar: no toma el valor del bloque siguiente.
    const sinValor = BCV.replace('<strong> 36,50140000 </strong>', '<span>—</span>').replace(
      '<div class="pull-right dinpro center">',
      '<div id="rublo"><strong> 0,40000000 </strong></div><div class="pull-right dinpro center">',
    );
    expect(() => leerTasaBcv(sinValor)).toThrow(ErrorFuenteTasa);
    expect(() => leerTasaBcv('<div id="dolar"><strong>N/D</strong></div>')).toThrow(
      /no trae un valor/,
    );
    expect(() => leerTasaBcv('<div id="dolar"><strong>0,00</strong></div>')).toThrow(
      ErrorFuenteTasa,
    );
  });

  it('normaliza números con coma o punto decimal', () => {
    expect(normalizarNumero('36,5014')).toBe('36.5014');
    expect(normalizarNumero(' 36.50 ')).toBe('36.50');
    expect(normalizarNumero('1.036,50')).toBe('1036.50');
    expect(normalizarNumero('1,036.50')).toBe('1036.50');
    expect(normalizarNumero('1.036.501')).toBe('1036501');
    expect(normalizarNumero('36')).toBe('36');
    expect(normalizarNumero('-3')).toBeNull();
    expect(normalizarNumero('abc')).toBeNull();
    expect(normalizarNumero('1e5')).toBeNull();
    expect(normalizarNumero('0')).toBeNull();
  });
});

describe('fuente JSON', () => {
  it('sigue la ruta con puntos, también en listas', () => {
    const datos = { monitors: { bcv: { price: 36.5 } }, tasas: [{ valor: '36,61' }] };
    expect(extraerPorRuta(datos, 'monitors.bcv.price')).toBe(36.5);
    expect(extraerPorRuta(datos, 'tasas.0.valor')).toBe('36,61');
    expect(() => extraerPorRuta(datos, 'monitors.paralelo.price')).toThrow(/no está/);
    expect(() => extraerPorRuta(datos, 'tasas.3.valor')).toThrow(/no está/);
    // Nunca sigue propiedades del prototipo.
    expect(() => extraerPorRuta(datos, 'monitors.constructor')).toThrow(ErrorFuenteTasa);
    expect(() => extraerPorRuta(datos, '__proto__.x')).toThrow(ErrorFuenteTasa);
  });

  it('lee números y textos, y rechaza lo que no es una tasa', () => {
    expect(leerTasaJson('{"usd":{"valor":36.5}}', 'usd.valor')).toBe('36.5');
    expect(leerTasaJson('{"usd":"36,61"}', 'usd')).toBe('36.61');
    expect(() => leerTasaJson('<html>', 'usd')).toThrow(/JSON válido/);
    expect(() => leerTasaJson('{"usd":true}', 'usd')).toThrow(/no es un número/);
    expect(() => leerTasaJson('{"usd":-1}', 'usd')).toThrow(ErrorFuenteTasa);
  });
});

describe('descarga segura de la tasa', () => {
  const respuesta = (cuerpo: string, init: ResponseInit = {}) => new Response(cuerpo, init);

  it('rechaza http y redirecciones a otro sitio; sigue las del mismo host', async () => {
    await expect(
      descargar('http://www.bcv.org.ve/', { tiempoMs: 100, maxBytes: 10, aceptar: 'text/html' }),
    ).rejects.toThrow(/https/);
    const aOtro = vi.fn(async () =>
      respuesta('', { status: 302, headers: { location: 'https://malo.example/' } }),
    );
    await expect(
      descargar('https://www.bcv.org.ve/', {
        tiempoMs: 100,
        maxBytes: 10,
        aceptar: 'text/html',
        pedir: aOtro as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/otro sitio/);
    let llamadas = 0;
    const mismo = vi.fn(async () =>
      ++llamadas === 1
        ? respuesta('', { status: 301, headers: { location: '/inicio' } })
        : respuesta('ok'),
    );
    await expect(
      descargar('https://www.bcv.org.ve/', {
        tiempoMs: 100,
        maxBytes: 10,
        aceptar: 'text/html',
        pedir: mismo as unknown as typeof fetch,
      }),
    ).resolves.toBe('ok');
  });

  it('corta las respuestas demasiado grandes y los errores del servidor', async () => {
    const grande = vi.fn(async () => respuesta('x'.repeat(100)));
    await expect(
      descargar('https://a.example/', {
        tiempoMs: 100,
        maxBytes: 10,
        aceptar: 'text/html',
        pedir: grande as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/demasiado grande/);
    const caido = vi.fn(async () => respuesta('', { status: 503 }));
    await expect(
      descargar('https://a.example/', {
        tiempoMs: 100,
        maxBytes: 10,
        aceptar: 'text/html',
        pedir: caido as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/503/);
  });
});

describe('destinos de los avisos', () => {
  it('enmascara correos y teléfonos', () => {
    expect(enmascararDestino('maria.perez@gmail.com')).toBe('ma***@gmail.com');
    expect(enmascararDestino('a@b.co')).toBe('a***@b.co');
    expect(enmascararDestino('+584141234567')).toBe('+58 ***-***-4567');
    expect(enmascararDestino('+13055550123')).toBe('+1 ***-***-0123');
    expect(enmascararDestino('')).toBe('');
  });

  it('normaliza teléfonos venezolanos e internacionales', () => {
    expect(normalizarTelefono('0414-123.4567')).toBe('+584141234567');
    expect(normalizarTelefono('414 1234567')).toBe('+584141234567');
    expect(normalizarTelefono('+58 (414) 123-4567')).toBe('+584141234567');
    expect(normalizarTelefono('0058 414 1234567')).toBe('+584141234567');
    expect(normalizarTelefono('12345')).toBeNull();
    expect(normalizarTelefono('correo@x.com')).toBeNull();
  });
});

describe('WhatsApp Cloud API', () => {
  it('envía una plantilla al endpoint oficial y no expone el token en los errores', async () => {
    const pedir = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ messages: [{ id: 'wamid.ABC' }] }),
    );
    const canal = new WhatsAppCloudApi('token-secreto', '1234567890', 'v23.0', pedir as never);
    const r = await canal.enviar({
      telefono: '+584141234567',
      plantilla: 'nv_aviso_suspension',
      idioma: 'es',
      parametros: ['Ana\nPérez', 'NV Cine', 'https://nv.test/cuenta'],
    });
    expect(r.referencia).toBe('wamid.ABC');
    const [url, init] = pedir.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token-secreto');
    const cuerpo = JSON.parse(String(init?.body));
    expect(cuerpo.to).toBe('584141234567');
    expect(cuerpo.template.name).toBe('nv_aviso_suspension');
    expect(cuerpo.template.components[0].parameters[0].text).toBe('Ana Pérez');

    const rechazo = vi.fn(async () =>
      Response.json(
        { error: { message: 'Template name does not exist', code: 132001 } },
        { status: 404 },
      ),
    );
    const mal = new WhatsAppCloudApi('token-secreto', '1', 'v23.0', rechazo as never);
    const error = await mal
      .enviar({ telefono: '+584141234567', plantilla: 'x', idioma: 'es', parametros: [] })
      .catch((e: Error) => e.message);
    expect(error).toContain('132001');
    expect(error).not.toContain('token-secreto');
  });

  it('sin credenciales no está listo', () => {
    expect(new WhatsAppCloudApi('', '', 'v23.0').listo).toBe(false);
  });
});
