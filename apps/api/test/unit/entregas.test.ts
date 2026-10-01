import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Entrega, Proveedor } from '@nv/db';
import { leerConfiguracionProveedor, normalizarCodigo } from '@nv/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Cifrador } from '../../src/comun/cripto.js';
import type { ContextoEntrega } from '../../src/entregas/adaptadores/tipos.js';
import { AdaptadorWebhook, clasificarRespuesta } from '../../src/entregas/adaptadores/webhook.js';
import { guardarDatos, leerDatos } from '../../src/entregas/datos.js';
import {
  cabeceraFirma,
  firmar,
  generarSecretoWebhook,
  verificarFirma,
} from '../../src/entregas/firma.js';
import { contenidoGuardado } from '../../src/entregas/presentacion.js';
import {
  ErrorConexion,
  ErrorDestinoNoPermitido,
  enviarJson,
  esDireccionNoPublica,
  validarUrlWebhook,
} from '../../src/entregas/red-segura.js';

describe('firma de los webhooks', () => {
  const secreto = generarSecretoWebhook();
  const cuerpo = JSON.stringify({ evento: 'entrega.solicitada', idEntrega: 'x' });

  it('genera claves distintas y largas', () => {
    expect(secreto).toMatch(/^nvwh_[A-Za-z0-9_-]{43}$/);
    expect(generarSecretoWebhook()).not.toBe(secreto);
  });

  it('firma "<t>.<cuerpo>" con HMAC-SHA256 y la verificación la acepta', () => {
    const ahora = 1_790_000_000_000;
    const cabecera = cabeceraFirma(secreto, cuerpo, ahora);
    expect(cabecera).toBe(`t=1790000000,v1=${firmar(secreto, 1_790_000_000, cuerpo)}`);
    expect(cabecera).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verificarFirma(secreto, cabecera, cuerpo, { ahora })).toBe(true);
  });

  it('rechaza otro cuerpo, otra clave, una firma vieja o una cabecera rota', () => {
    const ahora = Date.now();
    const cabecera = cabeceraFirma(secreto, cuerpo, ahora);
    expect(verificarFirma(secreto, cabecera, `${cuerpo} `, { ahora })).toBe(false);
    expect(verificarFirma(generarSecretoWebhook(), cabecera, cuerpo, { ahora })).toBe(false);
    expect(verificarFirma(secreto, cabecera, cuerpo, { ahora: ahora + 301_000 })).toBe(false);
    expect(verificarFirma(secreto, undefined, cuerpo)).toBe(false);
    expect(verificarFirma(secreto, 't=abc,v1=zz', cuerpo)).toBe(false);
    const otra = cabecera.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    expect(verificarFirma(secreto, otra, cuerpo, { ahora })).toBe(false);
  });
});

describe('protección SSRF', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'no-es-una-ip',
  ])('%s no es pública', (ip) => {
    expect(esDireccionNoPublica(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s es pública',
    (ip) => {
      expect(esDireccionNoPublica(ip)).toBe(false);
    },
  );

  it.each([
    ['http://proveedor.example/nv', /https/],
    ['https://usuario:clave@proveedor.example/nv', /usuario ni contraseña/],
    ['https://127.0.0.1/nv', /privada o local/],
    ['https://[::1]/nv', /privada o local/],
    ['https://[::ffff:169.254.169.254]/nv', /privada o local/],
    ['https://169.254.169.254/latest/meta-data', /privada o local/],
    ['https://localhost:8443/nv', /nombre local/],
    ['https://api.internal/nv', /nombre local/],
    ['https://servidor/nv', /nombre local/],
    ['ftp://proveedor.example/nv', /https/],
    ['no es una url', /no es válida/],
  ])('rechaza %s', (url, mensaje) => {
    expect(() => validarUrlWebhook(url, { permitirLocal: false })).toThrow(ErrorDestinoNoPermitido);
    expect(() => validarUrlWebhook(url, { permitirLocal: false })).toThrow(mensaje);
  });

  it('acepta un https público y, solo en pruebas, direcciones locales por http', () => {
    expect(
      validarUrlWebhook('https://api.proveedor.example/nv?x=1', { permitirLocal: false }).host,
    ).toBe('api.proveedor.example');
    expect(() => validarUrlWebhook('http://127.0.0.1:9/nv', { permitirLocal: true })).not.toThrow();
    expect(() =>
      validarUrlWebhook('http://usuario:clave@127.0.0.1/nv', { permitirLocal: true }),
    ).toThrow(ErrorDestinoNoPermitido);
  });
});

// ── Con un servidor falso local ─────────────────────────────────────────────

let servidor: Server;
let base: string;
let pedidos: { ruta: string; cuerpo: string }[] = [];
let responder: (ruta: string) => {
  estado: number;
  cuerpo?: string;
  cabeceras?: Record<string, string>;
  demora?: number;
};

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let datos = '';
    req.on('data', (c: Buffer) => (datos += c.toString('utf8')));
    req.on('end', () => {
      pedidos.push({ ruta: req.url ?? '', cuerpo: datos });
      const r = responder(req.url ?? '');
      setTimeout(() => {
        res.writeHead(r.estado, { 'content-type': 'application/json', ...r.cabeceras });
        res.end(r.cuerpo ?? '{}');
      }, r.demora ?? 0);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise((ok) => servidor.close(ok));
});
beforeEach(() => {
  pedidos = [];
  responder = () => ({ estado: 200, cuerpo: '{"ok":true}' });
});

describe('envío seguro', () => {
  const enviar = (ruta: string, extra: Partial<Parameters<typeof enviarJson>[0]> = {}) =>
    enviarJson({
      url: `${base}${ruta}`,
      cuerpo: '{"evento":"ping"}',
      cabeceras: {},
      tiempoMs: 2000,
      permitirLocal: true,
      ...extra,
    });

  it('sin el permiso de pruebas nunca llega a una dirección local', async () => {
    await expect(enviar('/a', { permitirLocal: false })).rejects.toBeInstanceOf(
      ErrorDestinoNoPermitido,
    );
    await expect(
      enviarJson({
        url: base.replace('127.0.0.1', 'localhost').replace('http:', 'https:'),
        cuerpo: '{}',
        cabeceras: {},
        tiempoMs: 1000,
        permitirLocal: false,
      }),
    ).rejects.toBeInstanceOf(ErrorDestinoNoPermitido);
    expect(pedidos).toHaveLength(0);
  });

  it('envía el cuerpo tal cual y lee JSON', async () => {
    const r = await enviar('/a');
    expect(r).toMatchObject({ estado: 200, json: { ok: true } });
    expect(pedidos[0]!.cuerpo).toBe('{"evento":"ping"}');
  });

  it('no sigue redirecciones', async () => {
    responder = (ruta) =>
      ruta === '/a' ? { estado: 302, cabeceras: { location: `${base}/b` } } : { estado: 200 };
    const r = await enviar('/a');
    expect(r.estado).toBe(302);
    expect(pedidos.map((p) => p.ruta)).toEqual(['/a']);
  });

  it('corta por tiempo y por tamaño', async () => {
    responder = () => ({ estado: 200, demora: 1500 });
    await expect(enviar('/lento', { tiempoMs: 300 })).rejects.toBeInstanceOf(ErrorConexion);
    responder = () => ({ estado: 200, cuerpo: JSON.stringify({ x: 'a'.repeat(5000) }) });
    await expect(enviar('/grande', { maxBytes: 1000 })).rejects.toThrow(/demasiado grande/);
  });
});

describe('adaptador de webhook', () => {
  const clasificar = (estado: number, json: unknown = null) =>
    clasificarRespuesta({ estado, texto: '', json });

  it('clasifica las respuestas del proveedor', () => {
    expect(clasificar(200)).toBe('exito');
    expect(clasificar(204)).toBe('exito');
    expect(clasificar(409)).toBe('exito');
    expect(clasificar(422, { codigo: 'ya_existe' })).toBe('exito');
    expect(clasificar(400)).toBe('fallida');
    expect(clasificar(401)).toBe('fallida');
    expect(clasificar(302)).toBe('fallida');
    expect(clasificar(408)).toBe('reintentar');
    expect(clasificar(429)).toBe('reintentar');
    expect(clasificar(500)).toBe('reintentar');
    expect(clasificar(503)).toBe('reintentar');
  });

  const contexto = (
    secreto: string | null,
    config: Record<string, unknown> = {},
  ): ContextoEntrega => ({
    entrega: {
      id: '5b0f7c38-3f1d-4d57-9a4c-2a0f9d1e0001',
      motivo: 'alta',
      periodoInicio: new Date('2026-09-25T00:00:00Z'),
      periodoFin: null,
      referenciaExterna: null,
    } as Entrega,
    proveedor: { id: 'p' } as Proveedor,
    configuracion: leerConfiguracionProveedor({ webhookUrl: `${base}/nv`, ...config }),
    plan: { id: 'plan', nombre: 'Mensual', skuProveedor: 'SKU-1', servicio: 'NV Cine' },
    cliente: { id: 'cliente', correo: 'ana@correo.test' },
    secreto,
  });
  const adaptador = new AdaptadorWebhook({ permitirLocal: true });

  it('solo envía el correo del cliente si el proveedor lo pide', async () => {
    await adaptador.entregar(contexto('clave'));
    await adaptador.entregar(contexto('clave', { incluirCorreo: true }));
    expect(JSON.parse(pedidos[0]!.cuerpo).cliente).toEqual({ id: 'cliente' });
    expect(JSON.parse(pedidos[1]!.cuerpo).cliente).toEqual({
      id: 'cliente',
      correo: 'ana@correo.test',
    });
    expect(JSON.parse(pedidos[0]!.cuerpo).plan).toEqual({
      id: 'plan',
      sku: 'SKU-1',
      nombre: 'Mensual',
    });
  });

  it('sin clave de firma o sin URL no envía nada', async () => {
    expect((await adaptador.entregar(contexto(null))).estado).toBe('fallida');
    const sinUrl = { ...contexto('clave'), configuracion: leerConfiguracionProveedor({}) };
    expect((await adaptador.entregar(sinUrl)).mensaje).toMatch(/URL/);
    expect(pedidos).toHaveLength(0);
  });

  it('rechaza respuestas con credenciales o enlaces sin https', async () => {
    responder = () => ({ estado: 200, cuerpo: '{"codigo":"user: ana pass: 1234"}' });
    expect((await adaptador.entregar(contexto('clave'))).estado).toBe('fallida');
    responder = () => ({ estado: 200, cuerpo: '{"enlace":"http://activar.example/x"}' });
    expect((await adaptador.entregar(contexto('clave'))).estado).toBe('fallida');
    responder = () => ({
      estado: 200,
      cuerpo: '{"enlace":"https://activar.example/x","referencia":"R1"}',
    });
    expect(await adaptador.entregar(contexto('clave'))).toMatchObject({
      estado: 'entregada',
      referenciaExterna: 'R1',
      datosCliente: { enlace: 'https://activar.example/x' },
    });
  });

  it('409 o «ya existe» cuenta como entregada sin tomar datos del cuerpo', async () => {
    responder = () => ({ estado: 409, cuerpo: '{"codigo":"ya_existe","referencia":"R2"}' });
    expect(await adaptador.entregar(contexto('clave'))).toEqual({
      estado: 'entregada',
      referenciaExterna: 'R2',
    });
  });

  it('5xx y errores de red se reintentan; la revocación acepta 404', async () => {
    responder = () => ({ estado: 502 });
    expect(await adaptador.entregar(contexto('clave'))).toMatchObject({
      estado: 'pendiente',
      reintentar: true,
    });
    responder = () => ({ estado: 404 });
    expect((await adaptador.revocar(contexto('clave'))).estado).toBe('revocada');
    responder = () => ({ estado: 500 });
    expect((await adaptador.revocar(contexto('clave'))).estado).toBe('reintentar');
    expect(JSON.parse(pedidos.at(-1)!.cuerpo).evento).toBe('entrega.revocada');
  });
});

describe('datos cifrados de la entrega', () => {
  const cifrador = new Cifrador(randomBytes(32));

  it('marca qué hay sin descifrar y solo descifra con el id de la entrega', () => {
    const guardado = guardarDatos(cifrador, 'e1', { codigo: 'DEMO-XXXX-0001' })!;
    expect(guardado).toMatch(/^c\|v1\./);
    expect(guardado).not.toContain('DEMO');
    expect(contenidoGuardado(guardado)).toEqual({ tieneCodigo: true, tieneEnlace: false });
    expect(leerDatos(cifrador, 'e1', guardado)).toEqual({ codigo: 'DEMO-XXXX-0001', enlace: null });
    expect(() => leerDatos(cifrador, 'e2', guardado)).toThrow();
    const ambos = guardarDatos(cifrador, 'e3', { codigo: 'A1B2', enlace: 'https://x.example' })!;
    expect(contenidoGuardado(ambos)).toEqual({ tieneCodigo: true, tieneEnlace: true });
    expect(guardarDatos(cifrador, 'e4', {})).toBeNull();
    expect(contenidoGuardado(null)).toEqual({ tieneCodigo: false, tieneEnlace: false });
  });

  it('la huella del código no depende de guiones, espacios ni mayúsculas', () => {
    const h = (c: string) => cifrador.huella(normalizarCodigo(c), 'codigos');
    expect(h('demo-xxxx 0001')).toBe(h('DEMO-XXXX-0001'));
    expect(h('DEMO-XXXX-0001')).toMatch(/^[0-9a-f]{64}$/);
    expect(new Cifrador(randomBytes(32)).huella('DEMOXXXX0001', 'codigos')).not.toBe(
      cifrador.huella('DEMOXXXX0001', 'codigos'),
    );
  });
});
