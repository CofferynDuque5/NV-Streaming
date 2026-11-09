import { inflateRawSync } from 'node:zlib';

export interface EntradaZip {
  nombre: string;
  contenido: Buffer;
}

export interface LimitesZip {
  /** Máximo de archivos que se extraen (los demás se ignoran y se cuentan). */
  maxEntradas: number;
  /** Tamaño máximo descomprimido de cada archivo. */
  maxBytesEntrada: number;
  /** Tamaño máximo descomprimido de todo el ZIP (defensa contra «bombas» ZIP). */
  maxBytesTotal: number;
}

export interface ResultadoZip {
  entradas: EntradaZip[];
  /** Archivos que no se extrajeron, con el motivo (carpetas no cuentan). */
  omitidas: { nombre: string; motivo: 'grande' | 'formato' | 'limite' }[];
}

export class ZipInvalido extends Error {}

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/**
 * Lector mínimo de ZIP (sin dependencias): lee el directorio central y extrae los
 * archivos guardados (método 0) o comprimidos con deflate (método 8). Rechaza ZIP64,
 * cifrados y partidos. Nunca escribe en disco ni usa las rutas del ZIP: solo devuelve
 * el nombre base de cada archivo y su contenido en memoria, con límites estrictos.
 */
export function leerZip(zip: Buffer, limites: LimitesZip): ResultadoZip {
  // El registro final está en los últimos 22 bytes + un comentario de hasta 64 KB.
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ZipInvalido('No es un archivo ZIP válido.');
  const total = zip.readUInt16LE(fin + 10);
  const tamanoCentral = zip.readUInt32LE(fin + 12);
  const inicioCentral = zip.readUInt32LE(fin + 16);
  if (
    total === 0xffff ||
    inicioCentral === 0xffffffff ||
    inicioCentral + tamanoCentral > fin ||
    zip.readUInt16LE(fin + 4) !== 0
  ) {
    throw new ZipInvalido('Ese ZIP usa un formato que no admitimos (ZIP64 o partido).');
  }

  const resultado: ResultadoZip = { entradas: [], omitidas: [] };
  let acumulado = 0;
  let p = inicioCentral;
  for (let n = 0; n < total; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== FIRMA_CENTRAL) {
      throw new ZipInvalido('El ZIP está dañado.');
    }
    const banderas = zip.readUInt16LE(p + 8);
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const descomprimido = zip.readUInt32LE(p + 24);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const ruta = zip.toString(banderas & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (ruta.endsWith('/')) continue; // carpeta
    const nombre = ruta.split(/[\\/]/).pop() ?? '';
    // Archivos de sistema que meten macOS y Windows al comprimir.
    if (!nombre || nombre.startsWith('.') || ruta.startsWith('__MACOSX/') || nombre === 'Thumbs.db')
      continue;
    if (banderas & 0x1) throw new ZipInvalido('El ZIP tiene contraseña. Súbelo sin cifrar.');
    if (resultado.entradas.length >= limites.maxEntradas) {
      resultado.omitidas.push({ nombre, motivo: 'limite' });
      continue;
    }
    if (metodo !== 0 && metodo !== 8) {
      resultado.omitidas.push({ nombre, motivo: 'formato' });
      continue;
    }
    if (descomprimido > limites.maxBytesEntrada) {
      resultado.omitidas.push({ nombre, motivo: 'grande' });
      continue;
    }
    if (acumulado + descomprimido > limites.maxBytesTotal) {
      throw new ZipInvalido('El ZIP descomprimido es demasiado grande.');
    }

    if (local + 30 > zip.length || zip.readUInt32LE(local) !== FIRMA_LOCAL) {
      throw new ZipInvalido('El ZIP está dañado.');
    }
    const datos = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (datos + comprimido > zip.length) throw new ZipInvalido('El ZIP está incompleto.');
    const crudo = zip.subarray(datos, datos + comprimido);
    let contenido: Buffer;
    try {
      contenido =
        metodo === 0
          ? Buffer.from(crudo)
          : inflateRawSync(crudo, { maxOutputLength: limites.maxBytesEntrada });
    } catch (err) {
      // Se pasó del tamaño declarado o los datos no son deflate válidos.
      const grande = (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE';
      resultado.omitidas.push({ nombre, motivo: grande ? 'grande' : 'formato' });
      continue;
    }
    if (contenido.length !== descomprimido) throw new ZipInvalido('El ZIP está dañado.');
    acumulado += contenido.length;
    resultado.entradas.push({ nombre, contenido });
  }
  return resultado;
}
