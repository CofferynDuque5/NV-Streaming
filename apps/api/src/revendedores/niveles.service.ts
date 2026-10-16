import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  ActualizarNivelRevendedorEntrada,
  NivelPublico,
  NivelRevendedorEntrada,
  PrecioMayoristaEntrada,
  TablaPreciosMayoristas,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D } from '../dinero/dinero.js';
import { nivelPublico } from './presentacion.js';

/**
 * Un plan se vende a revendedores si él, su servicio y su proveedor están
 * activos, está marcado como revendible y el acuerdo con el proveedor permite
 * la reventa.
 */
export const planRevendible: Prisma.PlanWhereInput = {
  activo: true,
  revendible: true,
  servicio: { activo: true, proveedor: { activo: true, permiteReventa: true } },
};

const CON_CONTEO = { _count: { select: { revendedores: true } } } as const;

/** Niveles comerciales y su tabla de precios mayoristas (solo administración). */
@Injectable()
export class NivelesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<NivelPublico[]> {
    const filas = await this.prisma.nivelRevendedor.findMany({
      include: CON_CONTEO,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    return filas.map(nivelPublico);
  }

  async crear(
    auth: ContextoAuth,
    e: NivelRevendedorEntrada,
    cliente: InfoCliente,
  ): Promise<NivelPublico> {
    return this.guardar(async (tx) => {
      const n = await tx.nivelRevendedor.create({
        data: { ...e, descripcion: e.descripcion ?? null },
        include: CON_CONTEO,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nivel_revendedor.creado',
          entidad: 'nivel_revendedor',
          entidadId: n.id,
          despues: { nombre: n.nombre, orden: n.orden, activo: n.activo },
          cliente,
        },
        tx,
      );
      return nivelPublico(n);
    });
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    e: ActualizarNivelRevendedorEntrada,
    cliente: InfoCliente,
  ): Promise<NivelPublico> {
    return this.guardar(async (tx) => {
      const antes = await tx.nivelRevendedor.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El nivel');
      const n = await tx.nivelRevendedor.update({ where: { id }, data: e, include: CON_CONTEO });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'nivel_revendedor.actualizado',
          entidad: 'nivel_revendedor',
          entidadId: id,
          antes: {
            nombre: antes.nombre,
            descripcion: antes.descripcion,
            orden: antes.orden,
            activo: antes.activo,
          },
          despues: e as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
      return nivelPublico(n);
    });
  }

  /** Planes revendibles con su precio para cada nivel. */
  async tabla(): Promise<TablaPreciosMayoristas> {
    const [niveles, planes, bloqueados] = await Promise.all([
      this.listar(),
      this.prisma.plan.findMany({
        where: {
          revendible: true,
          servicio: { proveedor: { permiteReventa: true } },
        },
        include: {
          servicio: { select: { nombre: true } },
          preciosMayoristas: { select: { nivelId: true, precioUsd: true } },
        },
        orderBy: [{ activo: 'desc' }, { orden: 'asc' }, { nombre: 'asc' }],
      }),
      this.prisma.plan.findMany({
        where: { revendible: true, servicio: { proveedor: { permiteReventa: false } } },
        select: {
          id: true,
          nombre: true,
          servicio: { select: { nombre: true, proveedor: { select: { nombre: true } } } },
        },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return {
      niveles,
      planes: planes.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        servicio: p.servicio.nombre,
        precioUsd: p.precioUsd.toFixed(2),
        costoUsd: p.costoUsd?.toFixed(2) ?? null,
        activo: p.activo,
        precios: Object.fromEntries(
          niveles.map((n) => [
            n.id,
            p.preciosMayoristas.find((m) => m.nivelId === n.id)?.precioUsd.toFixed(2) ?? null,
          ]),
        ),
      })),
      bloqueadosPorProveedor: bloqueados.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        servicio: p.servicio.nombre,
        proveedor: p.servicio.proveedor.nombre,
      })),
    };
  }

  /**
   * Fija (o quita, con `null`) el precio de un plan para un nivel. Solo planes
   * revendibles de proveedores que permiten la reventa, y nunca por debajo del
   * costo del plan.
   */
  async fijarPrecio(
    auth: ContextoAuth,
    e: PrecioMayoristaEntrada,
    cliente: InfoCliente,
  ): Promise<{ planId: string; nivelId: string; precioUsd: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa con los cambios de costo del plan.
      await tx.$queryRaw`SELECT id FROM planes WHERE id = ${e.planId}::uuid FOR UPDATE`;
      const plan = await tx.plan.findUnique({
        where: { id: e.planId },
        include: { servicio: { select: { proveedor: { select: { permiteReventa: true } } } } },
      });
      if (!plan) throw Errores.noEncontrado('El plan');
      if (!(await tx.nivelRevendedor.findUnique({ where: { id: e.nivelId } }))) {
        throw Errores.noEncontrado('El nivel');
      }
      const actual = await tx.precioMayorista.findUnique({
        where: { planId_nivelId: { planId: e.planId, nivelId: e.nivelId } },
      });
      if (e.precioUsd === null) {
        if (actual) await tx.precioMayorista.delete({ where: { id: actual.id } });
      } else {
        if (!plan.revendible || !plan.servicio.proveedor.permiteReventa) {
          throw new ErrorApp(
            409,
            'PLAN_NO_REVENDIBLE',
            plan.revendible
              ? 'El acuerdo con el proveedor de este plan no permite revenderlo.'
              : 'Marca primero el plan como revendible en el catálogo.',
          );
        }
        const precio = D(e.precioUsd);
        if (plan.costoUsd && precio.lt(plan.costoUsd)) {
          throw new ErrorApp(
            409,
            'PRECIO_BAJO_COSTO',
            `El precio mayorista no puede ser menor que el costo del plan (${plan.costoUsd.toFixed(2)} USD).`,
            { precioUsd: [`Mínimo ${plan.costoUsd.toFixed(2)} USD, el costo del plan.`] },
          );
        }
        await tx.precioMayorista.upsert({
          where: { planId_nivelId: { planId: e.planId, nivelId: e.nivelId } },
          update: { precioUsd: precio, actualizadoPorId: auth.usuario.id },
          create: {
            planId: e.planId,
            nivelId: e.nivelId,
            precioUsd: precio,
            actualizadoPorId: auth.usuario.id,
          },
        });
      }
      const nuevo = e.precioUsd === null ? null : D(e.precioUsd).toFixed(2);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'precio_mayorista.fijado',
          entidad: 'plan',
          entidadId: e.planId,
          antes: { nivelId: e.nivelId, precioUsd: actual?.precioUsd.toFixed(2) ?? null },
          despues: { nivelId: e.nivelId, precioUsd: nuevo },
          cliente,
        },
        tx,
      );
      return { planId: e.planId, nivelId: e.nivelId, precioUsd: nuevo };
    });
  }

  private async guardar<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (e) {
      if (esUnicoDuplicado(e)) {
        throw new ErrorApp(409, 'DUPLICADO', 'Ya existe un nivel con ese nombre.', {
          nombre: ['Ya existe un nivel con ese nombre.'],
        });
      }
      throw e;
    }
  }
}
