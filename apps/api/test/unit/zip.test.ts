import { describe, expect, it } from 'vitest';
import { leerZip, ZipInvalido } from '../../src/comun/zip.js';
import { armarZip } from '../armar-zip.js';

const limites = { maxEntradas: 3, maxBytesEntrada: 1000, maxBytesTotal: 5000 };

describe('leerZip', () => {
  it('extrae archivos guardados y comprimidos, sin carpetas ni archivos de sistema', () => {
    const zip = armarZip([
      { ruta: 'fotos/', datos: Buffer.alloc(0) },
      { ruta: 'fotos/a.png', datos: Buffer.from('uno') },
      { ruta: 'fotos/b.jpg', datos: Buffer.alloc(800, 7), deflate: true },
      { ruta: '__MACOSX/fotos/._a.png', datos: Buffer.from('x') },
      { ruta: '.DS_Store', datos: Buffer.from('x') },
    ]);
    const r = leerZip(zip, limites);
    expect(r.entradas.map((e) => e.nombre)).toEqual(['a.png', 'b.jpg']);
    expect(r.entradas[1]!.contenido.equals(Buffer.alloc(800, 7))).toBe(true);
    expect(r.omitidas).toEqual([]);
  });

  it('salta los archivos grandes y los que pasan del límite de cantidad', () => {
    const zip = armarZip([
      { ruta: 'grande.png', datos: Buffer.alloc(2000), deflate: true },
      { ruta: '1.png', datos: Buffer.from('1') },
      { ruta: '2.png', datos: Buffer.from('2') },
      { ruta: '3.png', datos: Buffer.from('3') },
      { ruta: '4.png', datos: Buffer.from('4') },
    ]);
    const r = leerZip(zip, limites);
    expect(r.entradas.map((e) => e.nombre)).toEqual(['1.png', '2.png', '3.png']);
    expect(r.omitidas).toEqual([
      { nombre: 'grande.png', motivo: 'grande' },
      { nombre: '4.png', motivo: 'limite' },
    ]);
  });

  it('no se fía del tamaño declarado: una «bomba» se corta al pasar el límite', () => {
    const zip = armarZip([{ ruta: 'bomba.png', datos: Buffer.alloc(50_000), deflate: true }]);
    // Declara 10 bytes descomprimidos en el directorio central.
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(10, central + 24);
    const r = leerZip(zip, limites);
    expect(r.entradas).toEqual([]);
    expect(r.omitidas).toEqual([{ nombre: 'bomba.png', motivo: 'grande' }]);
  });

  it('rechaza lo que no es ZIP', () => {
    expect(() => leerZip(Buffer.from('hola'), limites)).toThrow(ZipInvalido);
  });
});
