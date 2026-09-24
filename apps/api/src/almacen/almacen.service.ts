import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { Archivo, Prisma } from '@nv/db';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { detectarTipo, nombreSeguro } from './tipos-archivo.js';

export interface ArchivoRecibido {
  buffer: Buffer;
  nombre: string | undefined;
}

/**
 * Almacén de archivos en disco local. Guarda con un nombre aleatorio fuera de
 * cualquier carpeta pública; solo se sirve a través de la API con permisos.
 * Un adaptador compatible con S3 (p. ej. Cloudflare R2) puede sustituirlo.
 */
@Injectable()
export class AlmacenService {
  private readonly raiz: string;

  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {
    this.raiz = isAbsolute(entorno.ALMACEN_DIR)
      ? entorno.ALMACEN_DIR
      : resolve(process.cwd(), entorno.ALMACEN_DIR);
  }

  get tamanoMaximo(): number {
    return this.entorno.COMPROBANTE_MAX_MB * 1024 * 1024;
  }

  /** Verifica el tipo real, escribe el archivo y crea su registro dentro de la transacción. */
  async guardar(
    tx: Prisma.TransactionClient,
    archivo: ArchivoRecibido,
    subidoPorId: string,
  ): Promise<Archivo> {
    const tipo = detectarTipo(archivo.buffer);
    if (!tipo) {
      throw new ErrorApp(415, 'TIPO_NO_ADMITIDO', 'Sube el comprobante en JPG, PNG, WebP o PDF.', {
        comprobante: ['Sube el comprobante en JPG, PNG, WebP o PDF.'],
      });
    }
    if (archivo.buffer.length === 0 || archivo.buffer.length > this.tamanoMaximo) {
      throw new ErrorApp(
        413,
        'CONTENIDO_DEMASIADO_GRANDE',
        `El comprobante no puede superar ${this.entorno.COMPROBANTE_MAX_MB} MB.`,
      );
    }
    const clave = `comprobantes/${randomUUID()}`;
    await mkdir(join(this.raiz, 'comprobantes'), { recursive: true, mode: 0o700 });
    await writeFile(join(this.raiz, clave), archivo.buffer, { mode: 0o600, flag: 'wx' });
    return tx.archivo.create({
      data: {
        nombreOriginal: nombreSeguro(archivo.nombre, tipo),
        tipoMime: tipo,
        tamano: archivo.buffer.length,
        sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
        clave,
        subidoPorId,
      },
    });
  }

  async leer(archivo: Pick<Archivo, 'clave'>): Promise<Buffer> {
    if (!/^comprobantes\/[0-9a-f-]{36}$/.test(archivo.clave)) {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'El archivo no existe.');
    }
    try {
      return await readFile(join(this.raiz, archivo.clave));
    } catch {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'El archivo no existe.');
    }
  }
}
