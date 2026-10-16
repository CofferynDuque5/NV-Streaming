import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Cifrador, codigoRespaldo, sha256, tokenAleatorio } from '../../src/comun/cripto.js';

describe('Cifrador', () => {
  const clave = randomBytes(32);

  it('cifra y descifra con el mismo contexto', () => {
    const c = new Cifrador(clave);
    const cifrado = c.cifrar('secreto-totp', 'usuarios.totp_secreto:1');
    expect(cifrado).toMatch(/^v1\.k1\./);
    expect(cifrado).not.toContain('secreto-totp');
    expect(c.descifrar(cifrado, 'usuarios.totp_secreto:1')).toBe('secreto-totp');
  });

  it('rechaza un valor copiado a otro registro (contexto distinto)', () => {
    const c = new Cifrador(clave);
    const cifrado = c.cifrar('secreto', 'usuarios.totp_secreto:1');
    expect(() => c.descifrar(cifrado, 'usuarios.totp_secreto:2')).toThrow();
  });

  it('rechaza un valor manipulado', () => {
    const c = new Cifrador(clave);
    const partes = c.cifrar('secreto', 'x').split('.');
    partes[4] = Buffer.from('otra cosa').toString('base64url');
    expect(() => c.descifrar(partes.join('.'), 'x')).toThrow();
  });

  it('descifra con una clave anterior tras rotar', () => {
    const vieja = new Cifrador(clave, 'k1');
    const cifrado = vieja.cifrar('secreto', 'x');
    const nueva = new Cifrador(randomBytes(32), 'k2', { k1: clave });
    expect(nueva.descifrar(cifrado, 'x')).toBe('secreto');
    expect(nueva.cifrar('secreto', 'x')).toMatch(/^v1\.k2\./);
  });
});

describe('tokens y códigos', () => {
  it('genera tokens aleatorios de 256 bits en base64url', () => {
    const a = tokenAleatorio();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenAleatorio()).not.toBe(a);
  });

  it('genera códigos de respaldo legibles', () => {
    for (let i = 0; i < 50; i++) expect(codigoRespaldo()).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it('sha256 en hexadecimal', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
