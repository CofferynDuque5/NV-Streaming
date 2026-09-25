import { describe, expect, it } from 'vitest';
import { describirNavegador } from '../../src/auth/presentacion.js';

describe('describirNavegador', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Chrome en Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari en iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 EdgA/140.0 Edg/140.0',
      'Edge en Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox en Linux'],
    [null, 'Dispositivo desconocido'],
    ['curl/8.0', 'Navegador'],
  ])('%s → %s', (ua, esperado) => {
    expect(describirNavegador(ua)).toBe(esperado);
  });
});
