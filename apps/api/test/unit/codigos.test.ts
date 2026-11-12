import { describe, expect, it } from 'vitest';
import {
  codigoDe,
  coincideAsunto,
  enlaceUtil,
  enlacesDe,
  leerCorreo,
  textoDeHtml,
} from '../../src/codigos/extraer.js';
import { esDireccionInterna } from '../../src/codigos/lector-imap.js';

describe('lectura de códigos en correos', () => {
  it('toma el código del asunto cuando viene ahí', () => {
    expect(codigoDe('4821 es tu código de Netflix', 'Hola')).toBe('4821');
    expect(codigoDe('Tu código de acceso: 908172', '')).toBe('908172');
  });

  it('busca en el cuerpo cerca de «código» e ignora años, precios y pedidos', () => {
    const texto = [
      'Hola, María',
      'Pedido #55821 del 2026',
      'Total $1299',
      'Ingresa este código para iniciar sesión:',
      '7351',
      'El código vence en 15 minutos.',
    ].join('\n');
    expect(codigoDe('Tu código de inicio de sesión', texto)).toBe('7351');
    expect(codigoDe('Bienvenido', 'Gracias por tu compra de 2026.\nPedido 99812')).toBeNull();
    expect(codigoDe('Hola', 'Tu código de verificación es 482 913')).toBe('482913');
  });

  it('elige el enlace del Hogar o de verificación y nunca uno de cambio de clave', () => {
    const html = `
      <a href="https://www.netflix.com/password?nftoken=abc">Cambiar contraseña</a>
      <a href="https://www.netflix.com/account/update-primary-location?nftoken=xyz&amp;g=1">Sí, la envié yo</a>
      <a href="https://help.netflix.com/es">Ayuda</a>`;
    const enlaces = enlacesDe(html, '');
    expect(enlaceUtil(enlaces)).toEqual({
      tipo: 'hogar',
      url: 'https://www.netflix.com/account/update-primary-location?nftoken=xyz&g=1',
    });
    expect(enlaceUtil(['https://www.netflix.com/password?nftoken=abc'])).toBeNull();
    expect(enlaceUtil(['http://inseguro.com/verify'])).toBeNull();
  });

  it('convierte el HTML en texto y arma el extracto sin enlaces', () => {
    const html =
      '<html><head><style>p{}</style></head><body><p>Tu código</p><p><b>1234</b></p><a href="https://x.com/verify?t=1">Verificar</a></body></html>';
    expect(textoDeHtml(html)).toContain('Tu código\n1234');
    const r = leerCorreo('Código de acceso', null, html);
    expect(r.codigo).toBe('1234');
    expect(r.enlace).toEqual({ tipo: 'verificar', url: 'https://x.com/verify?t=1' });
    expect(r.extracto).not.toContain('https://');
  });

  it('compara asuntos sin tildes ni mayúsculas', () => {
    expect(
      coincideAsunto('Netflix: Tu CÓDIGO de acceso temporal', ['codigo de acceso temporal']),
    ).toBe(true);
    expect(coincideAsunto('Restablece tu contraseña', ['código'])).toBe(false);
  });

  it('no deja apuntar un buzón a la red interna', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.10',
      '172.20.0.1',
      '169.254.1.1',
      '::1',
      '::ffff:10.0.0.1',
      'fd00::1',
    ]) {
      expect(esDireccionInterna(ip)).toBe(true);
    }
    for (const ip of ['142.250.1.108', '8.8.8.8', '2607:f8b0::1']) {
      expect(esDireccionInterna(ip)).toBe(false);
    }
  });
});
