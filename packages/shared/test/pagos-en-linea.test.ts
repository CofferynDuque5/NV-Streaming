import { describe, expect, it } from 'vitest';
import {
  cobroAutomaticoSuscripcionSchema,
  INFO_PASARELA,
  iniciarPagoEnLineaSchema,
  PASARELAS,
  reembolsoSchema,
  textoAutorizacion,
  VERSION_TEXTO_AUTORIZACION,
} from '../src/index.js';

const ID = '5b0d2c1e-8f3a-4c6b-9d7e-1a2b3c4d5e6f';

describe('texto de autorización de cobro', () => {
  const texto = textoAutorizacion({ titular: 'Ana Pérez', pasarela: 'PayPal', moneda: 'USD' });

  it('nombra al titular, la pasarela y la moneda', () => {
    expect(texto).toContain('Yo, Ana Pérez, autorizo a NV Streaming');
    expect(texto).toContain('mi cuenta de PayPal, en USD');
  });

  it('explica cuándo se cobra, los avisos y cómo revocar', () => {
    expect(texto).toMatch(/día de su vencimiento/);
    expect(texto).toMatch(/reintentos avisados/);
    expect(texto).toMatch(/aviso antes y después de cada cobro/);
    expect(texto).toMatch(/revocar esta autorización[\s\S]*Mis métodos de pago/);
  });

  it('es estable (se guarda como prueba) y tiene versión con fecha', () => {
    expect(textoAutorizacion({ titular: 'Ana Pérez', pasarela: 'PayPal', moneda: 'USD' })).toBe(
      texto,
    );
    expect(VERSION_TEXTO_AUTORIZACION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pasarelas', () => {
  it('ninguna cobra en bolívares (VES sigue manual)', () => {
    for (const p of PASARELAS) expect(INFO_PASARELA[p].monedas).not.toContain('VES');
  });
});

describe('esquemas de pagos en línea', () => {
  it('guardar el método exige aceptar la autorización', () => {
    expect(iniciarPagoEnLineaSchema.parse({ metodoCobroId: ID })).toEqual({
      metodoCobroId: ID,
      guardarMetodo: false,
      aceptoAutorizacion: false,
    });
    const r = iniciarPagoEnLineaSchema.safeParse({ metodoCobroId: ID, guardarMetodo: true });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['aceptoAutorizacion']);
    expect(
      iniciarPagoEnLineaSchema.safeParse({
        metodoCobroId: ID,
        guardarMetodo: true,
        aceptoAutorizacion: true,
      }).success,
    ).toBe(true);
  });

  it('el cobro automático se activa con un método o se quita con null', () => {
    expect(cobroAutomaticoSuscripcionSchema.parse({ metodoAutorizadoId: null })).toEqual({
      metodoAutorizadoId: null,
    });
    expect(cobroAutomaticoSuscripcionSchema.safeParse({ metodoAutorizadoId: 'x' }).success).toBe(
      false,
    );
  });

  it('la devolución pide motivo y un importe con hasta 2 decimales', () => {
    expect(reembolsoSchema.safeParse({ motivo: 'Cobro duplicado' }).success).toBe(true);
    expect(reembolsoSchema.safeParse({ monto: '2.50', motivo: 'Cobro duplicado' }).success).toBe(
      true,
    );
    expect(reembolsoSchema.safeParse({ monto: '2.505', motivo: 'Cobro duplicado' }).success).toBe(
      false,
    );
    expect(reembolsoSchema.safeParse({ monto: '-1', motivo: 'Cobro duplicado' }).success).toBe(
      false,
    );
    expect(reembolsoSchema.safeParse({ motivo: 'no' }).success).toBe(false);
  });
});
