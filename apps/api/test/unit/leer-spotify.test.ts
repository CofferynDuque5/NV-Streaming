import { describe, expect, it } from 'vitest';
import {
  codigoSpotify,
  cuposDe,
  esCorreoCodigoSpotify,
  fechaAplicable,
  fechaDe,
  leerCuentaSpotify,
} from '../../src/codigos/leer-spotify.js';
import { proxySpotify, zonaSpotify } from '../../src/codigos/robot-spotify.js';

describe('correo con el código de Spotify', () => {
  it('reconoce el remitente y el asunto', () => {
    expect(
      esCorreoCodigoSpotify(
        'Spotify <no-reply@alerts.spotify.com>',
        'Tu código de inicio de sesión de Spotify',
      ),
    ).toBe(true);
    expect(
      esCorreoCodigoSpotify('Spotify <no-reply@alerts.spotify.com>', 'Your Spotify login code'),
    ).toBe(true);
    expect(esCorreoCodigoSpotify('Netflix <info@netflix.com>', 'Tu código')).toBe(false);
    expect(
      esCorreoCodigoSpotify('Spotify <no-reply@spotify.com>', 'Nuevos lanzamientos para ti'),
    ).toBe(false);
  });

  it('lee el código de 6 dígitos', () => {
    expect(
      codigoSpotify(
        'Tu código de Spotify',
        'Hola:\nIngresa este código para iniciar sesión\n482 913\nVence en 1 hora.',
      ),
    ).toBe('482913');
    expect(
      codigoSpotify('Your login code', 'Use this code to log in:\n104582\n© 2026 Spotify AB'),
    ).toBe('104582');
    expect(codigoSpotify('Tu código', 'Sin números aquí')).toBeNull();
  });
});

describe('fechas', () => {
  it('entiende formatos en español e inglés', () => {
    expect(fechaDe('Tu próxima factura es de US$ 10,99 el 5/12/26.', true)).toBe('2026-12-05');
    expect(fechaDe('Your next bill is for $16.99 on 12/5/26.', false)).toBe('2026-12-05');
    expect(fechaDe('Se renovará el 15 de diciembre de 2026', true)).toBe('2026-12-15');
    expect(fechaDe('Renews on December 15, 2026', false)).toBe('2026-12-15');
    expect(fechaDe('Próximo pago: 3 ene. 2027', true)).toBe('2027-01-03');
    expect(fechaDe('Vence 2026-12-20', true)).toBe('2026-12-20');
    // Si el primer número pasa de 12, es el día aunque el texto esté en inglés.
    expect(fechaDe('Next payment 25/12/2026', false)).toBe('2026-12-25');
    expect(fechaDe('Sin fecha', true)).toBeNull();
    expect(fechaDe('31/02/2026', true)).toBeNull();
  });
});

describe('página de la cuenta', () => {
  const familia = 'Premium Familiar\nAdministrar miembros\nMiembros (4/6)';

  it('al día, con fecha y cupos', () => {
    const l = leerCuentaSpotify(
      'Tu plan\nPremium Familiar\nTu próxima factura es de US$ 10,99 y se cobrará el 5/12/26.\nAdministrar tu plan',
      familia,
    );
    expect(l).toEqual({
      plan: 'Premium Familiar',
      situacion: 'al_dia',
      vencimiento: '2026-12-05',
      cuposUsados: 4,
      cuposTotal: 6,
    });
    expect(fechaAplicable(l)).toBe(true);
  });

  it('en inglés', () => {
    const l = leerCuentaSpotify(
      'Your plan\nPremium Family\nYour next bill is for $16.99 on 12/20/26.',
      'Premium Family\n2 spots left',
    );
    expect(l.situacion).toBe('al_dia');
    expect(l.vencimiento).toBe('2026-12-20');
    expect(l.cuposUsados).toBe(4);
    expect(l.cuposTotal).toBe(6);
  });

  it('pago fallido: no se aplica la fecha', () => {
    const l = leerCuentaSpotify(
      'Premium Familiar\nNo pudimos procesar tu pago. Actualiza tu método de pago.\nTu próxima factura: 5/12/26',
      familia,
    );
    expect(l.situacion).toBe('pago_fallido');
    expect(fechaAplicable(l)).toBe(false);
  });

  it('en pausa', () => {
    const l = leerCuentaSpotify('Premium Familiar\nTu plan está en pausa hasta el 10/01/27', '');
    expect(l.situacion).toBe('pausa');
    expect(fechaAplicable(l)).toBe(false);
  });

  it('sin Premium (caída)', () => {
    const l = leerCuentaSpotify('Tu plan\nSpotify Free\nExplora Premium', '');
    expect(l.situacion).toBe('caida');
    expect(fechaAplicable(l)).toBe(false);
  });

  it('plan cancelado: la fecha es el fin del Premium', () => {
    const l = leerCuentaSpotify(
      'Premium Family\nYour plan will be canceled on December 30, 2026.',
      '',
    );
    expect(l.situacion).toBe('al_dia');
    expect(l.vencimiento).toBe('2026-12-30');
  });

  it('sin fecha reconocible: no se aplica', () => {
    const l = leerCuentaSpotify('Premium Familiar\nAdministrar tu plan', '');
    expect(l.vencimiento).toBeNull();
    expect(fechaAplicable(l)).toBe(false);
  });
});

describe('cupos', () => {
  it('lee distintas formas', () => {
    expect(cuposDe('Miembros: 5 de 6 cuentas', 6, null)).toEqual({ usados: 5, total: 6 });
    expect(cuposDe('Quedan 3 lugares en tu plan', 6, null)).toEqual({ usados: 3, total: 6 });
    expect(cuposDe('Tu plan está completo', 6, null)).toEqual({ usados: 6, total: 6 });
    expect(cuposDe('Your plan is full', 6, null)).toEqual({ usados: 6, total: 6 });
    expect(cuposDe('Lista de miembros', 6, 3)).toEqual({ usados: 3, total: 6 });
    expect(cuposDe('Lista de miembros', 6, null)).toEqual({ usados: null, total: 6 });
  });
});

describe('proxy del robot de Spotify', () => {
  it('sin SPOTIFY_PROXY sale directo', () => {
    expect(proxySpotify({})).toBeNull();
  });
  it('IPRoyal: IP fija por cuenta y país opcional', () => {
    const p = proxySpotify(
      { SPOTIFY_PROXY: 'http://usu:cl%40ve@geo.iproyal.com:12321', SPOTIFY_PROXY_PAIS: 'VE' },
      'abc123',
    );
    expect(p).toEqual({
      server: 'http://geo.iproyal.com:12321',
      username: 'usu',
      password: 'cl@ve_country-ve_session-abc123_lifetime-30m',
    });
  });
  it('la hora del navegador sigue al país del proxy', () => {
    expect(
      zonaSpotify({ SPOTIFY_PROXY: 'http://u:p@geo.iproyal.com:1', SPOTIFY_PROXY_PAIS: 'in' }),
    ).toBe('Asia/Kolkata');
    expect(zonaSpotify({ SPOTIFY_PROXY_PAIS: 'in' })).toBe('America/Caracas');
  });
  it('respeta una sesión ya escrita y otros proveedores tal cual', () => {
    expect(proxySpotify({ SPOTIFY_PROXY: 'geo.iproyal.com:12321' }, 'x')?.server).toBe(
      'http://geo.iproyal.com:12321',
    );
    expect(
      proxySpotify({ SPOTIFY_PROXY: 'http://u:p_session-fija@geo.iproyal.com:1' }, 'x')?.password,
    ).toBe('p_session-fija');
    expect(proxySpotify({ SPOTIFY_PROXY: 'http://u:p@otro.proxy:8080' }, 'x')?.password).toBe('p');
  });
});
