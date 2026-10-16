import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type { AccesoRevelado, AccesoServicio } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import { revendedorPropio } from '../revendedores/libro-mayor.js';
import { leerDatos } from './datos.js';
import { accesoServicio, INCLUIR_ACCESO } from './presentacion.js';

/** Cuántas veces por hora una persona puede mostrar códigos (frena la extracción masiva). */
export const LIMITE_REVELAR = { maximo: 30, ventanaSegundos: 3600 };

export type VistaAccesos = 'cliente' | 'revendedor';

/**
 * «Mis accesos» del cliente y «Accesos de clientes» del revendedor. La lista
 * nunca trae el código ni el enlace: se piden uno a uno con «Mostrar», que
 * descifra en el momento, queda auditado y tiene límite de uso.
 */
@Injectable()
export class AccesosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  /** Qué entregas ve quien pide: las suyas (cliente) o las de sus clientes (revendedor). */
  private async alcance(
    auth: ContextoAuth,
    vista: VistaAccesos,
  ): Promise<Prisma.EntregaWhereInput> {
    if (vista === 'cliente') return { cliente: { usuarioId: auth.usuario.id } };
    const r = await revendedorPropio(auth, this.prisma);
    return { OR: [{ revendedorId: r.id }, { cliente: { revendedorId: r.id } }] };
  }

  async listar(auth: ContextoAuth, vista: VistaAccesos): Promise<AccesoServicio[]> {
    const donde = await this.alcance(auth, vista);
    const filas = await this.prisma.entrega.findMany({
      where: { AND: [donde, { estado: { not: 'anulada' } }] },
      include: INCLUIR_ACCESO,
      orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return filas.map((e) => accesoServicio(e, vista === 'revendedor'));
  }

  /** Descifra el código o enlace de una entrega propia. Marca la primera vez que se vio. */
  async revelar(
    auth: ContextoAuth,
    vista: VistaAccesos,
    id: string,
    cliente: InfoCliente,
  ): Promise<AccesoRevelado> {
    await this.limites.consumir(`revelar_entrega:${auth.usuario.id}`, LIMITE_REVELAR);
    const donde = await this.alcance(auth, vista);
    const e = await this.prisma.entrega.findFirst({
      where: { AND: [{ id }, donde] },
      select: { id: true, estado: true, datosCifrados: true, instrucciones: true, vistaEn: true },
    });
    if (!e) throw Errores.noEncontrado('El acceso');
    if (e.estado !== 'entregada') {
      throw new ErrorApp(
        409,
        'ACCESO_NO_DISPONIBLE',
        e.estado === 'revocada'
          ? 'Este acceso ya no está disponible: la suscripción terminó.'
          : 'Este acceso aún se está preparando. Te avisaremos por correo cuando esté listo.',
      );
    }
    const datos = leerDatos(this.cifrador, e.id, e.datosCifrados);
    const ahora = new Date();
    const vistaEn = e.vistaEn ?? ahora;
    await this.prisma.$transaction(async (tx) => {
      if (!e.vistaEn) {
        await tx.entrega.updateMany({
          where: { id: e.id, vistaEn: null },
          data: { vistaEn: ahora },
        });
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'entrega.revelada',
          entidad: 'entrega',
          entidadId: e.id,
          despues: {
            vista,
            primeraVez: !e.vistaEn,
            tieneCodigo: Boolean(datos.codigo),
            tieneEnlace: Boolean(datos.enlace),
          },
          cliente,
        },
        tx,
      );
    });
    return {
      id: e.id,
      codigo: datos.codigo,
      enlace: datos.enlace,
      instrucciones: e.instrucciones,
      vistaEn: vistaEn.toISOString(),
    };
  }
}
