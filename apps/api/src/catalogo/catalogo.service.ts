import { Inject, Injectable } from '@nestjs/common';
import type { Plan, PrecioFijo, Prisma, PrismaClient, Proveedor, Servicio } from '@nv/db';
import {
  type ActualizarPlanEntrada,
  type CatalogoPublico,
  MONEDAS,
  type PlanEntrada,
  type PlanPublico,
  type PrecioFijoEntrada,
  type ProveedorEntrada,
  type ProveedorPublico,
  type ServicioEntrada,
  type ServicioPublico,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D, type MapaTasas, preciosPorMoneda } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';

export type PlanCompleto = Plan & {
  servicio: Pick<Servicio, 'id' | 'nombre' | 'slug' | 'activo'> & {
    proveedor: Pick<Proveedor, 'activo'>;
  };
  preciosFijos: PrecioFijo[];
};

export const INCLUIR_PLAN = {
  servicio: {
    select: {
      id: true,
      nombre: true,
      slug: true,
      activo: true,
      proveedor: { select: { activo: true } },
    },
  },
  preciosFijos: true,
} as const;

/** Un plan se puede contratar si él, su servicio y su proveedor están activos. */
export const planVendible: Prisma.PlanWhereInput = {
  activo: true,
  servicio: { activo: true, proveedor: { activo: true } },
};

/** `equipo` añade el costo para NV, que nunca se publica. */
export function planPublico(p: PlanCompleto, tasas: MapaTasas, equipo = false): PlanPublico {
  return {
    id: p.id,
    servicio: { id: p.servicio.id, nombre: p.servicio.nombre, slug: p.servicio.slug },
    nombre: p.nombre,
    descripcion: p.descripcion,
    precioUsd: p.precioUsd.toFixed(2),
    duracionCantidad: p.duracionCantidad,
    duracionUnidad: p.duracionUnidad,
    beneficios: p.beneficios,
    activo: p.activo,
    visible: p.visible,
    renovable: p.renovable,
    revendible: p.revendible,
    ...(equipo ? { costoUsd: p.costoUsd?.toFixed(2) ?? null } : {}),
    orden: p.orden,
    precios: preciosPorMoneda(p, tasas),
  };
}

const servicioPublico = (
  s: Servicio & { proveedor: Pick<Proveedor, 'id' | 'nombre' | 'tipo'> },
): ServicioPublico => ({
  id: s.id,
  proveedor: s.proveedor,
  nombre: s.nombre,
  slug: s.slug,
  descripcion: s.descripcion,
  activo: s.activo,
});

const proveedorPublico = (p: Proveedor & { _count: { servicios: number } }): ProveedorPublico => ({
  id: p.id,
  nombre: p.nombre,
  tipo: p.tipo,
  adaptador: p.adaptador,
  permiteReventa: p.permiteReventa,
  notasAcuerdo: p.notasAcuerdo,
  activo: p.activo,
  servicios: p._count.servicios,
});

/** Subir el costo por encima de un precio mayorista dejaría a NV vendiendo a pérdida. */
async function exigirCostoBajoMayoristas(
  tx: Prisma.TransactionClient,
  planId: string,
  costo: Prisma.Decimal,
) {
  // Serializa con quien fija precios mayoristas de este plan.
  await tx.$queryRaw`SELECT id FROM planes WHERE id = ${planId}::uuid FOR UPDATE`;
  const debajo = await tx.precioMayorista.findFirst({
    where: { planId, precioUsd: { lt: costo } },
    include: { nivel: { select: { nombre: true } } },
    orderBy: { precioUsd: 'asc' },
  });
  if (debajo) {
    throw new ErrorApp(
      409,
      'PRECIO_BAJO_COSTO',
      `El precio mayorista del nivel ${debajo.nivel.nombre} (${debajo.precioUsd.toFixed(2)} USD) quedaría por debajo del costo. Súbelo primero.`,
      { costoUsd: ['Hay precios mayoristas por debajo de este costo.'] },
    );
  }
}

@Injectable()
export class CatalogoService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  // ── Público ────────────────────────────────────────────────────────────────

  async publico(): Promise<CatalogoPublico> {
    const [planes, tasas, vigentes] = await Promise.all([
      this.prisma.plan.findMany({
        where: { ...planVendible, visible: true },
        include: INCLUIR_PLAN,
        orderBy: [{ orden: 'asc' }, { precioUsd: 'asc' }],
      }),
      this.tasas.mapa(),
      this.tasas.vigentes(),
    ]);
    return {
      planes: planes.map((p) => planPublico(p, tasas)),
      monedas: MONEDAS.filter(
        (m) => tasas.has(m) || planes.some((p) => p.preciosFijos.some((f) => f.moneda === m)),
      ),
      tasas: vigentes,
    };
  }

  // ── Proveedores ────────────────────────────────────────────────────────────

  async proveedores(): Promise<ProveedorPublico[]> {
    const filas = await this.prisma.proveedor.findMany({
      include: { _count: { select: { servicios: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas.map(proveedorPublico);
  }

  async crearProveedor(auth: ContextoAuth, e: ProveedorEntrada, cliente: InfoCliente) {
    return this.guardar(auth, cliente, 'proveedor', null, async (tx) => {
      const p = await tx.proveedor.create({
        data: { ...e, notasAcuerdo: e.notasAcuerdo ?? null },
        include: { _count: { select: { servicios: true } } },
      });
      return { id: p.id, antes: undefined, resultado: proveedorPublico(p) };
    });
  }

  async actualizarProveedor(
    auth: ContextoAuth,
    id: string,
    e: Partial<ProveedorEntrada>,
    cliente: InfoCliente,
  ) {
    return this.guardar(auth, cliente, 'proveedor', id, async (tx) => {
      const antes = await tx.proveedor.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El proveedor');
      const p = await tx.proveedor.update({
        where: { id },
        data: e,
        include: { _count: { select: { servicios: true } } },
      });
      return { id, antes, resultado: proveedorPublico(p) };
    });
  }

  // ── Servicios ──────────────────────────────────────────────────────────────

  async servicios(): Promise<ServicioPublico[]> {
    const filas = await this.prisma.servicio.findMany({
      include: { proveedor: { select: { id: true, nombre: true, tipo: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas.map(servicioPublico);
  }

  async crearServicio(auth: ContextoAuth, e: ServicioEntrada, cliente: InfoCliente) {
    return this.guardar(auth, cliente, 'servicio', null, async (tx) => {
      if (!(await tx.proveedor.findUnique({ where: { id: e.proveedorId } }))) {
        throw Errores.noEncontrado('El proveedor');
      }
      const s = await tx.servicio.create({
        data: { ...e, descripcion: e.descripcion ?? null },
        include: { proveedor: { select: { id: true, nombre: true, tipo: true } } },
      });
      return { id: s.id, antes: undefined, resultado: servicioPublico(s) };
    });
  }

  async actualizarServicio(
    auth: ContextoAuth,
    id: string,
    e: Partial<Omit<ServicioEntrada, 'proveedorId'>>,
    cliente: InfoCliente,
  ) {
    return this.guardar(auth, cliente, 'servicio', id, async (tx) => {
      const antes = await tx.servicio.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El servicio');
      const s = await tx.servicio.update({
        where: { id },
        data: e,
        include: { proveedor: { select: { id: true, nombre: true, tipo: true } } },
      });
      return { id, antes, resultado: servicioPublico(s) };
    });
  }

  // ── Planes ─────────────────────────────────────────────────────────────────

  async planes(filtro: { servicioId?: string } = {}): Promise<PlanPublico[]> {
    const [filas, tasas] = await Promise.all([
      this.prisma.plan.findMany({
        where: filtro.servicioId ? { servicioId: filtro.servicioId } : {},
        include: INCLUIR_PLAN,
        orderBy: [{ activo: 'desc' }, { orden: 'asc' }, { nombre: 'asc' }],
      }),
      this.tasas.mapa(),
    ]);
    return filas.map((p) => planPublico(p, tasas, true));
  }

  async plan(id: string): Promise<PlanPublico & { historial: unknown[] }> {
    const [p, tasas, historial] = await Promise.all([
      this.prisma.plan.findUnique({ where: { id }, include: INCLUIR_PLAN }),
      this.tasas.mapa(),
      this.prisma.historialPrecio.findMany({
        where: { planId: id },
        orderBy: { creadoEn: 'desc' },
        take: 50,
        include: { autor: { select: { id: true, nombre: true } } },
      }),
    ]);
    if (!p) throw Errores.noEncontrado('El plan');
    return {
      ...planPublico(p, tasas, true),
      historial: historial.map((h) => ({
        id: h.id,
        moneda: h.moneda,
        anterior: h.anterior?.toFixed(2) ?? null,
        nuevo: h.nuevo?.toFixed(2) ?? null,
        autor: h.autor,
        creadoEn: h.creadoEn.toISOString(),
      })),
    };
  }

  async crearPlan(auth: ContextoAuth, e: PlanEntrada, cliente: InfoCliente): Promise<PlanPublico> {
    return this.guardar(auth, cliente, 'plan', null, async (tx) => {
      if (!(await tx.servicio.findUnique({ where: { id: e.servicioId } }))) {
        throw Errores.noEncontrado('El servicio');
      }
      const p = await tx.plan.create({
        data: {
          ...e,
          descripcion: e.descripcion ?? null,
          precioUsd: D(e.precioUsd),
          costoUsd: e.costoUsd ? D(e.costoUsd) : null,
        },
        include: INCLUIR_PLAN,
      });
      await tx.historialPrecio.create({
        data: {
          planId: p.id,
          moneda: 'USD',
          anterior: null,
          nuevo: p.precioUsd,
          autorId: auth.usuario.id,
        },
      });
      return {
        id: p.id,
        antes: undefined,
        resultado: planPublico(p, await this.tasas.mapa(tx), true),
      };
    });
  }

  async actualizarPlan(
    auth: ContextoAuth,
    id: string,
    e: ActualizarPlanEntrada,
    cliente: InfoCliente,
  ): Promise<PlanPublico> {
    return this.guardar(auth, cliente, 'plan', id, async (tx) => {
      const antes = await tx.plan.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El plan');
      const { precioUsd, costoUsd, ...resto } = e;
      if (costoUsd) await exigirCostoBajoMayoristas(tx, id, D(costoUsd));
      const p = await tx.plan.update({
        where: { id },
        data: {
          ...resto,
          ...(precioUsd !== undefined ? { precioUsd: D(precioUsd) } : {}),
          ...(costoUsd !== undefined ? { costoUsd: costoUsd === null ? null : D(costoUsd) } : {}),
        },
        include: INCLUIR_PLAN,
      });
      if (precioUsd !== undefined && !antes.precioUsd.eq(p.precioUsd)) {
        await tx.historialPrecio.create({
          data: {
            planId: id,
            moneda: 'USD',
            anterior: antes.precioUsd,
            nuevo: p.precioUsd,
            autorId: auth.usuario.id,
          },
        });
      }
      return {
        id,
        antes: {
          ...antes,
          precioUsd: antes.precioUsd.toFixed(2),
          costoUsd: antes.costoUsd?.toFixed(2) ?? null,
        },
        resultado: planPublico(p, await this.tasas.mapa(tx), true),
      };
    });
  }

  /** Fija o quita el precio de un plan en una moneda distinta del dólar. */
  async fijarPrecio(
    auth: ContextoAuth,
    id: string,
    e: PrecioFijoEntrada,
    cliente: InfoCliente,
  ): Promise<PlanPublico> {
    return this.guardar(auth, cliente, 'plan', id, async (tx) => {
      const plan = await tx.plan.findUnique({ where: { id }, include: { preciosFijos: true } });
      if (!plan) throw Errores.noEncontrado('El plan');
      const actual = plan.preciosFijos.find((f) => f.moneda === e.moneda) ?? null;
      if (e.precio === null) {
        if (actual) await tx.precioFijo.delete({ where: { id: actual.id } });
      } else {
        await tx.precioFijo.upsert({
          where: { planId_moneda: { planId: id, moneda: e.moneda } },
          update: { precio: D(e.precio) },
          create: { planId: id, moneda: e.moneda, precio: D(e.precio) },
        });
      }
      const nuevo = e.precio === null ? null : D(e.precio);
      const previo = actual?.precio ?? null;
      const cambio =
        (previo === null) !== (nuevo === null) ||
        (previo !== null && nuevo !== null && !previo.eq(nuevo));
      if (cambio) {
        await tx.historialPrecio.create({
          data: {
            planId: id,
            moneda: e.moneda,
            anterior: actual?.precio ?? null,
            nuevo,
            autorId: auth.usuario.id,
          },
        });
      }
      const p = await tx.plan.findUniqueOrThrow({ where: { id }, include: INCLUIR_PLAN });
      return {
        id,
        antes: { moneda: e.moneda, precio: actual?.precio.toFixed(2) ?? null },
        resultado: planPublico(p, await this.tasas.mapa(tx), true),
        accion: 'plan.precio_fijado',
        despues: { moneda: e.moneda, precio: e.precio },
      };
    });
  }

  /** Transacción con auditoría común a todas las escrituras del catálogo. */
  private async guardar<T>(
    auth: ContextoAuth,
    cliente: InfoCliente,
    entidad: 'proveedor' | 'servicio' | 'plan',
    idExistente: string | null,
    fn: (tx: Prisma.TransactionClient) => Promise<{
      id: string;
      antes: unknown;
      resultado: T;
      accion?: string;
      despues?: unknown;
    }>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const r = await fn(tx);
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: r.accion ?? `${entidad}.${idExistente ? 'actualizado' : 'creado'}`,
            entidad,
            entidadId: r.id,
            ...(r.antes !== undefined ? { antes: JSON.parse(JSON.stringify(r.antes)) } : {}),
            despues: JSON.parse(JSON.stringify(r.despues ?? r.resultado)),
            cliente,
          },
          tx,
        );
        return r.resultado;
      });
    } catch (e) {
      if (esUnicoDuplicado(e)) {
        const campo = entidad === 'servicio' ? 'slug' : 'nombre';
        throw new ErrorApp(409, 'DUPLICADO', 'Ya existe uno con ese nombre.', {
          [campo]: [
            campo === 'slug'
              ? 'Ese identificador ya está en uso.'
              : 'Ya existe uno con ese nombre.',
          ],
        });
      }
      throw e;
    }
  }
}
