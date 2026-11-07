import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type { BalanceEntrada, BalancePeriodo } from '@nv/shared';
import { DESFASE_CARACAS_MS, DIA_MS, fechaCaracas } from '../automatizaciones/horario.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { D } from '../dinero/dinero.js';

/** Un año como máximo por consulta de balance. */
const MAX_DIAS_BALANCE = 366;

/** Medianoche de Caracas del día «AAAA-MM-DD», como instante UTC. */
const inicioDe = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - DESFASE_CARACAS_MS);
/** Días entre dos fechas «AAAA-MM-DD» (b − a). */
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA_MS);

/** Balance del negocio: ventas, reembolsos y lo que hoy está por cobrar. */
@Injectable()
export class BalanceService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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

    const [ventas, reembolsos, revendedores, porCobrar, vencidas] = await Promise.all([
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
      this.prisma.factura.aggregate({
        where: { estado: 'emitida' },
        _sum: { totalUsd: true },
        _count: { _all: true },
      }),
      this.prisma.factura.count({ where: { estado: 'emitida', venceEn: { lt: ahora } } }),
    ]);

    const ventasUsd = D(ventas[0]?.usd ?? 0);
    const reembolsosUsd = D(reembolsos[0]?.usd ?? 0);
    const revendedoresUsd = D(revendedores._sum.precioUsd ?? 0);

    return {
      desde,
      hasta,
      ventasClientesUsd: ventasUsd.toFixed(2),
      pagosClientes: ventas[0]?.n ?? 0,
      ventasRevendedoresUsd: revendedoresUsd.toFixed(2),
      comprasRevendedores: revendedores._count._all,
      reembolsosUsd: reembolsosUsd.toFixed(2),
      netoUsd: ventasUsd.add(revendedoresUsd).sub(reembolsosUsd).toFixed(2),
      porCobrar: {
        facturas: porCobrar._count._all,
        vencidas,
        totalUsd: D(porCobrar._sum.totalUsd ?? 0).toFixed(2),
      },
    };
  }
}
