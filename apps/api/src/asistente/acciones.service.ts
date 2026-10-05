import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AccionPropuesta, Prisma, PrismaClient } from '@nv/db';
import {
  type AccionPropuestaPublica,
  type EstadoAccionPropuesta,
  HERRAMIENTAS,
  MINUTOS_VIGENCIA_ACCION,
  type NombreHerramienta,
  type Pagina,
  type Permiso,
  tienePermiso,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import { HerramientasAsistenteService } from './herramientas/herramientas.service.js';

const POR_PAGINA = 20;
const LIMITE_DECISIONES = { maximo: 30, ventanaSegundos: 60 };
/** Una ejecución reclamada que no terminó en este tiempo se da por interrumpida. */
const MINUTOS_EJECUCION_INTERRUMPIDA = 10;

const INCLUIR = {
  solicitadaPor: { select: { id: true, nombre: true } },
  decididaPor: { select: { id: true, nombre: true } },
} as const;

type AccionCompleta = AccionPropuesta & {
  solicitadaPor: { id: string; nombre: string };
  decididaPor: { id: string; nombre: string } | null;
};

export function accionPublica(a: AccionCompleta): AccionPropuestaPublica {
  const def = HERRAMIENTAS[a.herramienta as NombreHerramienta];
  return {
    id: a.id,
    conversacionId: a.conversacionId,
    herramienta: a.herramienta as NombreHerramienta,
    etiqueta: def?.etiqueta ?? a.herramienta,
    resumen: a.resumen,
    parametros:
      a.parametros && typeof a.parametros === 'object' && !Array.isArray(a.parametros)
        ? (a.parametros as Record<string, unknown>)
        : {},
    estado: a.estado,
    solicitadaPor: a.solicitadaPor,
    decididaPor: a.decididaPor,
    decididaEn: iso(a.decididaEn),
    expiraEn: iso(a.expiraEn)!,
    resultado: a.resultado,
    error: a.error ?? (a.estado === 'rechazada' ? a.motivoRechazo : null),
    creadaEn: iso(a.creadaEn)!,
  };
}

/**
 * Acciones propuestas por el asistente. Proponer no cambia nada; ejecutar
 * exige que una persona con el permiso de la herramienta la confirme (hoy: quien
 * la pidió o administración). La ejecución usa la autenticación de quien confirma
 * y se reclama con un bloqueo de fila, así que una doble confirmación ejecuta una vez.
 */
@Injectable()
export class AccionesAsistenteService {
  private readonly logger = new Logger('Asistente');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(HerramientasAsistenteService)
    private readonly herramientas: HerramientasAsistenteService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  /** Crea la propuesta y la audita con el actor "IA" (en nombre de quien preguntó). */
  async crear(e: {
    conversacionId: string;
    auth: ContextoAuth;
    herramienta: NombreHerramienta;
    parametros: Prisma.InputJsonObject;
    resumen: string;
    cliente: InfoCliente;
  }): Promise<AccionPropuesta> {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.accionPropuesta.create({
        data: {
          conversacionId: e.conversacionId,
          solicitadaPorId: e.auth.usuario.id,
          herramienta: e.herramienta,
          permiso: HERRAMIENTAS[e.herramienta].permiso,
          parametros: e.parametros,
          resumen: e.resumen.slice(0, 500),
          expiraEn: new Date(Date.now() + MINUTOS_VIGENCIA_ACCION * 60_000),
        },
      });
      await this.auditoria.registrar(
        {
          actorTipo: 'ia',
          actorId: e.auth.usuario.id,
          accion: 'asistente.accion_propuesta',
          entidad: 'accion_propuesta',
          entidadId: a.id,
          despues: {
            herramienta: e.herramienta,
            resumen: a.resumen,
            conversacionId: e.conversacionId,
          },
          cliente: e.cliente,
        },
        tx,
      );
      return a;
    });
  }

  /**
   * Barrido perezoso: las propuestas vencidas pasan a "expirada" y las
   * ejecuciones reclamadas que nunca terminaron, a "fallida".
   */
  async expirarVencidas(): Promise<void> {
    const ahora = new Date();
    await this.prisma.accionPropuesta.updateMany({
      where: { estado: 'propuesta', decididaEn: null, expiraEn: { lte: ahora } },
      data: { estado: 'expirada' },
    });
    await this.prisma.accionPropuesta.updateMany({
      where: {
        estado: 'propuesta',
        decididaEn: { lte: new Date(ahora.getTime() - MINUTOS_EJECUCION_INTERRUMPIDA * 60_000) },
      },
      data: {
        estado: 'fallida',
        error: 'La ejecución se interrumpió: revisa si se aplicó antes de pedirla de nuevo.',
      },
    });
  }

  async listar(
    auth: ContextoAuth,
    filtro: { estado?: EstadoAccionPropuesta | undefined; pagina: number },
  ): Promise<Pagina<AccionPropuestaPublica>> {
    await this.expirarVencidas();
    const todas = tienePermiso(auth.usuario.rol, 'asistente.configurar');
    const where: Prisma.AccionPropuestaWhereInput = {
      ...(todas ? {} : { solicitadaPorId: auth.usuario.id }),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.accionPropuesta.count({ where }),
      this.prisma.accionPropuesta.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ creadaEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    return {
      elementos: filas.map(accionPublica),
      total,
      pagina: filtro.pagina,
      porPagina: POR_PAGINA,
    };
  }

  async decidir(
    auth: ContextoAuth,
    id: string,
    entrada: { confirmar: boolean; motivo?: string | undefined },
    cliente: InfoCliente,
  ): Promise<AccionPropuestaPublica> {
    await this.limites.consumir(`asistente:decision:${auth.usuario.id}`, LIMITE_DECISIONES);
    await this.expirarVencidas();
    const accion = await this.prisma.accionPropuesta.findUnique({ where: { id } });
    const esAdmin = tienePermiso(auth.usuario.rol, 'asistente.configurar');
    if (!accion || (accion.solicitadaPorId !== auth.usuario.id && !esAdmin)) {
      throw Errores.noEncontrado('La acción');
    }
    const herramienta = accion.herramienta as NombreHerramienta;
    if (entrada.confirmar && !tienePermiso(auth.usuario.rol, accion.permiso as Permiso)) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'No tienes permiso para confirmar esta acción.');
    }

    // Reclamo atómico: bloquea la fila y solo avanza si sigue esperando decisión.
    const reclamo = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM acciones_propuestas WHERE id = ${id}::uuid FOR UPDATE`;
      const a = await tx.accionPropuesta.findUniqueOrThrow({ where: { id } });
      if (a.estado === 'expirada') return 'expirada' as const;
      if (a.estado !== 'propuesta' || a.decididaEn) return 'decidida' as const;
      if (a.expiraEn <= new Date()) {
        await tx.accionPropuesta.update({ where: { id }, data: { estado: 'expirada' } });
        return 'expirada' as const;
      }
      const ahora = new Date();
      if (!entrada.confirmar) {
        await tx.accionPropuesta.update({
          where: { id },
          data: {
            estado: 'rechazada',
            decididaPorId: auth.usuario.id,
            decididaEn: ahora,
            motivoRechazo: entrada.motivo || null,
          },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'asistente.accion_rechazada',
            entidad: 'accion_propuesta',
            entidadId: id,
            antes: { estado: 'propuesta' },
            despues: { estado: 'rechazada', herramienta, motivo: entrada.motivo ?? null },
            cliente,
          },
          tx,
        );
        return 'rechazada' as const;
      }
      await tx.accionPropuesta.update({
        where: { id },
        data: { decididaPorId: auth.usuario.id, decididaEn: ahora },
      });
      return 'reclamada' as const;
    });
    if (reclamo === 'decidida') {
      throw new ErrorApp(409, 'ACCION_YA_DECIDIDA', 'Esta acción ya se confirmó o se rechazó.');
    }
    if (reclamo === 'expirada') {
      throw new ErrorApp(
        409,
        'ACCION_EXPIRADA',
        'Esta propuesta caducó. Pídela de nuevo al asistente si todavía hace falta.',
      );
    }

    if (reclamo === 'reclamada') {
      let resultado: string | null = null;
      let error: string | null = null;
      try {
        resultado = await this.herramientas.ejecutar(herramienta, accion.parametros, auth, cliente);
      } catch (e) {
        error =
          e instanceof ErrorApp && e.estado < 500
            ? e.message
            : 'No se pudo ejecutar la acción. Inténtalo desde su pantalla.';
        if (!(e instanceof ErrorApp)) {
          this.logger.error(
            `Falló la acción ${id} (${herramienta}): ${e instanceof Error ? e.name : 'error'}`,
          );
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.accionPropuesta.update({
          where: { id },
          data: {
            estado: error ? 'fallida' : 'ejecutada',
            resultado: resultado?.slice(0, 500) ?? null,
            error: error?.slice(0, 500) ?? null,
          },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: error ? 'asistente.accion_fallida' : 'asistente.accion_ejecutada',
            entidad: 'accion_propuesta',
            entidadId: id,
            antes: { estado: 'propuesta' },
            despues: {
              estado: error ? 'fallida' : 'ejecutada',
              herramienta,
              solicitadaPorId: accion.solicitadaPorId,
              ...(error ? { error } : { resultado }),
            },
            cliente,
          },
          tx,
        );
      });
    }
    return accionPublica(
      await this.prisma.accionPropuesta.findUniqueOrThrow({ where: { id }, include: INCLUIR }),
    );
  }

  /** Acciones de unos mensajes, agrupadas por mensaje, para mostrarlas con la conversación. */
  async deMensajes(mensajeIds: string[]): Promise<Map<string, AccionPropuestaPublica[]>> {
    const mapa = new Map<string, AccionPropuestaPublica[]>();
    if (!mensajeIds.length) return mapa;
    const filas = await this.prisma.accionPropuesta.findMany({
      where: { mensajeId: { in: mensajeIds } },
      include: INCLUIR,
      orderBy: { creadaEn: 'asc' },
    });
    for (const f of filas) {
      if (!f.mensajeId) continue;
      mapa.set(f.mensajeId, [...(mapa.get(f.mensajeId) ?? []), accionPublica(f)]);
    }
    return mapa;
  }
}
