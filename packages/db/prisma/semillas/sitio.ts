import { BLOQUES_INICIO, contenidoPaginaSchema, PAGINA_INICIO } from '@nv/shared';
import type { PrismaClient } from '../../src/index.js';

/**
 * Página de inicio y tema del editor visual (fase 2). Publica como versión 1 el
 * mismo contenido que tenía la portada fija, sin datos inventados. Idempotente.
 */
export async function sembrarSitio(prisma: PrismaClient): Promise<void> {
  const tema = await prisma.temaSitio.findUnique({ where: { id: 1 } });
  if (!tema) {
    await prisma.temaSitio.create({ data: { id: 1, paleta: 'nv' } });
    console.log('✓ tema del sitio: nv');
  }

  if (await prisma.pagina.findUnique({ where: { ruta: PAGINA_INICIO.ruta } })) {
    console.log('· la página de inicio ya existe');
    return;
  }
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'admin@nv.test' } });
  const bloques = JSON.parse(JSON.stringify(contenidoPaginaSchema.parse(BLOQUES_INICIO)));

  await prisma.$transaction(async (tx) => {
    const pagina = await tx.pagina.create({
      data: {
        ruta: PAGINA_INICIO.ruta,
        titulo: PAGINA_INICIO.titulo,
        descripcion: PAGINA_INICIO.descripcion,
        borrador: bloques,
        borradorActualizadoEn: new Date(),
        borradorPorId: admin.id,
      },
    });
    const version = await tx.versionPagina.create({
      data: {
        paginaId: pagina.id,
        numero: 1,
        titulo: pagina.titulo,
        descripcion: pagina.descripcion,
        contenido: bloques,
        nota: 'Portada inicial',
        publicadaPorId: admin.id,
      },
    });
    await tx.pagina.update({ where: { id: pagina.id }, data: { versionPublicadaId: version.id } });
    await tx.auditoria.create({
      data: {
        actorTipo: 'sistema',
        accion: 'pagina.publicada',
        entidad: 'pagina',
        entidadId: pagina.id,
        despues: { ruta: pagina.ruta, numero: 1, nota: 'Portada inicial' },
      },
    });
  });
  console.log('✓ página de inicio publicada (versión 1)');
}
