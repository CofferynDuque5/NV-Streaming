import { describe, expect, it } from 'vitest';
import {
  cerrarCajaSchema,
  consultarCajaSchema,
  diaCajaSchema,
  tienePermiso,
} from '../src/index.js';

describe('caja diaria', () => {
  it('acepta solo días reales con formato AAAA-MM-DD', () => {
    expect(diaCajaSchema.safeParse('2026-10-24').success).toBe(true);
    expect(diaCajaSchema.safeParse('2028-02-29').success).toBe(true);
    for (const malo of ['2026-02-30', '2026-13-01', '24-10-2026', '2026-10-24T00:00:00Z', 'hoy']) {
      expect(diaCajaSchema.safeParse(malo).success).toBe(false);
    }
    expect(consultarCajaSchema.parse({})).toEqual({});
  });

  it('las notas del cierre son opcionales y con tope', () => {
    expect(cerrarCajaSchema.parse({ dia: '2026-10-24', notas: '  ok  ' }).notas).toBe('ok');
    expect(cerrarCajaSchema.safeParse({ dia: '2026-10-24', notas: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('la ven y la cierran administración y operación; ventas y clientes no', () => {
    for (const p of ['caja.ver', 'caja.cerrar'] as const) {
      expect(tienePermiso('admin', p)).toBe(true);
      expect(tienePermiso('operador', p)).toBe(true);
      expect(tienePermiso('ventas', p)).toBe(false);
      expect(tienePermiso('revendedor', p)).toBe(false);
      expect(tienePermiso('cliente', p)).toBe(false);
    }
  });
});
