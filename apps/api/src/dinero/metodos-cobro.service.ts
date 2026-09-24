import { Inject, Injectable } from '@nestjs/common';
import type { MetodoCobro, Moneda, PrismaClient } from '@nv/db';
import type { MetodoCobroEntrada, MetodoCobroPublico } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

export const metodoPublico = (m: MetodoCobro): MetodoCobroPublico => ({
  id: m.id,
  nombre: m.nombre,
  moneda: m.moneda,
  instrucciones: m.instrucciones,
  requiereReferencia: m.requiereReferencia,
  activo: m.activo,
  orden: m.orden,
});

@Injectable()
export class MetodosCobroService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async listar(
    filtro: { moneda?: Moneda; soloActivos?: boolean } = {},
  ): Promise<MetodoCobroPublico[]> {
    const filas = await this.prisma.metodoCobro.findMany({
      where: {
        ...(filtro.moneda ? { moneda: filtro.moneda } : {}),
        ...(filtro.soloActivos ? { activo: true } : {}),
      },
      orderBy: [{ moneda: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
    });
    return filas.map(metodoPublico);
  }

  async crear(
    auth: ContextoAuth,
    entrada: MetodoCobroEntrada,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.metodoCobro.create({ data: entrada });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.creado',
          entidad: 'metodo_cobro',
          entidadId: m.id,
          despues: metodoPublico(m) as object,
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    entrada: Partial<MetodoCobroEntrada>,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.metodoCobro.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El método de cobro');
      const m = await tx.metodoCobro.update({ where: { id }, data: entrada });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.actualizado',
          entidad: 'metodo_cobro',
          entidadId: id,
          antes: metodoPublico(antes) as object,
          despues: metodoPublico(m) as object,
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }
}
