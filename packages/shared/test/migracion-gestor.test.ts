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
