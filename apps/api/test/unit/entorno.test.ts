import { describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../src/config/entorno.js';

const base = {
  DATABASE_URL: 'postgresql://nv:nv_local_dev@localhost:5432/nv',
  WEB_ORIGEN: 'http://localhost:3000/',
  CLAVE_CIFRADO: Buffer.alloc(32, 1).toString('base64'),
};

describe('cargarEntorno', () => {
  it('aplica valores por defecto y normaliza el origen', () => {
    const e = cargarEntorno(base);
    expect(e.WEB_ORIGEN).toBe('http://localhost:3000');
    expect(e.API_PUERTO).toBe(4000);
    expect(e.CORREO_PROVEEDOR).toBe('sandbox');
    expect(e.DOCS_API_HABILITADA).toBe(true);
  });

  it('exige una clave de cifrado de 32 bytes', () => {
    expect(() => cargarEntorno({ ...base, CLAVE_CIFRADO: 'corta' })).toThrow(/CLAVE_CIFRADO/);
  });

  it('no arranca en producción con valores de desarrollo', () => {
    let mensaje = '';
    try {
      cargarEntorno({ ...base, NODE_ENV: 'production' });
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain('WEB_ORIGEN');
    expect(mensaje).toContain('DATABASE_URL');
    expect(mensaje).toContain('CORREO_PROVEEDOR');
    expect(mensaje).toContain('CORREO_REMITENTE');
  });

  it('acepta una configuración de producción completa', () => {
    const e = cargarEntorno({
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nv:Xk29-larga@db:5432/nv',
      WEB_ORIGEN: 'https://nvstreaming.com',
      CORREO_PROVEEDOR: 'smtp',
      CORREO_REMITENTE: 'NV Streaming <hola@nvstreaming.com>',
      SMTP_HOST: 'smtp.ejemplo.net',
    });
    expect(e.NODE_ENV).toBe('production');
  });

  it('WhatsApp y las fuentes de la tasa: valores por defecto y validación', () => {
    const e = cargarEntorno(base);
    expect(e.WHATSAPP_PROVEEDOR).toBe('desactivado');
    expect(e.WHATSAPP_IDIOMA).toBe('es');
    expect(e.TASA_BCV_URL).toBe('https://www.bcv.org.ve/');
    expect(e.VENCIMIENTOS_EN_API).toBe(false);
    expect(() => cargarEntorno({ ...base, TASA_JSON_URL: 'http://tasas.example/usd' })).toThrow(
      /TASA_JSON_URL/,
    );
    expect(() => cargarEntorno({ ...base, TASA_JSON_CAMPO: 'datos..usd' })).toThrow(
      /TASA_JSON_CAMPO/,
    );
    const produccion = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nv:Xk29-larga@db:5432/nv',
      WEB_ORIGEN: 'https://nvstreaming.com',
      CORREO_PROVEEDOR: 'smtp',
      CORREO_REMITENTE: 'NV Streaming <hola@nvstreaming.com>',
    };
    expect(() => cargarEntorno({ ...produccion, WHATSAPP_PROVEEDOR: 'cloud_api' })).toThrow(
      /WHATSAPP_TOKEN/,
    );
    expect(() => cargarEntorno({ ...produccion, WHATSAPP_PROVEEDOR: 'sandbox' })).toThrow(
      /WHATSAPP_PROVEEDOR/,
    );
    expect(
      cargarEntorno({
        ...produccion,
        WHATSAPP_PROVEEDOR: 'cloud_api',
        WHATSAPP_TOKEN: 'x',
        WHATSAPP_TELEFONO_ID: '123',
      }).WHATSAPP_PROVEEDOR,
    ).toBe('cloud_api');
  });
});

describe('pasarela de pruebas', () => {
  it('activa por defecto fuera de producción (también con la variable vacía)', () => {
    expect(cargarEntorno(base).PASARELA_SANDBOX_HABILITADA).toBe(true);
    expect(
      cargarEntorno({ ...base, PASARELA_SANDBOX_HABILITADA: '' }).PASARELA_SANDBOX_HABILITADA,
    ).toBe(true);
    expect(
      cargarEntorno({ ...base, PASARELA_SANDBOX_HABILITADA: 'false' }).PASARELA_SANDBOX_HABILITADA,
    ).toBe(false);
  });

  it('en producción viene desactivada y no se puede activar', () => {
    const produccion = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nv:Xk29-larga@db:5432/nv',
      WEB_ORIGEN: 'https://nvstreaming.com',
      CORREO_PROVEEDOR: 'smtp',
      CORREO_REMITENTE: 'NV Streaming <hola@nvstreaming.com>',
      SMTP_HOST: 'smtp.ejemplo.net',
    };
    expect(cargarEntorno(produccion).PASARELA_SANDBOX_HABILITADA).toBe(false);
    expect(() => cargarEntorno({ ...produccion, PASARELA_SANDBOX_HABILITADA: 'true' })).toThrow(
      /PASARELA_SANDBOX_HABILITADA/,
    );
  });

  it('API_URL_PUBLICA se normaliza a su origen', () => {
    expect(cargarEntorno(base).API_URL_PUBLICA).toBe('');
    expect(
      cargarEntorno({ ...base, API_URL_PUBLICA: 'https://api.nvstreaming.com/' }).API_URL_PUBLICA,
    ).toBe('https://api.nvstreaming.com');
  });

  it('asistente de IA: valores por defecto y reglas de producción', () => {
    const e = cargarEntorno(base);
    expect(e.OLLAMA_URL).toBe('http://127.0.0.1:11434');
    expect(e.OLLAMA_MODELO).toBe('qwen2.5:7b-instruct');
    expect(e.OLLAMA_TIEMPO_LIMITE_S).toBe(120);
    expect(e.ANTHROPIC_MODELO).toBe('');
    expect(e.ASISTENTE_SANDBOX_HABILITADO).toBe(true);
    expect(() => cargarEntorno({ ...base, ANTHROPIC_PRECIO_ENTRADA_MTOK: '3,5' })).toThrow(
      /ANTHROPIC_PRECIO_ENTRADA_MTOK/,
    );
    expect(() => cargarEntorno({ ...base, ANTHROPIC_MODELO: 'modelo con espacios' })).toThrow(
      /ANTHROPIC_MODELO/,
    );
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://nv:Xk29-larga@db:5432/nv',
      WEB_ORIGEN: 'https://nvstreaming.com',
      CORREO_PROVEEDOR: 'smtp',
      CORREO_REMITENTE: 'NV Streaming <hola@nvstreaming.com>',
    };
    expect(cargarEntorno(prod).ASISTENTE_SANDBOX_HABILITADO).toBe(false);
    expect(() => cargarEntorno({ ...prod, ASISTENTE_SANDBOX_HABILITADO: 'true' })).toThrow(
      /ASISTENTE_SANDBOX_HABILITADO/,
    );
    expect(() => cargarEntorno({ ...prod, ANTHROPIC_API_URL: 'http://127.0.0.1:9' })).toThrow(
      /ANTHROPIC_API_URL/,
    );
  });
});
