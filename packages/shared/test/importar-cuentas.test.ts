import { describe, expect, it } from 'vitest';
import {
  importarCuentasSchema,
  leerArchivoProveedor,
  leerFechaProveedor,
  MAX_FILAS_IMPORTAR,
} from '../src/index.js';

const HOY = '2026-10-26';

describe('leerFechaProveedor', () => {
  it('entiende los formatos habituales', () => {
    expect(leerFechaProveedor('vence 2026-11-05', HOY)).toBe('2026-11-05');
    expect(leerFechaProveedor('05/11/2026', HOY)).toBe('2026-11-05');
    expect(leerFechaProveedor('05-11-26', HOY)).toBe('2026-11-05');
    expect(leerFechaProveedor('5 nov 2026', HOY)).toBe('2026-11-05');
    expect(leerFechaProveedor('hasta el 5 de noviembre', HOY)).toBe('2026-11-05');
    // Al revés (mes/día) cuando el «mes» pasa de 12.
    expect(leerFechaProveedor('11/25/2026', HOY)).toBe('2026-11-25');
  });

  it('sin año toma el actual, o el siguiente si quedaría muy atrás', () => {
    expect(leerFechaProveedor('05/11', HOY)).toBe('2026-11-05');
    expect(leerFechaProveedor('10/01', HOY)).toBe('2027-01-10');
    expect(leerFechaProveedor('20/09', HOY)).toBe('2026-09-20');
  });

  it('descarta fechas que no existen', () => {
    expect(leerFechaProveedor('31/02/2026', HOY)).toBeNull();
    expect(leerFechaProveedor('sin fecha', HOY)).toBeNull();
  });
});

describe('leerArchivoProveedor', () => {
  it('lee líneas «correo:clave fecha» y «correo | clave | fecha»', () => {
    const filas = leerArchivoProveedor(
      [
        'Ana.Cine@Example.com:Secreta1 25/11/2026',
        'luis@example.com | Otra-2 | 2026-12-01',
        'mypassword@example.com mypassword123',
      ].join('\n'),
      HOY,
    );
    expect(filas).toEqual([
      {
        usuario: 'ana.cine@example.com',
        clave: 'Secreta1',
        fecha: '2026-11-25',
        linea: 1,
        veces: 1,
      },
      { usuario: 'luis@example.com', clave: 'Otra-2', fecha: '2026-12-01', linea: 2, veces: 1 },
      // «mypassword123» es la clave entera, no «123».
      {
        usuario: 'mypassword@example.com',
        clave: 'mypassword123',
        fecha: null,
        linea: 3,
        veces: 1,
      },
    ]);
  });

  it('lee bloques con títulos y junta los correos repetidos', () => {
    const filas = leerArchivoProveedor(
      [
        'Correo: pepe@example.com',
        'Contraseña: Clave-9',
        'Vence: 3 de noviembre',
        '',
        'Correo: PEPE@example.com',
        'Vence: 3 de diciembre',
      ].join('\n'),
      HOY,
    );
    expect(filas).toEqual([
      { usuario: 'pepe@example.com', clave: 'Clave-9', fecha: '2026-12-03', linea: 1, veces: 2 },
    ]);
  });

  it('usa las columnas de un CSV con títulos, también con usuarios sin «@»', () => {
    const csv = [
      'Usuario;Contraseña;Vencimiento;Notas',
      'cine_ana;"Cla;ve";05/11/2026;nada',
      'Luis@Example.com;L-1;;',
      'con espacio;x;05/11/2026;',
    ].join('\r\n');
    expect(leerArchivoProveedor(csv, HOY, 'lista.csv')).toEqual([
      { usuario: 'cine_ana', clave: 'Cla;ve', fecha: '2026-11-05', linea: 2, veces: 1 },
      { usuario: 'luis@example.com', clave: 'L-1', fecha: null, linea: 3, veces: 1 },
    ]);
  });
});

describe('importarCuentasSchema', () => {
  const base = { servicioId: '7d0f4a0e-3c3a-4a77-9b0a-0b8f7f4a3c11', perfiles: 5 };
  it('pide al menos una cuenta y respeta el máximo', () => {
    expect(importarCuentasSchema.safeParse(base).success).toBe(false);
    const fila = (i: number) => ({ usuario: `c${i}@example.com`, clave: 'x' });
    expect(importarCuentasSchema.safeParse({ ...base, nuevas: [fila(1)] }).success).toBe(true);
    expect(
      importarCuentasSchema.safeParse({
        ...base,
        nuevas: Array.from({ length: MAX_FILAS_IMPORTAR + 1 }, (_, i) => fila(i)),
      }).success,
    ).toBe(false);
  });
});
