import { deflateRawSync } from 'node:zlib';

/** Arma un ZIP simple en memoria (método 0 o 8) para las pruebas. */
export function armarZip(archivos: { ruta: string; datos: Buffer; deflate?: boolean }[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.ruta, 'utf8');
    const datos = a.deflate ? deflateRawSync(a.datos) : a.datos;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(a.deflate ? 8 : 0, 8);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(a.deflate ? 8 : 0, 10);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(a.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(offset, 42);
    locales.push(local, nombre, datos);
    centrales.push(central, nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}
