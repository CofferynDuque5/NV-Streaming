import { Inject, Injectable } from '@nestjs/common';
import type { EstadoCompra, Prisma, PrismaClient, TipoCompra } from '@nv/db';
import {
  type ClienteCartera,
  type ClienteCarteraDetalle,
  type ClienteCarteraFila,
  type DiaVentas,
  type FiltroCartera,
  type FiltroRenovaciones,
  type FiltroVentas,
  inicioDiaVenezuela,
  type ListaRenovaciones,
  type ListarCarteraEntrada,
  type ListarRenovacionesEntrada,
  type ListarVentasEntrada,
  type OrdenCartera,
  type PaginaCartera,
  type PaginaVentas,
  type PeriodoVentas,
  type PlanMasVendido,
  type ResumenVentas,
  type TotalesVentas,
  type VentaRevendedor,
} from '@nv/shared';
import type { ContextoAuth } from '../comun/contexto.js';
import { Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO, type Dec } from '../dinero/dinero.js';
import { INCLUIR_SUSCRIPCION, suscripcionPublica } from '../suscripciones/presentacion.js';
import { revendedorPropio } from './libro-mayor.js';
import { compraPublica, INCLUIR_COMPRA } from './presentacion.js';
import {
  atrasado,
  INCLUIR_RENOVABLE,
  preciosDelNivel,
  renovacionDe,
  serviciosRenovables,
  urgente,
} from './renovables.js';

const DIA_MS = 24 * 3600_000;
/** Venezuela está en UTC−4 todo el año. */
const DESFASE_VE_MS = 4 * 3600_000;

/** La compra con el precio al público de su plan (para la ganancia estimada). */
const INCLUIR_VENTA = {
  ...INCLUIR_COMPRA,
  plan: { select: { ...INCLUIR_COMPRA.plan.select, precioUsd: true } },
} as const satisfies Prisma.CompraRevendedorInclude;

type CompraConPrecio = Prisma.CompraRevendedorGetPayload<{ include: typeof INCLUIR_VENTA }>;

/** Lo mínimo de una compra para sumar cifras. */
interface Cifra {
  estado: EstadoCompra;
  precioUsd: Dec;
  plan: { precioUsd: Dec };
}

const INCLUIR_CARTERA = {
  contactos: { where: { tipo: { in: ['correo', 'whatsapp'] } } },
  suscripciones: {
    include: INCLUIR_SUSCRIPCION,
    orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.ClienteInclude;

type ClienteConCartera = Prisma.ClienteGetPayload<{ include: typeof INCLUIR_CARTERA }>;

/** Estados que cuentan para el «próximo vencimiento» de un cliente. */
const CON_VENCIMIENTO = ['activa', 'en_gracia', 'vencida', 'suspendida'];

function ventaPublica(c: CompraConPrecio): VentaRevendedor {
  return {
    ...compraPublica(c),
    precioPublicoUsd: c.plan.precioUsd.toFixed(2),
    gananciaUsd: c.estado === 'completada' ? c.plan.precioUsd.sub(c.precioUsd).toFixed(2) : null,
  };
}

/** Ventas, reembolsos y ganancia estimada (precio al público de hoy menos lo pagado). */
function totalizar(lista: Cifra[]): TotalesVentas {
  let pagado = CERO;
  let publico = CERO;
  let reembolsado = CERO;
  let ventas = 0;
  for (const c of lista) {
    if (c.estado === 'completada') {
      ventas += 1;
      pagado = pagado.add(c.precioUsd);
      publico = publico.add(c.plan.precioUsd);
    } else {
      reembolsado = reembolsado.add(c.precioUsd);
    }
  }
  return {
    ventas,
    pagadoUsd: pagado.toFixed(2),
    publicoUsd: publico.toFixed(2),
    gananciaUsd: publico.sub(pagado).toFixed(2),
    reembolsadas: lista.length - ventas,
    reembolsadoUsd: reembolsado.toFixed(2),
  };
}

/** Día de Venezuela (AAAA-MM-DD) de un instante. */
const diaVenezuela = (d: Date) => new Date(d.getTime() - DESFASE_VE_MS).toISOString().slice(0, 10);

/** Primer instante del periodo y cuántos días abarca (hoy incluido). */
function rangoPeriodo(periodo: PeriodoVentas, ahora: Date) {
  const dias = periodo === 'hoy' ? 1 : Number(periodo);
  const desde = new Date(inicioDiaVenezuela(ahora).getTime() - (dias - 1) * DIA_MS);
  return { desde, dias };
}

const FILTRO_VENTAS: Record<FiltroVentas, Prisma.CompraRevendedorWhereInput> = {
  todas: {},
  alta: { tipo: 'alta' },
  renovacion: { tipo: 'renovacion' },
  reembolsada: { estado: 'reembolsada' },
};

/**
 * Lo que el panel del revendedor muestra de su negocio: cifras y series de
 * ventas, la lista de ventas, la cartera con sus totales y lo que puede
 * renovar. Todo se calcula aquí: el navegador solo muestra los importes.
 */
@Injectable()
export class VentasService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  // ── Ventas ─────────────────────────────────────────────────────────────────

  async resumen(
    auth: ContextoAuth,
    periodo: PeriodoVentas,
    ahora = new Date(),
  ): Promise<ResumenVentas> {
    const r = await revendedorPropio(auth, this.prisma);
    const { desde, dias } = rangoPeriodo(periodo, ahora);
    const compras = await this.prisma.compraRevendedor.findMany({
      where: { revendedorId: r.id, creadoEn: { gte: desde } },
      select: {
        estado: true,
        precioUsd: true,
        creadoEn: true,
        plan: INCLUIR_VENTA.plan,
      },
    });

    const porDia = new Map<string, { ventas: number; pagado: Dec; publico: Dec }>();
    const porPlan = new Map<
      string,
      { plan: CompraConPrecio['plan']; ventas: number; pagado: Dec; publico: Dec }
    >();
    for (const c of compras) {
      if (c.estado !== 'completada') continue;
      const dia = diaVenezuela(c.creadoEn);
      const d = porDia.get(dia) ?? { ventas: 0, pagado: CERO, publico: CERO };
      porDia.set(dia, {
        ventas: d.ventas + 1,
        pagado: d.pagado.add(c.precioUsd),
        publico: d.publico.add(c.plan.precioUsd),
      });
      const p = porPlan.get(c.plan.id) ?? { plan: c.plan, ventas: 0, pagado: CERO, publico: CERO };
      porPlan.set(c.plan.id, {
        plan: c.plan,
        ventas: p.ventas + 1,
        pagado: p.pagado.add(c.precioUsd),
        publico: p.publico.add(c.plan.precioUsd),
      });
    }

    const serie: DiaVentas[] = [];
    for (let i = 0; i < dias; i += 1) {
      const fecha = diaVenezuela(new Date(desde.getTime() + i * DIA_MS));
      const d = porDia.get(fecha);
      serie.push({
        fecha,
        ventas: d?.ventas ?? 0,
        pagadoUsd: (d?.pagado ?? CERO).toFixed(2),
        gananciaUsd: d ? d.publico.sub(d.pagado).toFixed(2) : '0.00',
      });
    }

    const masVendidos: PlanMasVendido[] = [...porPlan.values()]
      .sort(
        (a, b) =>
          b.ventas - a.ventas ||
          b.pagado.cmp(a.pagado) ||
          a.plan.servicio.nombre.localeCompare(b.plan.servicio.nombre, 'es'),
      )
      .slice(0, 5)
      .map((p) => ({
        plan: {
          id: p.plan.id,
          nombre: p.plan.nombre,
          servicio: p.plan.servicio.nombre,
          servicioSlug: p.plan.servicio.slug,
          categoria: p.plan.servicio.categoria,
        },
        ventas: p.ventas,
        pagadoUsd: p.pagado.toFixed(2),
        gananciaUsd: p.publico.sub(p.pagado).toFixed(2),
      }));

    return {
      periodo,
      desde: desde.toISOString(),
      dias: serie,
      totales: totalizar(compras),
      masVendidos,
    };
  }

  async listar(auth: ContextoAuth, filtro: ListarVentasEntrada, ahora = new Date()) {
    const r = await revendedorPropio(auth, this.prisma);
    const { desde } = rangoPeriodo(filtro.periodo, ahora);
    const base: Prisma.CompraRevendedorWhereInput = {
      revendedorId: r.id,
      creadoEn: { gte: desde },
    };
    const where = { ...base, ...FILTRO_VENTAS[filtro.tipo] };
    const [grupos, cifras, filas] = await Promise.all([
      this.prisma.compraRevendedor.groupBy({
        by: ['tipo', 'estado'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.compraRevendedor.findMany({
        where,
        select: { estado: true, precioUsd: true, plan: { select: { precioUsd: true } } },
      }),
      this.prisma.compraRevendedor.findMany({
        where,
        include: INCLUIR_VENTA,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    const cuenta = (f: (g: { tipo: TipoCompra; estado: EstadoCompra }) => boolean) =>
      grupos.filter(f).reduce((t, g) => t + g._count._all, 0);
    const resultado: PaginaVentas = {
      elementos: filas.map(ventaPublica),
      total: cifras.length,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      totales: totalizar(cifras),
      conteos: {
        todas: cuenta(() => true),
        alta: cuenta((g) => g.tipo === 'alta'),
        renovacion: cuenta((g) => g.tipo === 'renovacion'),
        reembolsada: cuenta((g) => g.estado === 'reembolsada'),
      },
    };
    return resultado;
  }

  // ── Cartera ────────────────────────────────────────────────────────────────

  /**
   * Cartera con sus cifras. El orden por totales o fechas se calcula sobre
   * toda la cartera filtrada (la de un revendedor es de cientos de clientes,
   * no de millones) y después se corta la página.
   */
  async cartera(
    auth: ContextoAuth,
    filtro: ListarCarteraEntrada,
    ahora = new Date(),
  ): Promise<PaginaCartera> {
    const r = await revendedorPropio(auth, this.prisma);
    const porFiltro: Record<FiltroCartera, Prisma.ClienteWhereInput> = {
      por_vencer: {
        suscripciones: {
          some: { estado: 'activa', venceEn: { lte: new Date(ahora.getTime() + 7 * DIA_MS) } },
        },
      },
      atrasados: {
        suscripciones: { some: { estado: { in: ['en_gracia', 'vencida', 'suspendida'] } } },
      },
    };
    const conBusqueda: Prisma.ClienteWhereInput = {
      revendedorId: r.id,
      ...(filtro.busqueda
        ? {
            OR: [
              { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
              { documento: { contains: filtro.busqueda, mode: 'insensitive' } },
              {
                contactos: {
                  some: { valor: { contains: filtro.busqueda, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const where = { ...conBusqueda, ...(filtro.filtro ? porFiltro[filtro.filtro] : {}) };
    const [todos, porVencer, atrasados, candidatos] = await Promise.all([
      this.prisma.cliente.count({ where: conBusqueda }),
      this.prisma.cliente.count({ where: { ...conBusqueda, ...porFiltro.por_vencer } }),
      this.prisma.cliente.count({ where: { ...conBusqueda, ...porFiltro.atrasados } }),
      this.prisma.cliente.findMany({ where, select: { id: true, nombre: true } }),
    ]);
    const cifras = await this.cifrasDeClientes(
      r.id,
      candidatos.map((c) => c.id),
    );
    const orden = ordenarCartera(filtro.orden, filtro.dir);
    const ordenados = candidatos
      .map((c) => ({ ...c, ...cifras.get(c.id)! }))
      .sort(
        (a, b) => orden(a, b) || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
      );
    const pagina = ordenados.slice(
      (filtro.pagina - 1) * filtro.porPagina,
      filtro.pagina * filtro.porPagina,
    );
    const completos = new Map(
      (
        await this.prisma.cliente.findMany({
          where: { id: { in: pagina.map((c) => c.id) } },
          include: INCLUIR_CARTERA,
        })
      ).map((c) => [c.id, c]),
    );
    return {
      elementos: pagina.map((c) => filaCartera(completos.get(c.id)!, cifras.get(c.id)!)),
      total: candidatos.length,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      conteos: { todos, por_vencer: porVencer, atrasados },
    };
  }

  /** Ficha de un cliente de la cartera: cifras, servicios con su renovación e historial. */
  async cliente(auth: ContextoAuth, id: string): Promise<ClienteCarteraDetalle> {
    const r = await revendedorPropio(auth, this.prisma);
    const c = await this.prisma.cliente.findFirst({
      where: { id, revendedorId: r.id },
      include: INCLUIR_CARTERA,
    });
    if (!c) throw Errores.noEncontrado('El cliente');
    const [cifras, precios, servicios, historial] = await Promise.all([
      this.cifrasDeClientes(r.id, [c.id]),
      preciosDelNivel(this.prisma, r.nivelId),
      this.prisma.suscripcion.findMany({
        where: { clienteId: c.id },
        include: INCLUIR_RENOVABLE,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.compraRevendedor.findMany({
        where: { revendedorId: r.id, clienteId: c.id },
        include: INCLUIR_VENTA,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        take: 20,
      }),
    ]);
    return {
      ...filaCartera(c, cifras.get(c.id)!),
      servicios: servicios.map((s) => renovacionDe(s, r, precios)),
      historial: historial.map(ventaPublica),
    };
  }

  private async cifrasDeClientes(revendedorId: string, ids: string[]) {
    const [compras, suscripciones] = await Promise.all([
      this.prisma.compraRevendedor.groupBy({
        by: ['clienteId'],
        where: { revendedorId, estado: 'completada', clienteId: { in: ids } },
        _count: { _all: true },
        _sum: { precioUsd: true },
        _max: { creadoEn: true },
      }),
      this.prisma.suscripcion.findMany({
        where: { clienteId: { in: ids } },
        select: { id: true, clienteId: true, estado: true, venceEn: true },
      }),
    ]);
    const mapa = new Map<string, CifrasCliente>(
      ids.map((id) => [
        id,
        { ventas: 0, total: CERO, ultima: null, vence: null, proximoId: null, activos: 0 },
      ]),
    );
    for (const g of compras) {
      const c = mapa.get(g.clienteId)!;
      c.ventas = g._count._all;
      c.total = g._sum.precioUsd ?? CERO;
      c.ultima = g._max.creadoEn;
    }
    for (const s of suscripciones) {
      const c = mapa.get(s.clienteId)!;
      if (s.estado === 'activa' || s.estado === 'en_gracia') c.activos += 1;
      if (CON_VENCIMIENTO.includes(s.estado) && s.venceEn && (!c.vence || s.venceEn < c.vence)) {
        c.vence = s.venceEn;
        c.proximoId = s.id;
      }
    }
    return mapa;
  }

  // ── Renovaciones ───────────────────────────────────────────────────────────

  async renovaciones(
    auth: ContextoAuth,
    filtro: ListarRenovacionesEntrada,
    ahora = new Date(),
  ): Promise<ListaRenovaciones> {
    const r = await revendedorPropio(auth, this.prisma);
    const renovables = (await serviciosRenovables(this.prisma, r)).filter(
      (x) => x.servicio.precioUsd !== null,
    );
    const de: Record<FiltroRenovaciones, typeof renovables> = {
      urgentes: renovables.filter((x) => urgente(x.suscripcion, ahora)),
      atrasados: renovables.filter((x) => atrasado(x.suscripcion)),
      todos: renovables,
    };
    const resumen = (l: typeof renovables) => ({
      cantidad: l.length,
      totalUsd: l.reduce((t, x) => t.add(x.servicio.precioUsd!), CERO).toFixed(2),
    });
    return {
      filtro: filtro.filtro,
      elementos: de[filtro.filtro].map((x) => x.servicio),
      totales: {
        urgentes: resumen(de.urgentes),
        atrasados: resumen(de.atrasados),
        todos: resumen(de.todos),
      },
    };
  }
}

interface CifrasCliente {
  ventas: number;
  total: Dec;
  ultima: Date | null;
  vence: Date | null;
  proximoId: string | null;
  activos: number;
}

function ordenarCartera(
  orden: OrdenCartera,
  dir: 'asc' | 'desc' | undefined,
): (a: { nombre: string } & CifrasCliente, b: { nombre: string } & CifrasCliente) => number {
  const signo =
    (dir ?? (['total', 'ultima', 'servicios'].includes(orden) ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
  return (a, b) => {
    switch (orden) {
      case 'nombre':
        return signo * a.nombre.localeCompare(b.nombre, 'es');
      case 'total':
        return signo * a.total.cmp(b.total);
      case 'servicios':
        return signo * (a.activos - b.activos);
      case 'ultima':
        return signo * ((a.ultima?.getTime() ?? 0) - (b.ultima?.getTime() ?? 0));
      case 'vence': {
        // Sin vencimiento, siempre al final.
        if (!a.vence || !b.vence) return Number(!a.vence) - Number(!b.vence);
        return signo * (a.vence.getTime() - b.vence.getTime());
      }
    }
  };
}

function filaCartera(c: ClienteConCartera, cifras: CifrasCliente): ClienteCarteraFila {
  const base: ClienteCartera = {
    id: c.id,
    nombre: c.nombre,
    correo: c.contactos.find((k) => k.tipo === 'correo')?.valor ?? null,
    whatsapp: c.contactos.find((k) => k.tipo === 'whatsapp')?.valor ?? null,
    documento: c.documento,
    pais: c.pais,
    creadoEn: iso(c.creadoEn)!,
    suscripciones: c.suscripciones.map(suscripcionPublica),
  };
  const proximo = c.suscripciones.find((s) => s.id === cifras.proximoId);
  return {
    ...base,
    ventas: cifras.ventas,
    totalCompradoUsd: cifras.total.toFixed(2),
    ultimaVentaEn: iso(cifras.ultima),
    proximoVencimiento: proximo ? suscripcionPublica(proximo) : null,
    serviciosActivos: cifras.activos,
  };
}
