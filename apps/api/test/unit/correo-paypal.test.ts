import { describe, expect, it } from 'vitest';
import { textoPlano } from '../../src/pagos-en-linea/binance/correo-binance.js';
import {
  leerPagoPaypal,
  mismoNombre,
  referenciaEn,
  revisarCorreoPaypal,
} from '../../src/pagos-en-linea/paypal-correo/correo-paypal.js';
import { correoPaypal, resolverPruebas } from '../correo-binance-falso.js';

const opciones = { resolver: resolverPruebas };
const fecha = new Date('2026-11-14T15:00:00Z');

describe('aviso de PayPal «Ha recibido un pago»', () => {
  it('lee pagador, importe recibido (antes de comisión) e Id. como en el correo real', () => {
    const texto = textoPlano(
      '<h1>Samuel Amador le ha enviado $ 3.17 USD</h1><table>' +
        '<tr><td>Id. de transacción</td><td>Fecha de la transacción</td></tr>' +
        '<tr><td><a>2K597821EB315561L</a></td><td>14 de noviembre de 2026</td></tr>' +
        '<tr><td>Importe recibido</td><td>$ 3.17 USD</td></tr>' +
        '<tr><td>Comisión</td><td>$ 0.47 USD</td></tr><tr><td>Total</td><td>$ 2.70 USD</td></tr></table>',
    );
    expect(leerPagoPaypal(texto, fecha)).toEqual({
      pagador: 'Samuel Amador',
      monto: '3.17',
      moneda: 'USD',
      idTransaccion: '2K597821EB315561L',
      nota: null,
      pagadoEn: fecha,
    });
  });

  it('acepta un correo firmado por paypal.com y saca la referencia de NV de la nota', async () => {
    const r = await revisarCorreoPaypal(
      await correoPaypal({ nota: 'pago l 7k2m9qx4 gracias' }),
      opciones,
    );
    expect(r.valido).toBe(true);
    if (!r.valido) return;
    expect(r.pago.pagador).toBe('Samuel Amador');
    expect(r.pago.monto).toBe('3.17');
    expect(referenciaEn(r.pago.nota)).toBe('L-7K2M9QX4');
  });

  it('descarta correos sin firma de paypal.com, de otro remitente u otra moneda', async () => {
    const sinFirma = await revisarCorreoPaypal(
      await correoPaypal({ firmaDominio: null }),
      opciones,
    );
    expect(sinFirma).toMatchObject({ valido: false });
    const otraFirma = await revisarCorreoPaypal(
      await correoPaypal({ firmaDominio: 'binance.com' }),
      opciones,
    );
    expect(otraFirma).toMatchObject({ valido: false });
    const falso = await revisarCorreoPaypal(
      await correoPaypal({ de: 'service@paypa1.com', firmaDominio: null }),
      opciones,
    );
    expect(falso).toMatchObject({ valido: false, motivo: 'El remitente no es de paypal.com.' });
    const eur = await revisarCorreoPaypal(await correoPaypal({ moneda: 'EUR' }), opciones);
    expect(eur).toMatchObject({ valido: false });
    const otro = await revisarCorreoPaypal(
      await correoPaypal({ asunto: 'Su resumen mensual' }),
      opciones,
    );
    expect(otro).toMatchObject({ valido: false });
  });

  it('compara nombres sin importar tildes, mayúsculas ni espacios', () => {
    expect(mismoNombre('Samuel  Amador', 'samuel amador')).toBe(true);
    expect(mismoNombre('José Pérez', 'jose perez')).toBe(true);
    expect(mismoNombre('Samuel Amador', 'Samuel Amado')).toBe(false);
  });
});
