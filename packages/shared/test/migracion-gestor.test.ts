import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicoGestor,
  compararMigracion,
  type CredencialesMigracion,
  esMigracionGestor,
  leerRespaldoGestor,
  reconstruirMigracionGestor,
} from '../src/index.js';

// Archivos generados con la capa real del Gestor (nv-nvstreaming-850.js) sobre datos de ejemplo.
const leer = (n: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const archivo = leer('migracion-v2.json');
const cred = leer('migracion-v2.credenciales.json') as CredencialesMigracion;
const original = leer('migracion-v2.db.json');

describe('migración del Gestor v2', () => {
  it('reconoce el formato y rechaza versiones que no entiende', () => {
    expect(esMigracionGestor(archivo)).toBe(true);
    expect(esMigracionGestor({ db: {} })).toBe(false);
    expect(() =>
      esMigracionGestor({ ...archivo, manifiesto: { ...archivo.manifiesto, version: '3.0.0' } }),
    ).toThrow(/versión 3/);
    expect(() => esMigracionGestor({ manifiesto: archivo.manifiesto })).toThrow(/incompleto/);
  });

  it('las secciones en claro no llevan correos de cuentas, claves ni PIN', () => {
    const claro = JSON.stringify(archivo.secciones);
    for (const s of [
      'maria@gmail.com',
      'Secreta123',
      'Otra456',
      '0042',
      '5678',
      'jose@hotmail.com',
      'clave9',
      '4111111111111234',
    ])
      expect(claro).not.toContain(s);
  });

  it('da exactamente lo mismo que leer la copia original del Gestor', () => {
    const desdeMigracion = leerRespaldoGestor(reconstruirMigracionGestor(archivo, cred));
    const desdeOriginal = leerRespaldoGestor(original);
    expect(desdeMigracion).toEqual(desdeOriginal);
    const netflix = desdeMigracion.plataformas[0]!;
    expect(netflix.nombre).toBe('Netflix');
    expect(netflix.cuentas.map((c) => c.usuario)).toEqual(['maria@gmail.com', 'luis@gmail.com']);
    const ana = netflix.cuentas[0]!.perfiles[1]!;
    expect(ana).toMatchObject({ origenId: 'c2', nombre: 'Ana TV', pin: '0042' });
    expect(ana.cliente).toMatchObject({ responsable: 'Valeryn', precioUsd: '3.50' });
    expect(ana.cliente!.contactos.map((c) => c.tipo)).toEqual(['whatsapp', 'telegram']);
    expect(netflix.cuentas[0]!.metodoPago).toBe('Tarjeta ···· 1234');
    expect(desdeMigracion.plataformas[1]!.cuentas[0]).toMatchObject({
      usuario: 'jose@hotmail.com',
      modo: 'completa',
    });
  });

  it('lista los números escritos sin código para revisarlos', () => {
    const { numerosSupuestos } = leerRespaldoGestor(
      reconstruirMigracionGestor(archivo, cred),
      '+58',
    );
    expect(numerosSupuestos).toEqual([
      {
        plataforma: 'Netflix',
        cliente: 'Ana Pérez',
        escrito: '04141234567',
        guardado: '+584141234567',
      },
      { plataforma: 'Spotify', cliente: 'José', escrito: '04121112233', guardado: '+584121112233' },
    ]);
  });

  it('cuadra lo del Gestor, lo del archivo y lo que se importa', () => {
    const leido = leerRespaldoGestor(reconstruirMigracionGestor(archivo, cred));
    for (const fila of compararMigracion(archivo, leido)) {
      expect(fila.enArchivo, fila.concepto).toBe(fila.enGestor);
      expect(fila.seImporta, fila.concepto).toBe(fila.enGestor);
    }
  });

  it('el JSON canónico ordena las claves', () => {
    expect(canonicoGestor({ b: 1, a: [{ d: 2, c: null }], x: undefined })).toBe(
      '{"a":[{"c":null,"d":2}],"b":1}',
    );
  });
});

describe('papelera de la migración', () => {
  const base = {
    manifiesto: { ...archivo.manifiesto, conteos: { ...archivo.manifiesto.conteos, papelera: 2 } },
    credenciales: archivo.credenciales,
  };
  const cuenta = {
    id: 'pap_a',
    tipo: 'cuenta',
    _platId: 'p_spotify',
    email: 'bo***@gmail.com',
    numProfiles: 2,
    costoCuenta: 3,
    _deletedAt: '2026-10-01T10:00:00Z',
    _clientsJson: JSON.stringify([
      { id: 'h1', nombre: 'Rosa', slotIndex: 1, email: 'ro***@gmail.com' },
      { id: 'h2', nombre: 'Sin asignar', slotIndex: 2 },
    ]),
  };
  const cli = {
    id: 'pap_c',
    tipo: 'cliente',
    _platId: 'p_spotify',
    nombre: 'Luis',
    contacto: '+584141112233',
    vencimientoCliente: '2026-09-30',
    _deletedAt: '2026-10-02T10:00:00Z',
  };

  it('8.5.1: devuelve cada secreto a su ruta, también dentro de _clientsJson', () => {
    const a = {
      ...base,
      secciones: {
        ...archivo.secciones,
        plataformas: [{ id: 'p_spotify', nombre: 'Spotify', orden: 0 }],
        cuentas: [],
        perfiles: [],
        papelera: [cuenta, cli],
      },
    };
    const r = reconstruirMigracionGestor(a, {
      cuentas: {},
      perfiles: {},
      papelera: {
        pap_a: {
          email: 'borrada@gmail.com',
          password: 'B-1',
          '_clientsJson/0/email': 'rosa@gmail.com',
          '_clientsJson/0/pin': '1234',
        },
      },
    });
    const c = r.db.papelera.cuentas[0]!;
    expect(c).toMatchObject({ email: 'borrada@gmail.com', password: 'B-1' });
    expect(JSON.parse(c._clientsJson as string)[0]).toMatchObject({
      email: 'rosa@gmail.com',
      pin: '1234',
    });
    const leido = leerRespaldoGestor(r);
    const [sp] = leido.plataformas;
    expect(sp!.cuentas).toHaveLength(1);
    expect(sp!.cuentas[0]).toMatchObject({
      usuario: 'borrada@gmail.com',
      clave: 'B-1',
      papelera: { borradaEn: '2026-10-01', clientes: ['Rosa'] },
    });
    expect(sp!.cuentas[0]!.perfiles.map((p) => [p.nombre, p.pin, p.cliente])).toEqual([
      ['Principal', '1234', null],
      ['Miembro 1', null, null],
    ]);
    expect(sp!.clientesSueltos).toMatchObject([
      { nombre: 'Luis', motivo: 'papelera', borradoEn: '2026-10-02', venceEn: '2026-09-30' },
    ]);
    expect(compararMigracion(a, leido).find((f) => f.concepto === 'Papelera')).toEqual({
      concepto: 'Papelera',
      enGestor: 2,
      enArchivo: 2,
      seImporta: 2,
    });
  });

  it('8.5.0: los secretos del primer nivel venían en listas', () => {
    const a = {
      ...base,
      secciones: {
        ...archivo.secciones,
        plataformas: [{ id: 'p_spotify', nombre: 'Spotify', orden: 0 }],
        cuentas: [],
        perfiles: [],
        papelera: [{ ...cuenta, email: 'borrada@gmail.com' }],
      },
    };
    const r = reconstruirMigracionGestor(a, {
      cuentas: {},
      perfiles: {},
      papelera: { pap_a: { password: ['B-1'] } },
    });
    expect(r.db.papelera.cuentas[0]).toMatchObject({ password: 'B-1' });
  });

  it('una cuenta borrada con el correo de una activa también entra, por revisar', () => {
    const r = leerRespaldoGestor({
      db: {
        platforms: [{ id: 'n', name: 'Netflix' }],
        accounts: { n: [{ id: 'a', email: 'x@example.com', password: 'X', numProfiles: 1 }] },
        clients: { n: [] },
        papelera: {
          cuentas: [{ id: 'b', _platId: 'n', email: 'X@example.com', password: 'Y' }],
          clientes: [],
        },
      },
    });
    const cuentas = r.plataformas[0]!.cuentas;
    expect(cuentas.map((c) => c.origenId)).toEqual(['a', 'pap:b']);
    expect(cuentas.every((c) => c.correoRepetido)).toBe(true);
    expect(r.pendientes.map((p) => p.correo)).toEqual(['x@example.com']);
  });
});
