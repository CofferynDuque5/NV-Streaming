import { Inject, Injectable } from '@nestjs/common';
import type { Archivo, Medio, PrismaClient } from '@nv/db';
import { MEDIO_MAX_MB, type MedioSitio, urlMedio } from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';

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

  /** Contenido de una imagen del sitio (solo archivos de la biblioteca, nunca comprobantes). */
  async contenido(id: string): Promise<{ tipoMime: string; contenido: Buffer }> {
    const m = await this.prisma.medio.findUnique({ where: { id }, include: { archivo: true } });
    if (!m || !m.archivo.tipoMime.startsWith('image/')) throw Errores.noEncontrado('La imagen');
    return { tipoMime: m.archivo.tipoMime, contenido: await this.almacen.leer(m.archivo) };
  }
}
