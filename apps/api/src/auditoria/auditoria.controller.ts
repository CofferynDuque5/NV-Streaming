import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma, PrismaClient } from '@nv/db';
import { listarAuditoriaSchema, type Pagina, type RegistroAuditoria } from '@nv/shared';
import type { z } from 'zod';
import { RequierePermiso } from '../comun/contexto.js';
import { DocConsulta } from '../comun/documentacion.js';
import { PRISMA } from '../comun/tokens.js';
import { validar } from '../comun/zod.pipe.js';

@ApiTags('Auditoría')
@Controller('auditoria')
@RequierePermiso('auditoria.ver')
export class AuditoriaController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  @DocConsulta(listarAuditoriaSchema)
  async listar(
    @Query(validar(listarAuditoriaSchema)) filtro: z.output<typeof listarAuditoriaSchema>,
  ): Promise<Pagina<RegistroAuditoria>> {
    const where: Prisma.AuditoriaWhereInput = {
      ...(filtro.accion ? { accion: { startsWith: filtro.accion } } : {}),
      ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
      ...(filtro.actorId ? { actorId: filtro.actorId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({
        where,
        include: { actor: { select: { id: true, nombre: true, correo: true } } },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha.toISOString(),
        actorTipo: f.actorTipo,
        actor: f.actor,
        accion: f.accion,
        entidad: f.entidad,
        entidadId: f.entidadId,
        antes: f.antes,
        despues: f.despues,
        ip: f.ip,
      })),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }
}
