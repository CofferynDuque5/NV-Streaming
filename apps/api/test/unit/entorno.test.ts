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
});
