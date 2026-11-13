import { Inject, Injectable } from '@nestjs/common';
import type { Plan, PrecioFijo, Prisma, PrismaClient, Proveedor, Servicio } from '@nv/db';
import {
  type ActualizarPlanEntrada,
  type CatalogoPublico,
  MONEDAS,
  type PlanEntrada,
  type PlanPublico,
  type OfertaPlanEntrada,
  type PrecioFijoEntrada,
  type ProveedorEntrada,
  type ProveedorPublico,
  type ServicioCatalogo,
  type ServicioEntrada,
  type ServicioPublico,
  datosRequeridosSchema,
  type DatoRequerido,
  esCompraUnica,
  urlMedio,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D, type MapaTasas, preciosOfertaPorMoneda, preciosPorMoneda } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';

export type PlanCompleto = Plan & {
  servicio: Pick<
    Servicio,
    | 'id'
    | 'nombre'
    | 'slug'
    | 'activo'
    | 'descripcion'
    | 'categoria'
    | 'imagenId'
    | 'datosRequeridos'
  > & {
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
      descripcion: true,
      categoria: true,
      imagenId: true,
      datosRequeridos: true,
      proveedor: { select: { activo: true } },
    },
  },
  preciosFijos: true,
} as const;

/** Datos que pide un servicio, leídos de la base (si algo no cuadra, ninguno). */
export function datosDeServicio(v: unknown): DatoRequerido[] {
  const r = datosRequeridosSchema.safeParse(v);
  return r.success ? r.data : [];
}

/**
 * Una compra única no vence ni se renueva: su duración no se usa, y se
 * entrega en la cuenta de juego del cliente (no hay alquiler ni activación).
 */
function ajustesCompraUnica(tipo: Plan['tipo'] | undefined) {
  return tipo && esCompraUnica(tipo)
    ? {
        renovable: false,
        duracionCantidad: 1,
        duracionUnidad: 'mes' as const,
        entrega: 'alquiler' as const,
      }
    : {};
}

/** Un plan se puede contratar si él, su servicio y su proveedor están activos. */
export const planVendible: Prisma.PlanWhereInput = {
  activo: true,
  servicio: { activo: true, proveedor: { activo: true } },
};

function ofertaPublica(p: PlanCompleto, tasas: MapaTasas): PlanPublico['oferta'] {
  const precios = preciosOfertaPorMoneda(p, tasas);
  if (!precios || !p.ofertaPorcentaje || !p.ofertaHasta) return null;
  return { porcentaje: p.ofertaPorcentaje, hasta: p.ofertaHasta.toISOString(), precios };
}

/** `equipo` añade el costo para NV, que nunca se publica. */
export function planPublico(
  p: PlanCompleto,
  tasas: MapaTasas,
  equipo = false,
  precioRevendedor: PlanPublico['precioRevendedorUsd'] = null,
): PlanPublico {
  return {
    id: p.id,
    servicio: { id: p.servicio.id, nombre: p.servicio.nombre, slug: p.servicio.slug },
    nombre: p.nombre,
    descripcion: p.descripcion,
    precioUsd: p.precioUsd.toFixed(2),
    tipo: p.tipo,
    entrega: p.entrega,
    duracionCantidad: p.duracionCantidad,
    duracionUnidad: p.duracionUnidad,
    beneficios: p.beneficios,
    activo: p.activo,
    visible: p.visible,
    renovable: p.renovable,
    revendible: p.revendible,
    ...(equipo
      ? {
          costoUsd: p.costoUsd?.toFixed(2) ?? null,
          skuProveedor: p.skuProveedor,
          precioRevendedorUsd: precioRevendedor,
          ofertaConfigurada:
            p.ofertaPorcentaje && p.ofertaHasta
              ? { porcentaje: p.ofertaPorcentaje, hasta: p.ofertaHasta.toISOString() }
              : null,
        }
      : {}),
    orden: p.orden,
    precios: preciosPorMoneda(p, tasas),
    oferta: ofertaPublica(p, tasas),
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
  categoria: s.categoria,
  imagen: s.imagenId ? { id: s.imagenId, url: urlMedio(s.imagenId) } : null,
  datosRequeridos: datosDeServicio(s.datosRequeridos),
  activo: s.activo,
});

/** Días que cuenta «Lo más pedido». */
const DIAS_MAS_PEDIDOS = 30;

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

/** La imagen elegida tiene que estar en la biblioteca del sitio. */
async function exigirImagen(tx: Prisma.TransactionClient, imagenId: string | null | undefined) {
  if (!imagenId) return;
  if (!(await tx.medio.findUnique({ where: { id: imagenId }, select: { id: true } }))) {
    throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa imagen ya no está en la biblioteca.', {
      imagenId: ['Sube la imagen otra vez.'],
    });
  }
}

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

  /** Catálogo sin combos (los añade el controlador con CombosService). */
  async publico(): Promise<CatalogoPublico> {
    const [planes, tasas, vigentes, pedidos] = await Promise.all([
      this.prisma.plan.findMany({
        where: { ...planVendible, visible: true },
        include: INCLUIR_PLAN,
        orderBy: [{ orden: 'asc' }, { precioUsd: 'asc' }],
      }),
      this.tasas.mapa(),
      this.tasas.vigentes(),
      this.pedidosPorServicio(),
    ]);
    const servicios = new Map<string, ServicioCatalogo>();
    for (const { servicio: s } of planes) {
      if (!servicios.has(s.id)) {
        servicios.set(s.id, {
          id: s.id,
          nombre: s.nombre,
          slug: s.slug,
          descripcion: s.descripcion,
          categoria: s.categoria,
          imagen: s.imagenId ? urlMedio(s.imagenId) : null,
          datosRequeridos: datosDeServicio(s.datosRequeridos),
        });
      }
    }
    return {
      planes: planes.map((p) => planPublico(p, tasas)),
      servicios: [...servicios.values()],
      masPedidos: pedidos.filter((id) => servicios.has(id)),
      monedas: MONEDAS.filter(
        (m) => tasas.has(m) || planes.some((p) => p.preciosFijos.some((f) => f.moneda === m)),
      ),
      tasas: vigentes,
      combos: [],
    };
  }

  /**
   * Servicios ordenados por periodos pagados (altas, renovaciones y
   * recuperaciones) en los últimos 30 días. Solo el orden: nunca las cifras.
   */
  private async pedidosPorServicio(): Promise<string[]> {
    const desde = new Date(Date.now() - DIAS_MAS_PEDIDOS * 24 * 3600_000);
    const filas = await this.prisma.$queryRaw<{ servicio_id: string }[]>`
      SELECT p.servicio_id::text AS servicio_id
        FROM eventos_suscripcion e
        JOIN suscripciones s ON s.id = e.suscripcion_id
        JOIN planes p ON p.id = s.plan_id
       WHERE e.tipo IN ('activacion', 'renovacion', 'recuperacion')
         AND e.creado_en >= ${desde}
       GROUP BY p.servicio_id
       ORDER BY count(*) DESC, min(p.orden) ASC`;
    return filas.map((f) => f.servicio_id);
  }

  /**
   * Precio para revendedores de cada plan: el mismo en todos los niveles
   * activos, «varios» si cambia según el nivel, o sin entrada si no tiene.
   */
  private async preciosRevendedor(
    db: Prisma.TransactionClient | PrismaClient,
    planIds: string[],
  ): Promise<Map<string, string>> {
    const r = new Map<string, string>();
    if (planIds.length === 0) return r;
    const filas = await db.precioMayorista.findMany({
      where: { planId: { in: planIds }, nivel: { activo: true } },
      select: { planId: true, precioUsd: true },
    });
    const porPlan = new Map<string, Set<string>>();
    for (const f of filas) {
      const set = porPlan.get(f.planId) ?? new Set<string>();
      set.add(f.precioUsd.toFixed(2));
      porPlan.set(f.planId, set);
    }
    for (const [id, precios] of porPlan) {
      r.set(id, precios.size === 1 ? [...precios][0]! : 'varios');
    }
    return r;
  }

  /**
   * Mismo precio mayorista para todos los niveles activos (null los quita).
   * Si todavía no hay niveles, crea «General» para poder aprobar revendedores.
   */
  private async fijarPrecioRevendedor(
    tx: Prisma.TransactionClient,
    auth: ContextoAuth,
    planId: string,
    precioUsd: string | null,
  ): Promise<void> {
    if (precioUsd === null) {
      await tx.precioMayorista.deleteMany({ where: { planId } });
      return;
    }
    const plan = await tx.plan.findUnique({
      where: { id: planId },
      select: {
        precioUsd: true,
        costoUsd: true,
        servicio: { select: { proveedor: { select: { id: true, permiteReventa: true } } } },
      },
    });
    if (!plan) throw Errores.noEncontrado('El plan');
    const precio = D(precioUsd);
    const campo = (m: string) =>
      new ErrorApp(409, 'PRECIO_REVENDEDOR', m, { precioRevendedorUsd: [m] });
    if (plan.costoUsd && precio.lt(plan.costoUsd)) {
      throw campo(`No puede ser menor que el costo del plan (${plan.costoUsd.toFixed(2)} USD).`);
    }
    if (precio.gt(plan.precioUsd)) {
      throw campo('No puede ser mayor que el precio normal.');
    }
    // El proveedor de un plan con precio de revendedor tiene que permitir la reventa.
    if (!plan.servicio.proveedor.permiteReventa) {
      await tx.proveedor.update({
        where: { id: plan.servicio.proveedor.id },
        data: { permiteReventa: true },
      });
    }
    let niveles = await tx.nivelRevendedor.findMany({
      where: { activo: true },
      select: { id: true },
    });
    if (niveles.length === 0) {
      const existente = await tx.nivelRevendedor.findFirst({ where: { nombre: 'General' } });
      const general = existente
        ? await tx.nivelRevendedor.update({ where: { id: existente.id }, data: { activo: true } })
        : await tx.nivelRevendedor.create({
            data: { nombre: 'General', descripcion: 'Precio de revendedor de cada plan.' },
          });
      niveles = [{ id: general.id }];
    }
    for (const n of niveles) {
      await tx.precioMayorista.upsert({
        where: { planId_nivelId: { planId, nivelId: n.id } },
        update: { precioUsd: precio, actualizadoPorId: auth.usuario.id },
        create: { planId, nivelId: n.id, precioUsd: precio, actualizadoPorId: auth.usuario.id },
      });
    }
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
      await exigirImagen(tx, e.imagenId);
      const s = await tx.servicio.create({
        data: { ...e, descripcion: e.descripcion ?? null, categoria: e.categoria ?? null },
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
      await exigirImagen(tx, e.imagenId);
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
    const revendedor = await this.preciosRevendedor(
      this.prisma,
      filas.map((p) => p.id),
    );
    return filas.map((p) => planPublico(p, tasas, true, revendedor.get(p.id) ?? null));
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
    const revendedor = await this.preciosRevendedor(this.prisma, [p.id]);
    return {
      ...planPublico(p, tasas, true, revendedor.get(p.id) ?? null),
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
      const { precioRevendedorUsd, ...datos } = e;
      const p = await tx.plan.create({
        data: {
          ...datos,
          ...ajustesCompraUnica(datos.tipo),
          ...(precioRevendedorUsd ? { revendible: true } : {}),
          descripcion: e.descripcion ?? null,
          precioUsd: D(e.precioUsd),
          costoUsd: e.costoUsd ? D(e.costoUsd) : null,
        },
        include: INCLUIR_PLAN,
      });
      if (precioRevendedorUsd !== undefined) {
        await this.fijarPrecioRevendedor(tx, auth, p.id, precioRevendedorUsd);
      }
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
        resultado: planPublico(
          p,
          await this.tasas.mapa(tx),
          true,
          (await this.preciosRevendedor(tx, [p.id])).get(p.id) ?? null,
        ),
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
      const { precioUsd, costoUsd, precioRevendedorUsd, ...resto } = e;
      if (costoUsd) await exigirCostoBajoMayoristas(tx, id, D(costoUsd));
      const p = await tx.plan.update({
        where: { id },
        data: {
          ...resto,
          ...(resto.tipo ? ajustesCompraUnica(resto.tipo) : {}),
          ...(precioRevendedorUsd ? { revendible: true } : {}),
          ...(precioUsd !== undefined ? { precioUsd: D(precioUsd) } : {}),
          ...(costoUsd !== undefined ? { costoUsd: costoUsd === null ? null : D(costoUsd) } : {}),
        },
        include: INCLUIR_PLAN,
      });
      if (precioRevendedorUsd !== undefined) {
        await this.fijarPrecioRevendedor(tx, auth, id, precioRevendedorUsd);
      }
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
        resultado: planPublico(
          p,
          await this.tasas.mapa(tx),
          true,
          (await this.preciosRevendedor(tx, [id])).get(id) ?? null,
        ),
      };
    });
  }

  /** Pone, cambia o quita la oferta HOT de un plan. */
  async fijarOferta(
    auth: ContextoAuth,
    id: string,
    e: OfertaPlanEntrada,
    cliente: InfoCliente,
  ): Promise<PlanPublico> {
    return this.guardar(auth, cliente, 'plan', id, async (tx) => {
      const antes = await tx.plan.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El plan');
      const quitar = e.porcentaje === null;
      const p = await tx.plan.update({
        where: { id },
        data: {
          ofertaPorcentaje: quitar ? null : e.porcentaje,
          ofertaHasta: quitar ? null : (e.hasta ?? null),
        },
        include: INCLUIR_PLAN,
      });
      return {
        id,
        antes: {
          porcentaje: antes.ofertaPorcentaje,
          hasta: antes.ofertaHasta?.toISOString() ?? null,
        },
        resultado: planPublico(
          p,
          await this.tasas.mapa(tx),
          true,
          (await this.preciosRevendedor(tx, [id])).get(id) ?? null,
        ),
        accion: quitar ? 'plan.oferta_quitada' : 'plan.oferta_fijada',
        despues: {
          porcentaje: p.ofertaPorcentaje,
          hasta: p.ofertaHasta?.toISOString() ?? null,
        },
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
