import { describe, expect, it } from 'vitest';
import { paisDeIp } from '../../src/salud/ubicacion.js';

describe('paisDeIp', () => {
  it('ubica IPv4 públicas', () => {
    expect(paisDeIp('190.202.1.1')).toBe('VE');
    expect(paisDeIp('8.8.8.8')).toBe('US');
    expect(paisDeIp('::ffff:190.202.1.1')).toBe('VE');
  });

  it('ubica IPv6 públicas', () => {
    expect(paisDeIp('2001:4860:4860::8888')).toBe('US');
  });

  it('ignora direcciones privadas, locales o inválidas', () => {
    for (const ip of ['10.0.0.1', '192.168.1.5', '172.18.0.3', '127.0.0.1', '::1', 'fd00::1', 'hola', '', null]) {
      expect(paisDeIp(ip)).toBeNull();
    }
  });
});
