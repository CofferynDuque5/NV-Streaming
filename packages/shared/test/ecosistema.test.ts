import { describe, expect, it } from 'vitest';
import { enlaceEcosistema } from '../src/index.js';

describe('enlaces del ecosistema NV', () => {
  it('acepta direcciones https:// y quita el ancla', () => {
    expect(enlaceEcosistema(' https://gestor.ejemplo.com ')).toBe('https://gestor.ejemplo.com');
    expect(enlaceEcosistema('https://gestor.ejemplo.com/app#panel')).toBe(
      'https://gestor.ejemplo.com/app',
    );
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    'gestor.ejemplo.com',
    'http://gestor.ejemplo.com',
    'javascript:alert(1)',
    'https://usuario:clave@gestor.ejemplo.com',
    'https://gestor.ejemplo.com/"><script>',
  ])('no muestra el enlace con %s', (valor) => {
    expect(enlaceEcosistema(valor)).toBeNull();
  });
});
