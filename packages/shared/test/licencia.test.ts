import { describe, expect, it } from 'vitest';
import {
  type DatosLicencia,
  estadoLicencia,
  hoyEnVenezuela,
  leerDatosLicencia,
  licenciaPublica,
  partesLicencia,
} from '../src/licencia.js';

const datos: DatosLicencia = {
  v: 1,
  id: 'lic-abc123',
  negocio: 'Negocio',
  origen: 'https://panel.negocio.com',
  plan: 'Mensual',
  prueba: false,
  emitida: '2026-10-01',
  vence: '2026-10-31',
};

describe('licencia', () => {
  it('pasa de vigente a por vencer, gracia y vencida', () => {
    expect(estadoLicencia(datos, '2026-10-20')).toBe('vigente');
    expect(estadoLicencia(datos, '2026-10-24')).toBe('por_vencer');
    expect(estadoLicencia(datos, '2026-10-31')).toBe('por_vencer');
    expect(estadoLicencia(datos, '2026-11-03')).toBe('en_gracia');
    expect(estadoLicencia(datos, '2026-11-04')).toBe('vencida');
  });

  it('resume los días y la gracia', () => {
    expect(licenciaPublica(datos, 'en_gracia', '2026-11-02')).toMatchObject({
      permiteCambios: true,
      diasRestantes: -2,
      graciaHasta: '2026-11-03',
    });
    expect(licenciaPublica(null, 'falta', '2026-11-02').permiteCambios).toBe(false);
  });

  it('rechaza formatos y datos que no son de una licencia', () => {
    expect(partesLicencia('NVL2.abc.def')).toBeNull();
    expect(partesLicencia('NVL1.abc')).toBeNull();
    expect(partesLicencia('NVL1.abc.d+f')).toBeNull();
    expect(partesLicencia('NVL1.abc.def')).toMatchObject({ firmado: 'NVL1.abc', firma: 'def' });
    expect(leerDatosLicencia({ ...datos, origen: 'https://panel.negocio.com/ruta' })).toBeNull();
    expect(leerDatosLicencia({ ...datos, vence: '2026-02-30' })).toBeNull();
    expect(leerDatosLicencia(datos)).toEqual(datos);
  });

  it('usa la fecha de Venezuela', () => {
    // 02:00 UTC del 1 de noviembre todavía es 31 de octubre en Caracas (UTC-4).
    expect(hoyEnVenezuela(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10-31');
  });
});
