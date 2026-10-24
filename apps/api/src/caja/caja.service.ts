import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type {
  CajaDia,
  CerrarCajaEntrada,
  CierreCajaPublico,
  Moneda,
  MovimientoCaja,
  TotalCaja,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { DESFASE_CARACAS_MS, DIA_MS, fechaCaracas } from '../automatizaciones/horario.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D, type Dec } from '../dinero/dinero.js';

/** Evita que dos personas cierren el mismo día a la vez con la misma secuencia. */
const BLOQUEO_CAJA = 0x4e56_4341; // "NVCA"

interface Movimiento extends Omit<MovimientoCaja, 'monto' | 'en'> {
  monto: Dec;
  en: Date;
}

/** Medianoche de Caracas del día «AAAA-MM-DD», como instante UTC. */
const inicioDe = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) - DESFASE_CARACAS_MS);

function totalesDe(movs: Movimiento[]): TotalCaja[] {
  const grupos = new Map<string, { moneda: Moneda; metodo: string | null; monto: Dec; cantidad: number }>();
  for (const m of movs) {
    const clave = `${m.moneda}\u0000${m.metodo ?? ''}`;
    const g = grupos.get(clave) ?? { moneda: m.moneda, metodo: m.metodo, monto: D(0), cantidad: 0 };
    g.monto = g.monto.add(m.monto);
    g.cantidad += 1;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .sort(
      (a, b) =>
        a.moneda.localeCompare(b.moneda) || (a.metodo ?? '').localeCompare(b.metodo ?? '', 'es'),
    )
    .map((g) => ({ ...g, monto: g.monto.toFixed(2) }));
}

const publico = (m: Movimiento): MovimientoCaja => ({
  ...m,
  monto: m.monto.toFixed(2),
  en: m.en.toISOString(),
});

@Injectable()
export class CajaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** El día pedido (hoy si no se indica); nunca uno futuro. */
  private validarDia(dia: string | undefined, ahora: Date): string {
    const hoy = fechaCaracas(ahora);
    const d = dia ?? hoy;
    if (d > hoy) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'La caja de un día futuro todavía no existe.', {
        dia: ['Elige hoy o un día anterior.'],
      });
    }
    return d;
  }

  /**
   * Dinero que entró (o salió) entre `desde` y `hasta`, con lo que ya registra
   * NV Streaming. Los pagos con saldo de la billetera no cuentan: ese dinero
   * ya entró con la recarga.
   */
  private async movimientos(desde: Date, hasta: Date): Promise<Movimiento[]> {
    const rango = { gte: desde, lt: hasta };
    const persona = { select: { id: true, nombre: true } } as const;
    const [pagos, recargas, recargasRev, reembolsos] = await Promise.all([
      this.prisma.pago.findMany({
        where: {
          estado: { in: ['confirmado', 'reembolsado'] },
          origen: { not: 'billetera' },
          revisadoEn: rango,
        },
        include: { cliente: { select: { nombre: true } }, metodoCobro: true, revisadoPor: persona },
      }),
      this.prisma.recargaBilletera.findMany({
        where: { estado: 'confirmada', revisadoEn: rango },
        include: { cliente: { select: { nombre: true } }, metodoCobro: true, revisadoPor: persona },
      }),
      this.prisma.recargaSaldo.findMany({
        where: { estado: 'confirmada', revisadoEn: rango },
        include: {
          revendedor: { select: { nombreComercial: true } },
          metodoCobro: true,
          revisadoPor: persona,
        },
      }),
      this.prisma.reembolso.findMany({
        where: { estado: 'completado', completadoEn: rango },
        include: {
          pago: { include: { cliente: { select: { nombre: true } }, metodoCobro: true } },
          solicitadoPor: persona,
        },
      }),
    ]);
    const lista: Movimiento[] = [
      ...pagos.map((p) => ({
        id: `pago:${p.id}`,
        tipo: 'pago' as const,
        referencia: p.referencia,
        quien: p.cliente.nombre,
        metodo: p.metodoCobro?.nombre ?? p.pasarela,
        moneda: p.moneda,
        monto: p.montoRecibido ?? p.montoDeclarado,
        en: p.revisadoEn!,
        por: p.revisadoPor,
      })),
      ...recargas.map((r) => ({
        id: `recarga_billetera:${r.id}`,
        tipo: 'recarga_billetera' as const,
        referencia: r.referencia,
        quien: r.cliente.nombre,
        metodo: r.metodoCobro.nombre,
        moneda: r.moneda,
        monto: r.montoRecibido ?? r.montoDeclarado,
        en: r.revisadoEn!,
        por: r.revisadoPor,
      })),
      ...recargasRev.map((r) => ({
        id: `recarga_revendedor:${r.id}`,
        tipo: 'recarga_revendedor' as const,
        referencia: r.referencia,
        quien: r.revendedor.nombreComercial,
        metodo: r.metodoCobro.nombre,
        moneda: r.moneda,
        monto: r.montoRecibido ?? r.montoDeclarado,
        en: r.revisadoEn!,
        por: r.revisadoPor,
      })),
      ...reembolsos.map((r) => ({
        id: `reembolso:${r.id}`,
        tipo: 'reembolso' as const,
        referencia: r.pago.referencia,
        quien: r.pago.cliente.nombre,
        metodo: r.pago.metodoCobro?.nombre ?? r.pago.pasarela,
        moneda: r.moneda,
        monto: r.monto.neg(),
        en: r.completadoEn!,
        por: r.solicitadoPor,
      })),
    ];
    return lista.sort((a, b) => a.en.getTime() - b.en.getTime() || a.id.localeCompare(b.id));
  }

  private async cierresDe(dia: string): Promise<CierreCajaPublico[]> {
    const filas = await this.prisma.cierreCaja.findMany({
      where: { dia: new Date(`${dia}T00:00:00Z`) },
      include: { cerradoPor: { select: { id: true, nombre: true } } },
      orderBy: { secuencia: 'asc' },
    });
    return filas.map((c) => ({
      id: c.id,
      dia,
      secuencia: c.secuencia,
      hasta: iso(c.hasta)!,
      totales: c.totales as unknown as TotalCaja[],
      movimientos: c.movimientos,
      notas: c.notas,
      cerradoPor: c.cerradoPor,
    }));
  }

  async caja(diaPedido: string | undefined, ahora = new Date()): Promise<CajaDia> {
    const dia = this.validarDia(diaPedido, ahora);
    const desde = inicioDe(dia);
    const fin = new Date(desde.getTime() + DIA_MS);
    const [movs, cierres] = await Promise.all([
      this.movimientos(desde, fin),
      this.cierresDe(dia),
    ]);
    const ultimo = cierres.at(-1);
    const despues = ultimo ? movs.filter((m) => m.en.getTime() >= Date.parse(ultimo.hasta)) : [];
    return {
      dia,
      hoy: dia === fechaCaracas(ahora),
      movimientos: movs.map(publico),
      totales: totalesDe(movs),
      cierres,
      despuesDelCierre: totalesDe(despues),
      movimientosDespuesDelCierre: despues.length,
    };
  }

  /**
   * Guarda la foto de la caja del día hasta este momento (o hasta el final del
   * día, si ya pasó). Si ya hay un cierre y no entró nada después, no hay nada
   * que cerrar.
   */
  async cerrar(
    auth: ContextoAuth,
    e: CerrarCajaEntrada,
    cliente: InfoCliente,
    ahora = new Date(),
  ): Promise<CierreCajaPublico> {
    const dia = this.validarDia(e.dia, ahora);
    const desde = inicioDe(dia);
    const hasta = new Date(Math.min(ahora.getTime(), desde.getTime() + DIA_MS));
    const fecha = new Date(`${dia}T00:00:00Z`);
    const creado = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BLOQUEO_CAJA}::int, hashtext(${dia}))`;
      const anterior = await tx.cierreCaja.findFirst({
        where: { dia: fecha },
        orderBy: { secuencia: 'desc' },
      });
      const movs = await this.movimientos(desde, hasta);
      if (anterior && !movs.some((m) => m.en.getTime() >= anterior.hasta.getTime())) {
        throw new ErrorApp(
          409,
          'NADA_QUE_CERRAR',
          'La caja de ese día ya está cerrada y no entró nada después del cierre.',
        );
      }
      const totales = totalesDe(movs);
      const c = await tx.cierreCaja.create({
        data: {
          dia: fecha,
          secuencia: (anterior?.secuencia ?? 0) + 1,
          hasta,
          totales: totales as unknown as object[],
          movimientos: movs.length,
          notas: e.notas || null,
          cerradoPorId: auth.usuario.id,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'caja.cerrada',
          entidad: 'cierre_caja',
          entidadId: c.id,
          despues: JSON.parse(
            JSON.stringify({ dia, secuencia: c.secuencia, movimientos: c.movimientos, totales }),
          ),
          cliente,
        },
        tx,
      );
      return c;
    });
    return (await this.cierresDe(dia)).find((c) => c.id === creado.id)!;
  }
}
