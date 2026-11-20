import { describe, expect, it } from 'vitest';
import { telefonoSchema } from '../src/esquemas/clientes.js';
import {
  contratoServicio,
  esTitular,
  fechaContrato,
  generarClave,
  generarPin,
  recomendarLugar,
  sirveVentaWeb,
  tipoPlataforma,
} from '../src/plataformas.js';

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

describe('contrato del Gestor', () => {
  it('arma el texto con los datos, sin perfil si va vacío y PIN «NO APLICA»', () => {
    const t = contratoServicio({
      servicio: 'Netflix',
      correo: 'cuenta@example.com',
      clave: 'Clave1',
      perfil: '',
      pin: '',
      vence: fechaContrato('2026-12-18'),
    });
    expect(t.startsWith('CONTRATO – FACTURA DE SERVICIO')).toBe(true);
    expect(t).toContain('Servicio: Netflix');
    expect(t).toContain('Correo: cuenta@example.com');
    expect(t).toContain('Contraseña: Clave1');
    expect(t).not.toContain('Perfil:');
    expect(t).toContain('NO APLICA');
    expect(t).toContain('18/12/2026');
    expect(t).toContain('CONDICIONES DE USO DEL SERVICIO');
    expect(t).toContain('Al recibir el servicio, el cliente acepta todas las condiciones.');
  });

  it('incluye perfil y PIN cuando los hay', () => {
    const t = contratoServicio({
      servicio: 'Netflix',
      correo: 'c@example.com',
      clave: 'x',
      perfil: 'Ana',
      pin: '1234',
      vence: '01/01/2027',
    });
    expect(t).toContain('Perfil: Ana');
    expect(t).toContain('1234');
  });
});

describe('cuenta recomendada', () => {
  const l = (cuentaId: string, facturaEn: string | null) => ({
    cuentaId,
    perfilId: `${cuentaId}-p`,
    facturaEn,
  });

  it('elige la que vence más tarde y dice si cubre el plazo del cliente', () => {
    const r = recomendarLugar(
      [l('a', '2026-12-01'), l('b', '2027-01-10'), l('c', '2026-11-25')],
      '2026-12-18',
    );
    expect(r?.lugar.cuentaId).toBe('b');
    expect(r?.cubre).toBe(true);
    const corta = recomendarLugar([l('a', '2026-12-01')], '2026-12-18');
    expect(corta?.cubre).toBe(false);
  });

  it('una cuenta sin fecha de pago cuenta como la que más dura; sin libres no hay recomendación', () => {
    expect(
      recomendarLugar([l('a', '2027-05-01'), l('b', null)], '2026-12-18')?.lugar.cuentaId,
    ).toBe('b');
    expect(recomendarLugar([], '2026-12-18')).toBeNull();
  });
});

describe('teléfono como en el Gestor', () => {
  it('acepta el número con código de país sin «+»', () => {
    expect(telefonoSchema.parse('584121234567')).toBe('+584121234567');
    expect(telefonoSchema.parse('+584121234567')).toBe('+584121234567');
  });
});

describe('lugares que la web entrega sola', () => {
  it('perfiles de cuentas compartidas; en familiares, la principal o una individual', () => {
    expect(sirveVentaWeb('perfiles', false, 3)).toBe(true);
    expect(sirveVentaWeb('perfiles', true, 1)).toBe(true);
    expect(sirveVentaWeb('familiar', false, 1)).toBe(true);
    expect(sirveVentaWeb('familiar', false, 2)).toBe(false);
    expect(sirveVentaWeb('familiar', true, 1)).toBe(true);
    expect(sirveVentaWeb('correo', false, 4)).toBe(true);
  });
});
