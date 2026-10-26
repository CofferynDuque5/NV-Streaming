import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type AliasServicioEntrada,
  type AliasServicioPublico,
  MAX_ALIAS_SERVICIO,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';

const SELECCION = {
  id: true,
  palabra: true,
  creadoEn: true,
  servicio: { select: { id: true, nombre: true } },
} as const;

const publico = (a: {
  id: string;
  palabra: string;
  creadoEn: Date;
  servicio: { id: string; nombre: string };
}): AliasServicioPublico => ({ ...a, creadoEn: a.creadoEn.toISOString() });

/**
 * Palabras que el lector de pedidos entiende como un servicio («plus» es
 * Spotify). El lector corre en el navegador; aquí solo se guardan las
 * palabras, para que todo el equipo use las mismas.
 */
@Injectable()
export class LectorService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async alias(): Promise<AliasServicioPublico[]> {
    const filas = await this.prisma.aliasServicio.findMany({
      select: SELECCION,
      orderBy: { palabra: 'asc' },
      take: MAX_ALIAS_SERVICIO,
    });
    return filas.map(publico);
  }

  async crear(
    auth: ContextoAuth,
    e: AliasServicioEntrada,
    cliente: InfoCliente,
  ): Promise<AliasServicioPublico> {
    const servicio = await this.prisma.servicio.findUnique({
      where: { id: e.servicioId },
      select: { id: true },
    });
    if (!servicio) throw Errores.noEncontrado('El servicio');
    if ((await this.prisma.aliasServicio.count()) >= MAX_ALIAS_SERVICIO) {
      throw new ErrorApp(409, 'DEMASIADAS_PALABRAS', 'Ya hay demasiadas palabras: borra alguna.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.aliasServicio.create({
          data: { palabra: e.palabra, servicioId: e.servicioId, creadoPorId: auth.usuario.id },
          select: SELECCION,
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'alias_servicio.creado',
            entidad: 'alias_servicio',
            entidadId: a.id,
            despues: { palabra: a.palabra, servicioId: e.servicioId },
            cliente,
          },
          tx,
        );
        return publico(a);
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(409, 'PALABRA_REPETIDA', 'Esa palabra ya está guardada.', {
          palabra: ['Esa palabra ya está guardada.'],
        });
      }
      throw err;
    }
  }

  async borrar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.aliasServicio.findUnique({ where: { id } });
      if (!a) throw Errores.noEncontrado('La palabra');
      await tx.aliasServicio.delete({ where: { id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'alias_servicio.borrado',
          entidad: 'alias_servicio',
          entidadId: id,
          antes: { palabra: a.palabra, servicioId: a.servicioId },
          cliente,
        },
        tx,
      );
    });
  }
}
