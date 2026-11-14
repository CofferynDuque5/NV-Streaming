import { spawn } from 'node:child_process';

/** Tipos de audio que se aceptan para una nota de voz (por su contenido, no por el nombre). */
export function esAudio(contenido: Buffer): boolean {
  const ascii = (desde: number, largo: number) =>
    contenido.subarray(desde, desde + largo).toString('latin1');
  return (
    ascii(0, 4) === 'OggS' ||
    contenido.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || // WebM (Chrome)
    ascii(4, 4) === 'ftyp' || // MP4 / M4A (Safari)
    ascii(0, 3) === 'ID3' ||
    (contenido[0] === 0xff && ((contenido[1] ?? 0) & 0xe0) === 0xe0) || // MP3
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE')
  );
}

/**
 * Convierte un audio grabado en el navegador a OGG/Opus, el formato de las notas
 * de voz de WhatsApp (si no, en el teléfono no se reproduce como nota de voz).
 * Usa ffmpeg del servidor; si ya es OGG se envía tal cual.
 */
export async function aNotaDeVoz(contenido: Buffer): Promise<Buffer> {
  if (contenido.subarray(0, 4).toString('latin1') === 'OggS') return contenido;
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-f',
        'ogg',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const salida: Buffer[] = [];
    let errores = '';
    const limite = setTimeout(() => proceso.kill('SIGKILL'), 30_000);
    proceso.stdout.on('data', (d: Buffer) => salida.push(d));
    proceso.stderr.on('data', (d: Buffer) => {
      errores = (errores + d.toString()).slice(-300);
    });
    proceso.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(limite);
      rechazar(
        new Error(
          e.code === 'ENOENT'
            ? 'Falta ffmpeg en el servidor para convertir la nota de voz.'
            : 'No se pudo convertir la nota de voz.',
        ),
      );
    });
    proceso.on('close', (codigo) => {
      clearTimeout(limite);
      if (codigo === 0 && salida.length) resolver(Buffer.concat(salida));
      else rechazar(new Error(`No se pudo convertir la nota de voz. ${errores}`.trim()));
    });
    proceso.stdin.on('error', () => undefined);
    proceso.stdin.end(contenido);
  });
}
