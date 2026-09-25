import { describe, expect, it } from 'vitest';
import {
  actualizarRevendedorSchema,
  ajusteSaldoSchema,
  aprobarRevendedorSchema,
  comprarSchema,
  inicioDiaVenezuela,
  planSchema,
  precioMayoristaSchema,
  solicitudRevendedorSchema,
} from '../src/index.js';

const ID = '5b0d2c1e-8f3a-4c6b-9d7e-1a2b3c4d5e6f';
const CLAVE = 'compra-0001-abcd';

describe('solicitud de revendedor', () => {
  it('usa Venezuela por defecto y normaliza el teléfono', () => {
    const r = solicitudRevendedorSchema.parse({
      nombreComercial: ' Streaming Caracas ',
      telefono: '+58 (414) 000-0000',
      documento: '',
    });
    expect(r).toMatchObject({
      nombreComercial: 'Streaming Caracas',
      pais: 'VE',
      telefono: '+584140000000',
    });
    expect(r.documento).toBeUndefined();
  });

  it('exige el nombre comercial', () => {
    expect(solicitudRevendedorSchema.safeParse({ nombreComercial: 'x' }).success).toBe(false);
  });
});

describe('gestión de revendedores', () => {
  it('el límite diario vacío se quita y debe ser un entero positivo', () => {
    expect(aprobarRevendedorSchema.parse({ nivelId: ID, limiteDiarioCompras: '' })).toEqual({
      nivelId: ID,
      limiteDiarioCompras: null,
    });
    expect(aprobarRevendedorSchema.safeParse({ nivelId: ID, limiteDiarioCompras: 0 }).success).toBe(
      false,
    );
    expect(aprobarRevendedorSchema.parse({ nivelId: ID, limiteDiarioCompras: '5' })).toEqual({
      nivelId: ID,
      limiteDiarioCompras: 5,
    });
  });

  it('actualizar pide al menos un cambio', () => {
    expect(actualizarRevendedorSchema.safeParse({}).success).toBe(false);
    expect(actualizarRevendedorSchema.safeParse({ limiteDiarioCompras: null }).success).toBe(true);
  });

  it('el precio mayorista es positivo o null para quitarlo', () => {
    const base = { planId: ID, nivelId: ID };
    expect(precioMayoristaSchema.safeParse({ ...base, precioUsd: '0' }).success).toBe(false);
    expect(precioMayoristaSchema.parse({ ...base, precioUsd: '4,5' }).precioUsd).toBe('4.5');
    expect(precioMayoristaSchema.parse({ ...base, precioUsd: null }).precioUsd).toBeNull();
  });

  it('el costo del plan admite vacío (lo quita) y cero', () => {
    const base = {
      servicioId: ID,
      nombre: 'Mensual',
      precioUsd: '5',
      duracionCantidad: 1,
      duracionUnidad: 'mes',
    };
    expect(planSchema.parse({ ...base, costoUsd: '' }).costoUsd).toBeNull();
    expect(planSchema.parse({ ...base, costoUsd: '2,10' }).costoUsd).toBe('2.10');
    expect(planSchema.parse(base).costoUsd).toBeUndefined();
    expect(planSchema.safeParse({ ...base, costoUsd: '-1' }).success).toBe(false);
  });
});

describe('ajustes de saldo', () => {
  it('acepta importes con signo, distintos de cero y con motivo', () => {
    expect(ajusteSaldoSchema.parse({ montoUsd: '-2,50', motivo: 'Corrección' }).montoUsd).toBe(
      '-2.50',
    );
    expect(ajusteSaldoSchema.parse({ montoUsd: '+3', motivo: 'Bono' }).montoUsd).toBe('3');
    expect(ajusteSaldoSchema.safeParse({ montoUsd: '0', motivo: 'Nada' }).success).toBe(false);
    expect(ajusteSaldoSchema.safeParse({ montoUsd: '1.234', motivo: 'Bono' }).success).toBe(false);
    expect(ajusteSaldoSchema.safeParse({ montoUsd: '5' }).success).toBe(false);
  });
});

describe('compras', () => {
  it('un alta lleva un cliente de la cartera o uno nuevo, no ambos ni ninguno', () => {
    const alta = { tipo: 'alta', planId: ID, claveIdempotencia: CLAVE };
    expect(comprarSchema.safeParse(alta).success).toBe(false);
    expect(comprarSchema.safeParse({ ...alta, clienteId: ID }).success).toBe(true);
    const nuevo = comprarSchema.parse({ ...alta, clienteId: '', cliente: { nombre: 'Ana Pérez' } });
    expect(nuevo).toMatchObject({ tipo: 'alta', cliente: { nombre: 'Ana Pérez', pais: 'VE' } });
    expect(
      comprarSchema.safeParse({ ...alta, clienteId: ID, cliente: { nombre: 'Ana Pérez' } }).success,
    ).toBe(false);
  });

  it('una renovación solo necesita la suscripción', () => {
    expect(
      comprarSchema.safeParse({ tipo: 'renovacion', suscripcionId: ID, claveIdempotencia: CLAVE })
        .success,
    ).toBe(true);
    expect(comprarSchema.safeParse({ tipo: 'renovacion', claveIdempotencia: CLAVE }).success).toBe(
      false,
    );
  });

  it('la clave de idempotencia tiene un formato seguro', () => {
    const base = { tipo: 'renovacion', suscripcionId: ID };
    expect(comprarSchema.safeParse({ ...base, claveIdempotencia: 'corta' }).success).toBe(false);
    expect(
      comprarSchema.safeParse({ ...base, claveIdempotencia: 'con espacios 123' }).success,
    ).toBe(false);
    expect(
      comprarSchema.safeParse({ ...base, claveIdempotencia: crypto.randomUUID() }).success,
    ).toBe(true);
  });
});

describe('límite diario', () => {
  it('el día empieza a medianoche de Venezuela (04:00 UTC)', () => {
    expect(inicioDiaVenezuela(new Date('2026-09-24T03:59:00Z')).toISOString()).toBe(
      '2026-09-23T04:00:00.000Z',
    );
    expect(inicioDiaVenezuela(new Date('2026-09-24T04:00:00Z')).toISOString()).toBe(
      '2026-09-24T04:00:00.000Z',
    );
    expect(inicioDiaVenezuela(new Date('2026-09-24T23:30:00Z')).toISOString()).toBe(
      '2026-09-24T04:00:00.000Z',
    );
  });
});
