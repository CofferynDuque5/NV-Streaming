import { describe, expect, it } from 'vitest';
import {
  D,
  mensualUsd,
  precioEn,
  redondear,
  sumarDuracion,
  aUsd,
} from '../../src/dinero/dinero.js';

const plan = (precioUsd: string, fijos: { moneda: 'EUR' | 'VES'; precio: string }[] = []) => ({
  precioUsd: D(precioUsd),
  preciosFijos: fijos.map((f) => ({ moneda: f.moneda, precio: D(f.precio) })),
});

describe('dinero', () => {
  it('redondea con los decimales de cada moneda', () => {
    expect(redondear(D('20062.4851'), 'COP').toFixed(2)).toBe('20062.00');
    expect(redondear(D('20062.5'), 'COP').toFixed(2)).toBe('20063.00');
    expect(redondear(D('199.995'), 'VES').toFixed(2)).toBe('200.00');
    expect(redondear(D('0.105'), 'USD').toFixed(2)).toBe('0.11');
  });

  it('convierte desde USD sin errores de coma flotante', () => {
    // 0.1 × 3 en coma flotante da 0.30000000000000004.
    const r = precioEn(plan('0.10'), 'VES', new Map([['VES', D('3')]]));
    expect(r?.precio.toFixed(2)).toBe('0.30');
  });

  it('usa el precio fijo aunque no haya tasa, con una tasa implícita', () => {
    const r = precioEn(plan('5.00', [{ moneda: 'EUR', precio: '4.90' }]), 'EUR', new Map());
    expect(r).not.toBeNull();
    expect(r!.fijo).toBe(true);
    expect(r!.precio.toFixed(2)).toBe('4.90');
    expect(r!.tasa.toFixed(6)).toBe('0.980000');
  });

  it('devuelve null si falta la tasa y no hay precio fijo', () => {
    expect(precioEn(plan('5'), 'ARS', new Map())).toBeNull();
    expect(precioEn(plan('5'), 'USD', new Map())?.precio.toFixed(2)).toBe('5.00');
  });

  it('suma meses respetando el fin de mes', () => {
    expect(sumarDuracion(new Date('2026-01-31T12:00:00Z'), 1, 'mes').toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
    expect(sumarDuracion(new Date('2028-01-31T12:00:00Z'), 1, 'mes').toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    );
    expect(sumarDuracion(new Date('2026-11-15T00:00:00Z'), 3, 'mes').toISOString()).toBe(
      '2027-02-15T00:00:00.000Z',
    );
    expect(sumarDuracion(new Date('2026-12-30T00:00:00Z'), 7, 'dia').toISOString()).toBe(
      '2027-01-06T00:00:00.000Z',
    );
  });

  it('calcula el equivalente mensual y el total en USD', () => {
    const anual = { precioUsd: D('60'), duracionCantidad: 12, duracionUnidad: 'mes' as const };
    expect(mensualUsd(anual).toFixed(2)).toBe('5.00');
    const semanal = { precioUsd: D('1.5'), duracionCantidad: 7, duracionUnidad: 'dia' as const };
    expect(mensualUsd(semanal).toFixed(2)).toBe('6.43');
    expect(aUsd(D('227.50'), D('45.5')).toFixed(2)).toBe('5.00');
  });
});
