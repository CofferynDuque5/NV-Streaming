import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type ComentarioEquipo,
  type ComentarioPublico,
  type ComentariosServicio,
  type ComentarioServicioEntrada,
  MAX_COMENTARIOS_DIA,
  type ModerarComentarioEntrada,
  vitrinaDe,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

/** Comentarios que se muestran por página del servicio. */
const POR_PAGINA = 30;

const INCLUIR = {
  usuario: { select: { id: true, nombre: true, correo: true } },
} as const satisfies Prisma.ComentarioServicioInclude;
type Fila = Prisma.ComentarioServicioGetPayload<{ include: typeof INCLUIR }>;

/** «Ana Pérez Gómez» → «Ana P.»: en la tienda nunca sale el nombre completo. */
export function autorCorto(nombre: string): string {
  const [primero = 'Cliente', segundo] = nombre.trim().split(/\s+/);
  return segundo ? `${primero} ${segundo[0]!.toUpperCase()}.` : primero;
}

/**
 * Comentarios de los clientes en la página de cada servicio. Se publican al
 * escribirlos; el equipo los puede ocultar o responder desde el editor.
 */
@Injectable()
export class ComentariosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Quienes ya pagaron algún plan del servicio (para la marca «Compró»). */
  private async compradores(servicioId: string, usuarios: string[]): Promise<Set<string>> {
    if (usuarios.length === 0) return new Set();
    const filas = await this.prisma.suscripcion.findMany({
      where: {
        plan: { servicioId },
        cliente: { usuarioId: { in: usuarios } },
      },
      select: { cliente: { select: { usuarioId: true } } },
      distinct: ['clienteId'],
    });
    return new Set(filas.map((f) => f.cliente.usuarioId).filter((x): x is string => Boolean(x)));
  }

  private publico(f: Fila, compro: boolean, usuarioId?: string): ComentarioPublico {
    return {
      id: f.id,
      autor: autorCorto(f.usuario.nombre),
      texto: f.texto,
      estrellas: f.estrellas,
      compro,
      respuesta: f.respuesta,
      creadoEn: f.creadoEn.toISOString(),
      propio: f.usuarioId === usuarioId,
    };
  }

  async deServicio(servicioId: string, usuarioId?: string): Promise<ComentariosServicio> {
    const servicio = await this.prisma.servicio.findUnique({
      where: { id: servicioId },
      select: { activo: true, vitrina: true },
    });
    const vitrina = servicio ? vitrinaDe(servicio.vitrina) : null;
    if (!servicio || !servicio.activo || !vitrina?.visible)
      throw Errores.noEncontrado('El servicio');
    const donde = { servicioId, oculto: false };
    const [filas, total, promedio] = await Promise.all([
      this.prisma.comentarioServicio.findMany({
        where: donde,
        include: INCLUIR,
        orderBy: { creadoEn: 'desc' },
        take: POR_PAGINA,
      }),
      this.prisma.comentarioServicio.count({ where: donde }),
      this.prisma.comentarioServicio.aggregate({
        where: { ...donde, estrellas: { not: null } },
        _avg: { estrellas: true },
      }),
    ]);
    const compraron = await this.compradores(servicioId, [
      ...new Set(filas.map((f) => f.usuarioId)),
    ]);
    return {
      comentarios: filas.map((f) => this.publico(f, compraron.has(f.usuarioId), usuarioId)),
      total,
      promedio:
        promedio._avg.estrellas === null ? null : Math.round(promedio._avg.estrellas * 10) / 10,
      abiertos: vitrina.comentarios,
    };
  }

  async comentar(
    auth: ContextoAuth,
    e: ComentarioServicioEntrada,
    cliente: InfoCliente,
  ): Promise<ComentarioPublico> {
    const servicio = await this.prisma.servicio.findUnique({
      where: { id: e.servicioId },
      select: { activo: true, vitrina: true },
    });
    if (!servicio || !servicio.activo || !vitrinaDe(servicio.vitrina).visible) {
      throw Errores.noEncontrado('El servicio');
    }
    if (!vitrinaDe(servicio.vitrina).comentarios) {
      throw new ErrorApp(409, 'CONFLICTO', 'Este servicio no recibe comentarios por ahora.');
    }
    const hoy = await this.prisma.comentarioServicio.count({
      where: {
        usuarioId: auth.usuario.id,
        servicioId: e.servicioId,
        creadoEn: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
    });
    if (hoy >= MAX_COMENTARIOS_DIA) {
      throw new ErrorApp(
        429,
        'DEMASIADOS_INTENTOS',
        `Puedes escribir hasta ${MAX_COMENTARIOS_DIA} comentarios al día en cada servicio.`,
      );
    }
    const f = await this.prisma.comentarioServicio.create({
      data: {
        servicioId: e.servicioId,
        usuarioId: auth.usuario.id,
        texto: e.texto,
        estrellas: e.estrellas,
      },
      include: INCLUIR,
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'comentario.creado',
      entidad: 'comentario_servicio',
      entidadId: f.id,
      despues: { servicioId: e.servicioId, estrellas: e.estrellas },
      cliente,
    });
    const compro = (await this.compradores(e.servicioId, [auth.usuario.id])).has(auth.usuario.id);
    return this.publico(f, compro, auth.usuario.id);
  }

  /** Quien lo escribió lo puede borrar. */
  async borrarPropio(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    const f = await this.prisma.comentarioServicio.findUnique({ where: { id } });
    if (!f || f.usuarioId !== auth.usuario.id) throw Errores.noEncontrado('El comentario');
    await this.prisma.comentarioServicio.delete({ where: { id } });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'comentario.borrado',
      entidad: 'comentario_servicio',
      entidadId: id,
      antes: { texto: f.texto },
      cliente,
    });
  }

  /** Todos los comentarios del servicio (también los ocultos), para el editor. */
  async equipo(servicioId: string): Promise<ComentarioEquipo[]> {
    const filas = await this.prisma.comentarioServicio.findMany({
      where: { servicioId },
      include: INCLUIR,
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });
    const compraron = await this.compradores(servicioId, [
      ...new Set(filas.map((f) => f.usuarioId)),
    ]);
    return filas.map((f) => {
      const { propio: _, ...resto } = this.publico(f, compraron.has(f.usuarioId));
      return {
        ...resto,
        oculto: f.oculto,
        usuario: { id: f.usuario.id, nombre: f.usuario.nombre, correo: f.usuario.correo },
      };
    });
  }

  async moderar(
    auth: ContextoAuth,
    id: string,
    e: ModerarComentarioEntrada,
    cliente: InfoCliente,
  ): Promise<void> {
    const antes = await this.prisma.comentarioServicio.findUnique({ where: { id } });
    if (!antes) throw Errores.noEncontrado('El comentario');
    const respondiendo = e.respuesta !== undefined;
    await this.prisma.comentarioServicio.update({
      where: { id },
      data: {
        ...(e.oculto !== undefined ? { oculto: e.oculto } : {}),
        ...(respondiendo
          ? {
              respuesta: e.respuesta ?? null,
              respondidoPorId: e.respuesta ? auth.usuario.id : null,
              respondidoEn: e.respuesta ? new Date() : null,
            }
          : {}),
      },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'comentario.moderado',
      entidad: 'comentario_servicio',
      entidadId: id,
      antes: { oculto: antes.oculto, respuesta: antes.respuesta },
      despues: { ...e },
      cliente,
    });
  }
}
