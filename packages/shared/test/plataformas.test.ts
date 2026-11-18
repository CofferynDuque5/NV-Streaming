import { describe, expect, it } from 'vitest';
import { esTitular, generarClave, generarPin, tipoPlataforma } from '../src/plataformas.js';

describe('tipo de plataforma (como en el Gestor)', () => {
  it('decide por el nombre del servicio', () => {
    for (const n of [
      'Netflix',
      'Disney+',
      'HBO Max',
      'Prime Video',
      'Paramount+',
      'Crunchyroll',
      'ChatGPT Go',
    ]) {
      expect(tipoPlataforma(n)).toBe('perfiles');
    }
    for (const n of [
      'Spotify Premium',
      'YouTube Premium',
      'Google One',
      'Gemini Plus',
      'Office 365',
      'Deezer',
      'TIDAL',
    ]) {
      expect(tipoPlataforma(n)).toBe('familiar');
    }
    expect(tipoPlataforma('Canva Pro')).toBe('correo');
    expect(esTitular('familiar', 1)).toBe(true);
    expect(esTitular('familiar', 2)).toBe(false);
    expect(esTitular('perfiles', 1)).toBe(false);
  });

  it('genera claves y PIN legibles', () => {
    expect(generarClave()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
    expect(generarPin()).toMatch(/^\d{4}$/);
  });
});
