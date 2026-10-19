import { describe, expect, it } from 'vitest';
import { detectarUbicacion, monedaDePais, paisDeIdioma } from '../src/index.js';

describe('moneda según la ubicación', () => {
  it('asigna la moneda de cada país, USD a los demás y bolívares si no se sabe', () => {
    expect(monedaDePais('VE')).toBe('VES');
    expect(monedaDePais('ar')).toBe('ARS');
    expect(monedaDePais('CO')).toBe('COP');
    expect(monedaDePais('PE')).toBe('PEN');
    expect(monedaDePais('ES')).toBe('EUR');
    expect(monedaDePais('DE')).toBe('EUR');
    expect(monedaDePais('CL')).toBe('USD');
    expect(monedaDePais('EC')).toBe('USD');
    expect(monedaDePais(null)).toBe('VES');
  });

  it('lee la región del idioma del navegador', () => {
    expect(paisDeIdioma('es-VE,es;q=0.9,en;q=0.8')).toBe('VE');
    expect(paisDeIdioma('es,es-419;q=0.9,en-US;q=0.5')).toBe('US');
    expect(paisDeIdioma('es')).toBeNull();
    expect(paisDeIdioma(undefined)).toBeNull();
  });

  it('prioriza la elección de la persona, luego la conexión y luego el idioma', () => {
    const cabeceras = { 'cf-ipcountry': 'AR', 'accept-language': 'es-CO' };
    expect(detectarUbicacion(cabeceras, 'EUR')).toEqual({
      pais: 'AR',
      moneda: 'EUR',
      origen: 'eleccion',
    });
    expect(detectarUbicacion(cabeceras)).toEqual({ pais: 'AR', moneda: 'ARS', origen: 'conexion' });
    expect(detectarUbicacion({ 'cf-ipcountry': 'XX', 'accept-language': 'es-CO' })).toEqual({
      pais: 'CO',
      moneda: 'COP',
      origen: 'idioma',
    });
    expect(detectarUbicacion({}, 'no-es-moneda')).toEqual({
      pais: null,
      moneda: 'VES',
      origen: 'predeterminada',
    });
  });

  it('acepta las cabeceras de fetch (Headers)', () => {
    const h = new Headers({ 'x-vercel-ip-country': 'pe' });
    expect(detectarUbicacion(h).moneda).toBe('PEN');
  });
});
