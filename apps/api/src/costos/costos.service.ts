import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  BalanceEntrada,
  BalancePeriodo,
  CuentaPorPagar,
  PagoCuentaPublico,
  PorPagar,
  RegistrarPagoCuentaEntrada,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { DESFASE_CARACAS_MS, DIA_MS, fechaCaracas } from '../automatizaciones/horario.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { dec2 } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { dia, fechaODb } from '../cuentas/cuentas.service.js';
import { CERO, D, type Dec, mensualUsd, sumarDuracion } from '../dinero/dinero.js';

type Tx = Prisma.TransactionClient;

/** Un año como máximo por consulta de balance. */
const MAX_DIAS_BALANCE = 366;

/** Medianoche de Caracas del día «AAAA-MM-DD», como instante UTC. */
const inicioDe = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - DESFASE_CARACAS_MS);
/** Días entre dos fechas «AAAA-MM-DD» (b − a). */
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA_MS);

const INCLUIR_PAGO = {
  registradoPor: { select: { id: true, nombre: true } },
  anuladoPor: { select: { id: true, nombre: true } },
} as const satisfies Prisma.PagoCuentaServicioInclude;
type FilaPago = Prisma.PagoCuentaServicioGetPayload<{ include: typeof INCLUIR_PAGO }>;

/**
 * Costos de las cuentas que NV revende (lo que el Gestor llamaba «cuentas por
 * pagar») y el balance del negocio. Los pagos al proveedor no se borran: se
 * anulan con motivo, y el balance solo suma los vigentes.
 */
@Injectable()
export class CostosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Bloquea la cuenta hasta el fin de la transacción: dos pagos a la vez no corren la fecha dos veces. */
  private async bloquearCuenta(tx: Tx, cuentaId: string) {
    await tx.$queryRaw`SELECT id FROM cuentas_servicio WHERE id = ${cuentaId}::uuid FOR UPDATE`;
    const c = await tx.cuentaServicio.findUnique({
      where: { id: cuentaId },
      select: { id: true, estado: true, costoUsd: true, cicloMeses: true, facturaEn: true },
    });
    if (!c) throw Errores.noEncontrado('La cuenta');
    return c;
  }

  async pagos(cuentaId: string, tx: Tx | PrismaClient = this.prisma): Promise<PagoCuentaPublico[]> {
    const cuenta = await tx.cuentaServicio.findUnique({
      where: { id: cuentaId },
      select: { facturaEn: true },
    });
    if (!cuenta) throw Errores.noEncontrado('La cuenta');
    const filas = await tx.pagoCuentaServicio.findMany({
      where: { cuentaId },
      include: INCLUIR_PAGO,
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const ultimoVigente = filas.find((p) => !p.anuladoEn);
    return filas.map((p) =>
      publico(p, p === ultimoVigente && dia(cuenta.facturaEn) === dia(p.siguienteCobro)),
    );
  }

  async registrarPago(
    auth: ContextoAuth,
    cuentaId: string,
    e: RegistrarPagoCuentaEntrada,
    cliente: InfoCliente,
    ahora = new Date(),
  ): Promise<PagoCuentaPublico[]> {
    const hoy = fechaCaracas(ahora);
    const pagadoEl = e.pagadoEl ?? hoy;
    if (pagadoEl > hoy) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El pago no puede tener una fecha futura.', {
        pagadoEl: ['Elige hoy o un día anterior.'],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const c = await this.bloquearCuenta(tx, cuentaId);
      if (c.estado === 'retirada') {
        throw new ErrorApp(409, 'CUENTA_RETIRADA', 'La cuenta está retirada: ya no se paga.');
      }
      // El ciclo corre desde el cobro pendiente; si no había fecha, desde el día del pago.
      const base = c.facturaEn ?? fechaODb(pagadoEl)!;
      const siguiente = e.siguienteCobro
        ? fechaODb(e.siguienteCobro)!
        : sumarDuracion(base, c.cicloMeses, 'mes');
      if (dia(siguiente)! <= pagadoEl) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El próximo cobro va después del pago.', {
          siguienteCobro: ['Elige una fecha posterior al día del pago.'],
        });
      }
      const monto = e.montoUsd ?? dec2(c.costoUsd);
      const pago = await tx.pagoCuentaServicio.create({
        data: {
          cuentaId,
          montoUsd: monto,
          pagadoEl: fechaODb(pagadoEl)!,
          facturaCubierta: c.facturaEn,
          siguienteCobro: siguiente,
          metodoPago: e.metodoPago ?? null,
          nota: e.nota ?? null,
          registradoPorId: auth.usuario.id,
        },
      });
      await tx.cuentaServicio.update({ where: { id: cuentaId }, data: { facturaEn: siguiente } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cuenta_servicio.pago_registrado',
          entidad: 'cuenta_servicio',
          entidadId: cuentaId,
          antes: { facturaEn: dia(c.facturaEn) },
          despues: { pagoId: pago.id, montoUsd: monto, pagadoEl, facturaEn: dia(siguiente) },
          cliente,
        },
        tx,
      );
      return this.pagos(cuentaId, tx);
    });
  }

  async anularPago(
    auth: ContextoAuth,
    cuentaId: string,
    pagoId: string,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<PagoCuentaPublico[]> {
    return this.prisma.$transaction(async (tx) => {
      const c = await this.bloquearCuenta(tx, cuentaId);
      const pago = await tx.pagoCuentaServicio.findFirst({ where: { id: pagoId, cuentaId } });
      if (!pago) throw Errores.noEncontrado('El pago');
      if (pago.anuladoEn) {
        throw new ErrorApp(409, 'PAGO_ANULADO', 'Ese pago ya está anulado.');
      }
      const ultimo = await tx.pagoCuentaServicio.findFirst({
        where: { cuentaId, anuladoEn: null },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      // Solo se devuelve la fecha si nadie la cambió después del pago.
      const revierte = ultimo?.id === pago.id && dia(c.facturaEn) === dia(pago.siguienteCobro);
      await tx.pagoCuentaServicio.update({
        where: { id: pagoId },
        data: { anuladoEn: new Date(), anuladoPorId: auth.usuario.id, motivoAnulacion: motivo },
      });
      if (revierte) {
        await tx.cuentaServicio.update({
          where: { id: cuentaId },
          data: { facturaEn: pago.facturaCubierta },
        });
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cuenta_servicio.pago_anulado',
          entidad: 'cuenta_servicio',
          entidadId: cuentaId,
          antes: { pagoId, montoUsd: dec2(pago.montoUsd), facturaEn: dia(c.facturaEn) },
          despues: {
            motivo,
            facturaEn: revierte ? dia(pago.facturaCubierta) : dia(c.facturaEn),
          },
          cliente,
        },
        tx,
      );
      return this.pagos(cuentaId, tx);
    });
  }

  /** Cobros del proveedor atrasados y los de los próximos `dias` días. */
  async porPagar(dias: number, ahora = new Date()): Promise<PorPagar> {
    const hoy = fechaCaracas(ahora);
    const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) + dias * DIA_MS);
    const filas = await this.prisma.cuentaServicio.findMany({
      where: {
        estado: { in: ['activa', 'caida'] },
        costoUsd: { gt: 0 },
        facturaEn: { not: null, lte: limite },
      },
      select: {
        id: true,
        pista: true,
        proveedor: true,
        costoUsd: true,
        facturaEn: true,
        metodoPago: true,
        servicio: { select: { id: true, nombre: true } },
      },
      orderBy: [{ facturaEn: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const atrasadas: CuentaPorPagar[] = [];
    const proximas: CuentaPorPagar[] = [];
    let atrasado = CERO;
    let proximo = CERO;
    for (const f of filas) {
      const facturaEn = dia(f.facturaEn)!;
      const item: CuentaPorPagar = {
        cuenta: { id: f.id, pista: f.pista, servicio: f.servicio, proveedor: f.proveedor },
        costoUsd: dec2(f.costoUsd),
        facturaEn,
        dias: diasEntre(hoy, facturaEn),
        metodoPago: f.metodoPago,
      };
      if (item.dias < 0) {
        atrasadas.push(item);
        atrasado = atrasado.add(f.costoUsd);
      } else {
        proximas.push(item);
        proximo = proximo.add(f.costoUsd);
      }
    }
    return {
      atrasadas,
      proximas,
      totalAtrasadoUsd: atrasado.toFixed(2),
      totalProximoUsd: proximo.toFixed(2),
    };
  }

  async balance(e: BalanceEntrada, ahora = new Date()): Promise<BalancePeriodo> {
    const hoy = fechaCaracas(ahora);
    const desde = e.desde ?? `${hoy.slice(0, 7)}-01`;
    const hasta = e.hasta ?? hoy;
    if (desde > hasta) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'La fecha inicial va antes que la final.', {
        desde: ['Elige un día anterior o igual al final.'],
      });
    }
    if (diasEntre(desde, hasta) >= MAX_DIAS_BALANCE) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El período puede tener hasta un año.', {
        hasta: ['Acorta el período.'],
      });
    }
    const inicio = inicioDe(desde);
    const fin = new Date(inicioDe(hasta).getTime() + DIA_MS);

    const [ventas, reembolsos, revendedores, costos, porCobrar, cuentas, activas, porPagar] =
      await Promise.all([
        // Como en Métricas: lo facturado de cada pago confirmado en el período.
        this.prisma.$queryRaw<{ n: number; usd: Prisma.Decimal | null }[]>`
          SELECT COUNT(*)::int AS n, SUM(f.total_usd) AS usd
          FROM pagos p JOIN facturas f ON f.id = p.factura_id
          WHERE p.estado = 'confirmado' AND p.revisado_en >= ${inicio} AND p.revisado_en < ${fin}`,
        // El reembolso va en la moneda del pago: se pasa a USD con la proporción de su factura.
        this.prisma.$queryRaw<{ usd: Prisma.Decimal | null }[]>`
          SELECT SUM(ROUND(r.monto * f.total_usd / f.total, 2)) AS usd
          FROM reembolsos r JOIN pagos p ON p.id = r.pago_id JOIN facturas f ON f.id = p.factura_id
          WHERE r.estado = 'completado' AND f.total > 0
            AND r.completado_en >= ${inicio} AND r.completado_en < ${fin}`,
        this.prisma.compraRevendedor.aggregate({
          where: { estado: 'completada', creadoEn: { gte: inicio, lt: fin } },
          _sum: { precioUsd: true },
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<
          { servicio_id: string; nombre: string; usd: Prisma.Decimal; n: number }[]
        >`
          SELECT s.id AS servicio_id, s.nombre, SUM(pc.monto_usd) AS usd, COUNT(*)::int AS n
          FROM pagos_cuenta_servicio pc
          JOIN cuentas_servicio c ON c.id = pc.cuenta_id
          JOIN servicios s ON s.id = c.servicio_id
          WHERE pc.anulado_en IS NULL
            AND pc.pagado_el >= ${desde}::date AND pc.pagado_el <= ${hasta}::date
          GROUP BY s.id, s.nombre
          ORDER BY usd DESC, s.nombre ASC`,
        this.prisma.factura.aggregate({
          where: { estado: 'emitida' },
          _sum: { totalUsd: true },
          _count: { _all: true },
        }),
        this.prisma.cuentaServicio.findMany({
          where: { estado: 'activa' },
          select: { costoUsd: true, cicloMeses: true },
        }),
        this.prisma.suscripcion.findMany({
          where: { estado: { in: ['activa', 'en_gracia'] } },
          select: {
            plan: { select: { precioUsd: true, duracionCantidad: true, duracionUnidad: true } },
          },
        }),
        this.porPagar(7, ahora),
      ]);
    const vencidas = await this.prisma.factura.count({
      where: { estado: 'emitida', venceEn: { lt: ahora } },
    });

    const ventasUsd = D(ventas[0]?.usd ?? 0);
    const reembolsosUsd = D(reembolsos[0]?.usd ?? 0);
    const revendedoresUsd = D(revendedores._sum.precioUsd ?? 0);
    const costosUsd = costos.reduce((s: Dec, f) => s.add(f.usd), CERO);
    const costoMensual = cuentas.reduce((s: Dec, c) => s.add(c.costoUsd.div(c.cicloMeses)), CERO);
    const mrr = activas.reduce((s: Dec, a) => s.add(mensualUsd(a.plan)), CERO);

    return {
      desde,
      hasta,
      ventasClientesUsd: ventasUsd.toFixed(2),
      pagosClientes: ventas[0]?.n ?? 0,
      ventasRevendedoresUsd: revendedoresUsd.toFixed(2),
      comprasRevendedores: revendedores._count._all,
      reembolsosUsd: reembolsosUsd.toFixed(2),
      costosProveedorUsd: costosUsd.toFixed(2),
      pagosProveedor: costos.reduce((s, f) => s + f.n, 0),
      netoUsd: ventasUsd.add(revendedoresUsd).sub(reembolsosUsd).sub(costosUsd).toFixed(2),
      costosPorServicio: costos.map((f) => ({
        servicio: { id: f.servicio_id, nombre: f.nombre },
        montoUsd: D(f.usd).toFixed(2),
        pagos: f.n,
      })),
      porCobrar: {
        facturas: porCobrar._count._all,
        vencidas,
        totalUsd: D(porCobrar._sum.totalUsd ?? 0).toFixed(2),
      },
      porPagar,
      costoMensualCuentasUsd: costoMensual.toFixed(2),
      ingresoMensualRecurrenteUsd: mrr.toFixed(2),
    };
  }
}

function publico(p: FilaPago, revierteCobro: boolean): PagoCuentaPublico {
  return {
    id: p.id,
    montoUsd: dec2(p.montoUsd),
    pagadoEl: dia(p.pagadoEl)!,
    facturaCubierta: dia(p.facturaCubierta),
    siguienteCobro: dia(p.siguienteCobro)!,
    metodoPago: p.metodoPago,
    nota: p.nota,
    registradoPor: p.registradoPor,
    creadoEn: p.creadoEn.toISOString(),
    anulacion: p.anuladoEn
      ? { en: p.anuladoEn.toISOString(), por: p.anuladoPor, motivo: p.motivoAnulacion ?? '' }
      : null,
    revierteCobro,
  };
}
