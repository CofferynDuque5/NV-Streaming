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
    expect(cine!.cuentas).toHaveLength(1);
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
      cuentas: 1,
      perfiles: 4,
      asignados: 2,
      costoUsd: '6.50',
      ventaUsd: '5.50',
    });
  });

  it('avisa lo que no importa sin mostrar claves', () => {
    const r = leerRespaldoGestor(RESPALDO_EJEMPLO);
    expect(r.avisos).toEqual([
      'Cine Plus: una cuenta sin correo o sin clave no se importa.',
      'Cine Plus: un perfil apunta a una cuenta que ya no existe y no se importa.',
      'Cine Plus: un cliente sin cuenta asignada no se importa.',
      'Cine Plus: una cuenta repetida se importa una sola vez.',
    ]);
    expect(JSON.stringify(r.avisos)).not.toMatch(/Clave-1|otra/);
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
    expect(contactoGestor('@ana_ig')).toBeNull();
    expect(contactoGestor('123')).toBeNull();
  });
});
