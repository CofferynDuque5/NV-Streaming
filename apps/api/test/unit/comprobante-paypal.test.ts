import { describe, expect, it } from 'vitest';
import {
  leerComprobantePaypal,
  nombraAlTitular,
} from '../../src/pagos-en-linea/paypal-correo/comprobante-paypal.js';
import { esImagenLegible } from '../../src/pagos-en-linea/paypal-correo/lector-ocr.js';

describe('captura de un pago de PayPal (texto del OCR)', () => {
  it('lee monto, moneda, ID y destinatario de la app en español', () => {
    const texto = [
      'Enviaste $12,50 USD a Ana Pérez',
      '14 nov. 2026',
      'Id. de transacción',
      '2K597821EB315561L',
    ].join('\n');
    expect(leerComprobantePaypal(texto)).toMatchObject({
      monto: '12.50',
      moneda: 'USD',
      idTransaccion: '2K597821EB315561L',
      destinatario: 'Ana Pérez',
    });
  });

  it('lee la captura en inglés y el ID suelto sin etiqueta', () => {
    const texto = ['You sent $5.00 USD to', 'tienda@example.com', '9XY12345AB678901C'].join('\n');
    expect(leerComprobantePaypal(texto)).toMatchObject({
      monto: '5.00',
      moneda: 'USD',
      idTransaccion: '9XY12345AB678901C',
      destinatario: 'tienda@example.com',
    });
  });

  it('sin datos reconocibles devuelve nulos', () => {
    expect(leerComprobantePaypal('hola mundo')).toMatchObject({
      monto: null,
      idTransaccion: null,
      destinatario: null,
    });
  });
});

describe('¿la captura nombra al titular del método?', () => {
  const instrucciones = 'Titular: Ana María Pérez\nCorreo: ana.perez@example.com';
  it('por el usuario del correo o por dos palabras del nombre (sin tildes)', () => {
    expect(nombraAlTitular('Enviaste $5.00 USD a ana.perez@example.com', instrucciones)).toBe(true);
    expect(nombraAlTitular('Enviaste $5.00 USD a ANA MARIA', instrucciones)).toBe(true);
    expect(nombraAlTitular('Enviaste $5.00 USD a Otra Persona', instrucciones)).toBe(false);
  });
  it('sin titular ni correo en las instrucciones no opina', () => {
    expect(nombraAlTitular('Enviaste $5.00 USD a X', 'Paga por PayPal.')).toBeNull();
  });
});

describe('solo se leen imágenes, por sus primeros bytes', () => {
  it('PNG y JPG sí; PDF y texto no', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const jpg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
    expect(esImagenLegible(png)).toBe(true);
    expect(esImagenLegible(jpg)).toBe(true);
    expect(esImagenLegible(Buffer.from('%PDF-1.7 xxxxxx'))).toBe(false);
    expect(esImagenLegible(Buffer.from('hola'))).toBe(false);
  });
});
