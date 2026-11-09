import { Inject, Injectable } from '@nestjs/common';
import type { Archivo, Medio, PrismaClient } from '@nv/db';
import {
  MEDIO_MAX_MB,
  MEDIOS_ZIP_MAX_IMAGENES,
  MEDIOS_ZIP_MAX_MB,
  type MedioSitio,
  type ResultadoZipMedios,
  urlMedio,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { leerZip, ZipInvalido } from '../comun/zip.js';
import { detectarTipo } from '../almacen/tipos-archivo.js';

/** «tarjeta_netflix-azul.jpg» → «Tarjeta netflix azul»: texto alternativo de partida. */
export function altDesdeNombre(nombre: string): string {
  const base = nombre
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Imagen del sitio';
}

const MOTIVO: Record<string, string> = {
  grande: `pesa más de ${MEDIO_MAX_MB} MB`,
  formato: 'no es JPG, PNG ni WebP',
  limite: `el ZIP trae más de ${MEDIOS_ZIP_MAX_IMAGENES} imágenes`,
};

const medioPublico = (m: Medio & { archivo: Archivo }): MedioSitio => ({
  id: m.id,
  url: urlMedio(m.id),
  textoAlternativo: m.textoAlternativo,
  tipoMime: m.archivo.tipoMime,
  tamano: m.archivo.tamano,
  nombre: m.archivo.nombreOriginal,
  creadoEn: iso(m.creadoEn)!,
});

/** Biblioteca de imágenes del sitio. Se sirven públicamente y nunca cambian. */
@Injectable()
export class MediosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<MedioSitio[]> {
    const filas = await this.prisma.medio.findMany({
      include: { archivo: true },
      orderBy: { creadoEn: 'desc' },
      take: 300,
    });
    return filas.map(medioPublico);
  }

  async subir(
    auth: ContextoAuth,
    archivo: ArchivoRecibido | null,
    textoAlternativo: string,
    cliente: InfoCliente,
  ): Promise<MedioSitio> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige una imagen.', {
        archivo: ['Elige una imagen en JPG, PNG o WebP.'],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const guardado = await this.almacen.guardarImagen(tx, archivo, auth.usuario.id, MEDIO_MAX_MB);
      const m = await tx.medio.create({
        data: { archivoId: guardado.id, textoAlternativo, subidoPorId: auth.usuario.id },
        include: { archivo: true },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'medio.subido',
          entidad: 'medio',
          entidadId: m.id,
          despues: {
            nombre: guardado.nombreOriginal,
            tipo: guardado.tipoMime,
            tamano: guardado.tamano,
            sha256: guardado.sha256,
          },
          cliente,
        },
        tx,
      );
      return medioPublico(m);
    });
  }

  /**
   * Sube todas las imágenes de un ZIP (hasta MEDIOS_ZIP_MAX_MB y MEDIOS_ZIP_MAX_IMAGENES).
   * Cada una se valida como si se subiera sola; las que no sirven se informan y se saltan.
   * El texto alternativo sale del nombre del archivo: se puede cambiar al usarla.
   */
  async subirZip(
    auth: ContextoAuth,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<ResultadoZipMedios> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige un archivo ZIP.', {
        archivo: ['Elige un archivo ZIP con imágenes JPG, PNG o WebP.'],
      });
    }
    if (archivo.buffer.length > MEDIOS_ZIP_MAX_MB * 1024 * 1024) {
      throw new ErrorApp(
        413,
        'CONTENIDO_DEMASIADO_GRANDE',
        `El ZIP no puede superar ${MEDIOS_ZIP_MAX_MB} MB.`,
      );
    }
    let zip;
    try {
      zip = leerZip(archivo.buffer, {
        maxEntradas: MEDIOS_ZIP_MAX_IMAGENES,
        maxBytesEntrada: MEDIO_MAX_MB * 1024 * 1024,
        // Imágenes ya comprimidas: el ZIP casi no las achica. Holgura para PNG.
        maxBytesTotal: MEDIOS_ZIP_MAX_MB * 4 * 1024 * 1024,
      });
    } catch (err) {
      if (err instanceof ZipInvalido) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', err.message, { archivo: [err.message] });
      }
      throw err;
    }
    const omitidas = zip.omitidas.map((o) => ({ nombre: o.nombre, motivo: MOTIVO[o.motivo]! }));
    const imagenes = zip.entradas.filter((e) => {
      const tipo = detectarTipo(e.contenido);
      if (tipo?.startsWith('image/')) return true;
      omitidas.push({ nombre: e.nombre, motivo: MOTIVO.formato! });
      return false;
    });
    if (imagenes.length === 0) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El ZIP no trae imágenes JPG, PNG ni WebP.', {
        archivo: ['El ZIP no trae imágenes JPG, PNG ni WebP.'],
      });
    }
    const subidas = await this.prisma.$transaction(
      async (tx) => {
        const creadas: MedioSitio[] = [];
        for (const img of imagenes) {
          const guardado = await this.almacen.guardarImagen(
            tx,
            { buffer: img.contenido, nombre: img.nombre },
            auth.usuario.id,
            MEDIO_MAX_MB,
          );
          const m = await tx.medio.create({
            data: {
              archivoId: guardado.id,
              textoAlternativo: altDesdeNombre(img.nombre),
              subidoPorId: auth.usuario.id,
            },
            include: { archivo: true },
          });
          creadas.push(medioPublico(m));
        }
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'medio.zip_subido',
            entidad: 'medio',
            entidadId: creadas[0]!.id,
            despues: {
              zip: archivo.nombre ?? 'imagenes.zip',
              tamano: archivo.buffer.length,
              subidas: creadas.length,
              omitidas: omitidas.length,
            },
            cliente,
          },
          tx,
        );
        return creadas;
      },
      { timeout: 60_000 },
    );
    return { subidas, omitidas };
  }

  /** Contenido de una imagen del sitio (solo archivos de la biblioteca, nunca comprobantes). */
  async contenido(id: string): Promise<{ tipoMime: string; contenido: Buffer }> {
    const m = await this.prisma.medio.findUnique({ where: { id }, include: { archivo: true } });
    if (!m || !m.archivo.tipoMime.startsWith('image/')) throw Errores.noEncontrado('La imagen');
    return { tipoMime: m.archivo.tipoMime, contenido: await this.almacen.leer(m.archivo) };
  }
}
