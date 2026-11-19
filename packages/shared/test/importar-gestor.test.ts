import { describe, expect, it } from 'vitest';
import {
  contactoGestor,
  fechaGestor,
  importarGestorSchema,
  leerRespaldoGestor,
  resumenPlataforma,
} from '../src/importar-gestor.js';

/** Copia del Gestor con datos inventados, en el formato que descarga «Copia completa». */
export const RESPALDO_EJEMPLO = {
  version: '3.0-firebase',
  custom_icons: { plat_1: 'data:image/png;base64,AAAA' },
  db: {
    platforms: [
      { id: 'plat_1', name: 'Cine Plus', emoji: '🎬' },
      { id: 'plat_2', name: 'Música', emoji: '🎵' },
    ],
    accounts: {
      plat_1: [
        {
          id: 'a_1',
          email: 'cine1@example.com',
          password: 'Clave-1',
          expiry: '2026-11-20',
          costoCuenta: 6.5,
          numProfiles: 4,
          plan: 'Premium',
          pais: 've',
          metodoPago: 'tarjeta',
          tarjetaDigitos: '4111111111111234',
          proveedor: 'Distribuidor X',
        },
        { id: 'a_2', email: 'sin clave@example.com', password: '' },
        { id: 'a_3', email: 'CINE1@example.com', password: 'otra', numProfiles: 1 },
      ],
      plat_2: [],
    },
    clients: {
      plat_1: [
        {
          id: 'c_1',
          accountId: 'a_1',
          slotIndex: 0,
          email: 'Perfil 1',
          pin: '1234',
          nombre: 'Ana',
          apellido: 'Pérez',
          contacto: '0412-555.12.34',
          vencimientoCliente: '2026-12-01',
          precioVenta: 3,
        },
        {
          id: 'c_2',
          accountId: 'a_1',
          slotIndex: 1,
          email: 'Perfil 2',
          pin: 'NO APLICA',
          nombre: 'Sin asignar',
          contacto: '',
          vencimientoCliente: '',
        },
        {
          id: 'c_3',
          accountId: 'a_1',
          slotIndex: 2,
          email: 'Niños',
          pin: '',
          nombre: 'Luis',
          apellido: '',
          contacto: 'luis@example.com',
          vencimientoCliente: '01/10/2026',
          precioVenta: '2,5',
        },
        { id: 'c_4', accountId: 'a_borrada', nombre: 'Huérfano' },
        { id: 'c_5', nombre: 'Sin cuenta', contacto: '+573001112233' },
      ],
      plat_2: [
        {
          id: 'c_6',
          isClientAccount: true,
          email: 'musica@example.com',
          password: 'M-1',
          facturacion: '2026-11-05',
          cost: 1.99,
          nombre: 'Pedro',
          contacto: '+58 414 000 1111',
          vencimientoCliente: '2026-11-30',
          precioVenta: 2.5,
        },
      ],
    },
  },
};

describe('leerRespaldoGestor', () => {
  it('convierte plataformas, cuentas, perfiles y clientes', () => {
    const r = leerRespaldoGestor(RESPALDO_EJEMPLO);
    expect(r.plataformas.map((p) => p.nombre)).toEqual(['Cine Plus', 'Música']);
    const [cine, musica] = r.plataformas;
    // La cuenta sin correo entra con un correo provisional; la repetida, una sola vez.
    expect(cine!.cuentas.map((x) => x.usuario)).toEqual([
      'cine1@example.com',
      'a_2@sin-correo.gestor.invalid',
    ]);
    expect(cine!.clientesSueltos.map((x) => [x.origenId, x.nombre, x.motivo])).toEqual([
      ['c_4', 'Huérfano', 'cuenta_borrada'],
      ['c_5', 'Sin cuenta', 'sin_cuenta'],
    ]);
    const c = cine!.cuentas[0]!;
    expect(c).toMatchObject({
      usuario: 'cine1@example.com',
      modo: 'perfiles',
      facturaEn: '2026-11-20',
      costoUsd: '6.50',
      pais: 'VE',
      metodoPago: 'Tarjeta ···· 1234',
      proveedor: 'Distribuidor X',
    });
    expect(c.perfiles.map((p) => [p.numero, p.nombre, p.pin])).toEqual([
      [1, 'Perfil 1', '1234'],
      [2, 'Perfil 2', null],
      [3, 'Niños', null],
      [4, 'Perfil 4', null],
    ]);
    expect(c.perfiles[0]!.cliente).toEqual({
      nombre: 'Ana Pérez',
      contacto: { tipo: 'whatsapp', valor: '+584125551234' },
      contactos: [{ tipo: 'whatsapp', valor: '+584125551234' }],
      responsable: null,
      venceEn: '2026-12-01',
      precioUsd: '3.00',
    });
    expect(c.perfiles[1]!.cliente).toBeNull();
    expect(c.perfiles[2]!.cliente).toMatchObject({
      contacto: { tipo: 'correo', valor: 'luis@example.com' },
      venceEn: '2026-10-01',
      precioUsd: '2.50',
    });
    expect(musica!.cuentas[0]).toMatchObject({
      origenId: 'ind:c_6',
      modo: 'completa',
      costoUsd: '1.99',
      perfiles: [{ numero: 1, cliente: { nombre: 'Pedro', venceEn: '2026-11-30' } }],
    });
    expect(resumenPlataforma(cine!)).toEqual({
      cuentas: 2,
      perfiles: 5,
      asignados: 2,
      costoUsd: '6.50',
      ventaUsd: '5.50',
      sinPerfil: 2,
    });
  });

  it('avisa lo que cambia sin mostrar claves', () => {
    const r = leerRespaldoGestor(RESPALDO_EJEMPLO);
    expect(r.avisos).toEqual([
      'Cine Plus: una cuenta no tiene correo en el Gestor; entra con un correo provisional (…@sin-correo.gestor.invalid) y sus clientes y cupos, para que le pongas el correo real.',
      'Cine Plus: una cuenta no tiene clave en el Gestor; entra con la clave «(sin clave en el Gestor)» para que la completes.',
      'Cine Plus: un cliente no tiene cuenta asignada; entra como cliente sin perfil, con una nota de su vencimiento.',
      'Cine Plus: un cliente estaba en una cuenta que ya no existe; entra como cliente sin perfil.',
      'Cine Plus: una cuenta con un correo que ya está en otra plataforma se importa una sola vez.',
    ]);
    expect(JSON.stringify(r.avisos)).not.toMatch(/Clave-1|"otra"|M-1/);
  });

  it('Spotify y similares: Principal, miembros a su correo, vacías, caídas y sin fecha', () => {
    const r = leerRespaldoGestor({
      db: {
        platforms: [{ id: 'sp', name: 'Spotify' }],
        accounts: {
          sp: [
            {
              id: 'fam',
              email: 'familia@example.com',
              password: 'F-1',
              numProfiles: 6,
              caidaReportada: true,
            },
            { id: 'vacia', email: 'vacia@example.com', password: 'V-1', numProfiles: 6 },
          ],
        },
        clients: {
          sp: [
            {
              id: 's1',
              accountId: 'fam',
              slotIndex: 1,
              email: 'familia@example.com',
              nombre: 'Titular',
              contacto: '+584141112233',
            },
            {
              id: 's2',
              accountId: 'fam',
              slotIndex: 2,
              email: 'miembro@example.com',
              password: 'Mi-1',
              nombre: 'Rosa',
              contacto: '+584141112244',
              vencimientoCliente: '',
            },
            { id: 's3', accountId: 'fam', slotIndex: 3, email: 'Perfil 3', nombre: 'Sin asignar' },
            // Cliente «sin cuenta» con su propio correo: es una cuenta a su correo, sin clave ni fecha.
            { id: 's4', email: 'propio@example.com', nombre: 'Juan', contacto: '+584141112255' },
          ],
        },
      },
    });
    const [sp] = r.plataformas;
    expect(sp!.cuentas.map((c) => [c.usuario, c.modo, c.caida])).toEqual([
      ['familia@example.com', 'perfiles', true],
      ['vacia@example.com', 'perfiles', false],
      ['propio@example.com', 'completa', false],
    ]);
    const fam = sp!.cuentas[0]!;
    expect(fam.perfiles.map((p) => p.nombre)).toEqual([
      'Principal',
      'Miembro 1',
      'Miembro 2',
      'Miembro 3',
      'Miembro 4',
      'Miembro 5',
    ]);
    expect(fam.perfiles[0]).toMatchObject({ usuarioMiembro: null, claveMiembro: null });
    expect(fam.perfiles[1]).toMatchObject({
      usuarioMiembro: 'miembro@example.com',
      claveMiembro: 'Mi-1',
      cliente: { nombre: 'Rosa', venceEn: null },
    });
    expect(sp!.cuentas[1]!.perfiles.every((p) => p.cliente === null)).toBe(true);
    expect(sp!.cuentas[2]).toMatchObject({ clave: '(sin clave en el Gestor)', facturaEn: null });
    expect(sp!.clientesSueltos).toEqual([]);
  });

  it('Office 365 también va por unión de cupos', () => {
    const [o] = leerRespaldoGestor({
      db: {
        platforms: [{ id: 'o', name: 'Office 365' }],
        accounts: { o: [{ id: 'f', email: 'admin@example.com', password: 'O-1', numProfiles: 2 }] },
        clients: {
          o: [
            {
              id: 'o1',
              accountId: 'f',
              slotIndex: 2,
              email: 'ana@example.com',
              nombre: 'Ana',
              contacto: '+584141112233',
            },
            { id: 'o2', email: 'luis@example.com', nombre: 'Luis', contacto: '+584141112234' },
          ],
        },
      },
    }).plataformas;
    expect(o!.cuentas[0]!.perfiles.map((p) => [p.nombre, p.usuarioMiembro])).toEqual([
      ['Principal', 'ana@example.com'],
      ['Miembro 1', null],
    ]);
    expect(o!.cuentas[1]).toMatchObject({ usuario: 'luis@example.com', modo: 'completa' });
    expect(o!.clientesSueltos).toEqual([]);
  });

  it('acepta el formato viejo y rechaza lo que no es del Gestor', () => {
    const viejo = {
      plataformas: RESPALDO_EJEMPLO.db.platforms,
      cuentas: RESPALDO_EJEMPLO.db.accounts,
      clientes: RESPALDO_EJEMPLO.db.clients,
    };
    expect(leerRespaldoGestor(viejo).plataformas).toHaveLength(2);
    expect(() => leerRespaldoGestor({ hola: 1 })).toThrow(/no trae plataformas/);
  });

  it('lo leído pasa la validación del panel', () => {
    const [cine] = leerRespaldoGestor(RESPALDO_EJEMPLO).plataformas;
    const r = importarGestorSchema.safeParse({
      plataforma: { origenId: cine!.origenId, nombre: cine!.nombre },
      servicioId: '00000000-0000-4000-8000-000000000001',
      planId: '00000000-0000-4000-8000-000000000002',
      cuentas: cine!.cuentas,
    });
    expect(r.success).toBe(true);
  });
});

describe('piezas', () => {
  it('fechas, montos y contactos', () => {
    expect(fechaGestor('2026-02-30')).toBeNull();
    expect(fechaGestor('5/1/2027')).toBe('2027-01-05');
    expect(contactoGestor('00573001112233')).toEqual({ tipo: 'whatsapp', valor: '+573001112233' });
    expect(contactoGestor('04241234567', '+57')).toEqual({
      tipo: 'whatsapp',
      valor: '+574241234567',
    });
    expect(contactoGestor('@Ana_TG')).toEqual({ tipo: 'telegram', valor: 'ana_tg' });
    expect(contactoGestor('ana_tg', '+58', 'telegram')).toEqual({
      tipo: 'telegram',
      valor: 'ana_tg',
    });
    expect(contactoGestor('04145550000', '+58', 'telegram')).toEqual({
      tipo: 'telefono',
      valor: '+584145550000',
    });
    expect(contactoGestor('@ana')).toBeNull();
    expect(contactoGestor('ana_ig')).toBeNull();
    expect(contactoGestor('123')).toBeNull();
  });
});

/** «Copia para NV Streaming» del Gestor 8.4 (datos inventados). */
const COPIA_NVS = {
  formato: 'nv-gestor-a-nvstreaming',
  version: 1,
  db: {
    platforms: [{ id: 'plat_1', name: 'Cine', orden: 0 }],
    accounts: {
      plat_1: [
        {
          id: 'a_b',
          orden: 0,
          email: 'segunda@example.com',
          password: 'Clave-2',
          numProfiles: 3,
          tipoCuenta: 'perfiles',
          metodoPago: 'paypal',
          metodoPagoTexto: 'PayPal',
          plan: 'Premium',
          proveedor: 'Tienda A',
        },
        {
          id: 'a_a',
          orden: 1,
          email: 'unica@example.com',
          password: 'Clave-1',
          numProfiles: 1,
          tipoCuenta: 'completa',
          metodoPago: 'otro',
          otroMetodo: 'Binance USDT',
        },
      ],
    },
    clients: {
      plat_1: [
        {
          id: 'c_3',
          accountId: 'a_b',
          slotIndex: 7,
          ordenPerfil: 3,
          nombre: 'Sin asignar',
          pin: 'NO APLICA',
        },
        {
          id: 'c_1',
          accountId: 'a_b',
          slotIndex: 1,
          ordenPerfil: 1,
          email: 'Sala',
          pin: '1234',
          nombre: 'Ana',
          responsable: '  Revendedor   Juan ',
          contactos: [
            { tipo: 'telegram', valor: 'ana_tg' },
            { tipo: 'whatsapp', valor: '0412-555.12.34' },
            { tipo: 'correo', valor: 'Ana@Example.com' },
          ],
          vencimientoCliente: '2026-12-01',
          precioVenta: 3,
        },
        {
          id: 'c_2',
          accountId: 'a_b',
          slotIndex: null,
          ordenPerfil: 2,
          nombre: 'Luis',
          contacto: '04145550000',
          tipoContacto: 'telegram',
          vencimientoCliente: '2026-12-05',
          precioVenta: 2,
        },
        {
          id: 'c_4',
          accountId: 'a_a',
          slotIndex: 1,
          ordenPerfil: 1,
          nombre: 'Rosa',
          contacto: '@rosa_r',
        },
        {
          id: 'i_1',
          isClientAccount: true,
          ordenCuenta: 2,
          email: 'individual@example.com',
          password: 'Ind-1',
          nombre: 'Carla',
          responsable: 'Yo',
          contacto: '@carla_c',
          tipoContacto: 'telegram',
          metodoPago: 'tarjeta',
          tarjetaDigitos: '9999',
        },
      ],
    },
  },
};

describe('copia para NV Streaming', () => {
  const [cine] = leerRespaldoGestor(COPIA_NVS).plataformas;

  it('respeta el orden de cuentas y perfiles y el tipo de cuenta', () => {
    expect(cine!.cuentas.map((c) => [c.usuario, c.orden, c.modo])).toEqual([
      ['segunda@example.com', 0, 'perfiles'],
      ['unica@example.com', 1, 'completa'],
      ['individual@example.com', 2, 'completa'],
    ]);
    const [b] = cine!.cuentas;
    expect(
      b!.perfiles.map((p) => [p.numero, p.origenId, p.pin, p.cliente?.nombre ?? null]),
    ).toEqual([
      [1, 'c_1', '1234', 'Ana'],
      [2, 'c_2', null, 'Luis'],
      [3, 'c_3', null, null],
    ]);
  });

  it('lleva responsable, todos los contactos y el método de pago', () => {
    const [b, a, ind] = cine!.cuentas;
    expect(b!.perfiles[0]!.cliente).toMatchObject({
      responsable: 'Revendedor Juan',
      contacto: { tipo: 'telegram', valor: 'ana_tg' },
      contactos: [
        { tipo: 'telegram', valor: 'ana_tg' },
        { tipo: 'whatsapp', valor: '+584125551234' },
        { tipo: 'correo', valor: 'ana@example.com' },
      ],
    });
    expect(b!.perfiles[1]!.cliente!.contactos).toEqual([
      { tipo: 'telefono', valor: '+584145550000' },
    ]);
    expect(a!.perfiles[0]!.cliente!.contacto).toEqual({ tipo: 'telegram', valor: 'rosa_r' });
    expect([b!.metodoPago, a!.metodoPago, ind!.metodoPago]).toEqual([
      'PayPal',
      'Binance USDT',
      'Tarjeta ···· 9999',
    ]);
    expect(b!.plan).toBe('Premium');
    expect(b!.proveedor).toBe('Tienda A');
    expect(ind!.perfiles[0]!.cliente).toMatchObject({
      responsable: 'Yo',
      contacto: { tipo: 'telegram' },
    });
  });

  it('pasa la validación del panel', () => {
    const r = importarGestorSchema.safeParse({
      plataforma: { origenId: cine!.origenId, nombre: cine!.nombre },
      servicioId: '00000000-0000-4000-8000-000000000001',
      planId: '00000000-0000-4000-8000-000000000002',
      cuentas: cine!.cuentas,
    });
    expect(r.success).toBe(true);
  });
});
