import { describe, expect, it } from 'vitest';
import {
  leerPagoBinance,
  normalizarMonto,
  revisarCorreoBinance,
  textoPlano,
} from '../../src/pagos-en-linea/binance/correo-binance.js';
import { correoBinance, resolverPruebas } from '../correo-binance-falso.js';

const opciones = { codigoAntiPhishing: 'NVSECRETO1', resolver: resolverPruebas };

describe('aviso de Binance «Pago recibido correctamente»', () => {
  it('lee remitente, monto y fecha del cuerpo (como en el correo real)', () => {
    const texto = textoPlano(
      '<table><tr><td>Fecha y hora:</td><td>2026-11-20 02:58:50(UTC)</td></tr>' +
        '<tr><td>Remitente:</td><td>Katy-2207</td></tr><tr><td>Monto:</td><td>2.5 USDT</td></tr></table>',
    );
    expect(leerPagoBinance(texto)).toEqual({
      remitente: 'Katy-2207',
      monto: '2.50',
      moneda: 'USDT',
      pagadoEn: new Date('2026-11-20T02:58:50Z'),
    });
  });

  it('normaliza montos y rechaza más de 2 decimales', () => {
    expect(normalizarMonto('2.5')).toBe('2.50');
    expect(normalizarMonto('10')).toBe('10.00');
    expect(normalizarMonto('1,234.5')).toBe('1234.50');
    expect(normalizarMonto('2.505')).toBeNull();
  });

  it('acepta un correo firmado por binance.com con el código anti-phishing', async () => {
    const r = await revisarCorreoBinance(await correoBinance(), opciones);
    expect(r.valido).toBe(true);
    if (r.valido) expect(r.pago).toMatchObject({ remitente: 'Katy-2207', monto: '2.50' });
  });

  it('descarta un correo sin firma, firmado por otro dominio o con el remitente falso', async () => {
    const sinFirma = await revisarCorreoBinance(
      await correoBinance({ firmaDominio: null }),
      opciones,
    );
    expect(sinFirma).toMatchObject({ valido: false, motivo: expect.stringMatching(/DKIM/) });
    const otroDominio = await revisarCorreoBinance(
      await correoBinance({ firmaDominio: 'binance.com.evil.test' }),
      opciones,
    );
    expect(otroDominio.valido).toBe(false);
    const falso = await revisarCorreoBinance(
      await correoBinance({ de: 'soporte@binance-pagos.test' }),
      opciones,
    );
    expect(falso).toMatchObject({ valido: false, motivo: expect.stringMatching(/remitente/) });
  });

  it('descarta si falta el código anti-phishing o el correo fue alterado', async () => {
    const sinCodigo = await revisarCorreoBinance(await correoBinance({ codigo: 'OTRO' }), opciones);
    expect(sinCodigo).toMatchObject({
      valido: false,
      motivo: expect.stringMatching(/anti-phishing/),
    });
    const alterado = (await correoBinance()).toString().replace('2.5 USDT', '250 USDT');
    expect((await revisarCorreoBinance(Buffer.from(alterado), opciones)).valido).toBe(false);
  });

  it('el mismo correo da siempre la misma huella', async () => {
    const a = await revisarCorreoBinance(
      await correoBinance({ idMensaje: 'x1@binance.com' }),
      opciones,
    );
    const b = await revisarCorreoBinance(
      await correoBinance({ idMensaje: 'x1@binance.com' }),
      opciones,
    );
    expect(a.huella).toBe(b.huella);
  });
});
