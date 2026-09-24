import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, TipoActor } from '@nv/db';
import type { InfoCliente } from '../comun/contexto.js';
import { PRISMA } from '../comun/tokens.js';

export interface EntradaAuditoria {
  actorTipo?: TipoActor;
  actorId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: Prisma.InputJsonValue;
  despues?: Prisma.InputJsonValue;
  cliente?: InfoCliente;
}

type ClienteTx = Pick<PrismaClient, 'auditoria'>;

/** Escribe en el registro de auditoría (tabla de solo inserción). */
@Injectable()
export class AuditoriaService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Registra una acción. Pasa `tx` para que quede en la misma transacción que el cambio. */
  async registrar(e: EntradaAuditoria, tx: ClienteTx = this.prisma): Promise<void> {
    await tx.auditoria.create({
      data: {
        actorTipo: e.actorTipo ?? (e.actorId ? 'usuario' : 'sistema'),
        actorId: e.actorId ?? null,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId ?? null,
        ...(e.antes === undefined ? {} : { antes: e.antes }),
        ...(e.despues === undefined ? {} : { despues: e.despues }),
        ip: e.cliente?.ip ?? null,
        idPeticion: e.cliente?.idPeticion ?? null,
      },
    });
  }
}
