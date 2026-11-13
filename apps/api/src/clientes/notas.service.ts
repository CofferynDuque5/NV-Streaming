import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  CrearNotaEntrada,
  EditarNotaEntrada,
  ListarNotasEntrada,
  NotaPublica,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';

export const INCLUIR_NOTA = {
  autor: { select: { id: true, nombre: true } },
  cliente: { select: { id: true, nombre: true } },
} as const satisfies Prisma.NotaInternaInclude;

type FilaNota = Prisma.NotaInternaGetPayload<{ include: typeof INCLUIR_NOTA }>;

export function notaPublica(n: FilaNota): NotaPublica {
  return {
    id: n.id,
    texto: n.texto,
    tipo: n.tipo,
    cliente: n.cliente,
    autor: n.autor,
    avisarEn: iso(n.avisarEn),
    diaPago: n.diaPago,
    hechaEn: iso(n.hechaEn),
    creadoEn: iso(n.creadoEn)!,
  };
}

const MAX_NOTAS = 300;

/**
 * Notas y pendientes del equipo (la sección «Notas» del Gestor): de un cliente o
 * generales, con tipo, aviso a una fecha y hora, y marca de hecha. Ventas solo
 * ve las de su cartera y las generales.
 */
@Injectable()
export class NotasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private alcance(auth: ContextoAuth): Prisma.NotaInternaWhereInput {
    const clientes = alcanceClientes(auth);
    // Equipo completo: todas. Si no, las generales y las de los clientes a su alcance.
    if (Object.keys(clientes).length === 0) return {};
    return { OR: [{ clienteId: null }, { cliente: { is: clientes } }] };
  }

  async listar(auth: ContextoAuth, f: ListarNotasEntrada): Promise<NotaPublica[]> {
    const pendientes = f.estado === 'pendientes';
    const filas = await this.prisma.notaInterna.findMany({
      where: {
        AND: [
          this.alcance(auth),
          { hechaEn: pendientes ? null : { not: null } },
          f.clienteId ? { clienteId: f.clienteId } : {},
        ],
      },
      include: INCLUIR_NOTA,
      orderBy: pendientes
        ? [{ avisarEn: { sort: 'asc', nulls: 'last' } }, { creadoEn: 'desc' }]
        : [{ hechaEn: 'desc' }],
      take: MAX_NOTAS,
    });
    return filas.map(notaPublica);
  }

  /** Pendientes cuyo aviso ya llegó. */
  porAvisar(auth: ContextoAuth, ahora = new Date()) {
    return this.prisma.notaInterna.count({
      where: { AND: [this.alcance(auth), { hechaEn: null, avisarEn: { lte: ahora } }] },
    });
  }

  async crear(auth: ContextoAuth, e: CrearNotaEntrada, cliente: InfoCliente): Promise<NotaPublica> {
    return this.prisma.$transaction(async (tx) => {
      if (e.clienteId) {
        const c = await tx.cliente.findFirst({
          where: { AND: [{ id: e.clienteId }, alcanceClientes(auth)] },
          select: { id: true },
        });
        if (!c) throw Errores.noEncontrado('El cliente');
      }
      const n = await tx.notaInterna.create({
        data: {
          clienteId: e.clienteId ?? null,
          autorId: auth.usuario.id,
          tipo: e.tipo,
          texto: e.texto,
          avisarEn: e.avisarEn ? new Date(e.avisarEn) : null,
          diaPago: e.tipo === 'paga_dia' ? (e.diaPago ?? null) : null,
        },
        include: INCLUIR_NOTA,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nota.creada',
          entidad: 'nota',
          entidadId: n.id,
          despues: { tipo: n.tipo, clienteId: n.clienteId, avisarEn: iso(n.avisarEn) },
          cliente,
        },
        tx,
      );
      return notaPublica(n);
    });
  }

  private async exigir(auth: ContextoAuth, id: string, tx: Prisma.TransactionClient) {
    const n = await tx.notaInterna.findFirst({ where: { AND: [{ id }, this.alcance(auth)] } });
    if (!n) throw Errores.noEncontrado('La nota');
    return n;
  }

  async editar(
    auth: ContextoAuth,
    id: string,
    e: EditarNotaEntrada,
    cliente: InfoCliente,
  ): Promise<NotaPublica> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await this.exigir(auth, id, tx);
      const tipo = e.tipo ?? antes.tipo;
      const diaPago = e.diaPago !== undefined ? e.diaPago : antes.diaPago;
      if (tipo === 'paga_dia' && !diaPago) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Indica el día de pago (1 a 31).', {
          diaPago: ['Indica el día de pago (1 a 31).'],
        });
      }
      const n = await tx.notaInterna.update({
        where: { id },
        data: {
          ...(e.texto !== undefined ? { texto: e.texto } : {}),
          tipo,
          diaPago: tipo === 'paga_dia' ? diaPago : null,
          ...(e.avisarEn !== undefined
            ? { avisarEn: e.avisarEn ? new Date(e.avisarEn) : null }
            : {}),
          ...(e.hecha !== undefined
            ? { hechaEn: e.hecha ? (antes.hechaEn ?? new Date()) : null }
            : {}),
        },
        include: INCLUIR_NOTA,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion:
            e.hecha === true ? 'nota.hecha' : e.hecha === false ? 'nota.reabierta' : 'nota.editada',
          entidad: 'nota',
          entidadId: id,
          antes: { tipo: antes.tipo, hecha: !!antes.hechaEn },
          despues: { tipo: n.tipo, hecha: !!n.hechaEn },
          cliente,
        },
        tx,
      );
      return notaPublica(n);
    });
  }

  async borrar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const n = await this.exigir(auth, id, tx);
      await tx.notaInterna.delete({ where: { id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nota.borrada',
          entidad: 'nota',
          entidadId: id,
          antes: { tipo: n.tipo, clienteId: n.clienteId },
          cliente,
        },
        tx,
      );
    });
  }
}
