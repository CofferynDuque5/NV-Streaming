import { Inject, Injectable } from '@nestjs/common';
import type { Moneda, Prisma, PrismaClient } from '@nv/db';
import type { FacturaDetalle, FacturaPublica, ListarFacturasEntrada, Pagina } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { INCLUIR_PLAN } from '../catalogo/catalogo.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { REGLAS_COBRO } from '@nv/shared';
import { descripcionLinea, FacturacionService } from './facturacion.service.js';
import { facturaDetalle, facturaPublica, INCLUIR_FACTURA, INCLUIR_PAGO } from './presentacion.js';

type Tx = Prisma.TransactionClient;
const DIA_MS = 24 * 3600_000;

@Injectable()
export class FacturasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
  ) {}

  async listar(auth: ContextoAuth, filtro: ListarFacturasEntrada): Promise<Pagina<FacturaPublica>> {
    const where: Prisma.FacturaWhereInput = {
      cliente: alcanceClientes(auth),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.vencidas ? { estado: 'emitida', venceEn: { lt: new Date() } } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.factura.count({ where }),
      this.prisma.factura.findMany({
        where,
        include: INCLUIR_FACTURA,
        orderBy: [{ numero: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((f) => facturaPublica(f)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(auth: ContextoAuth, id: string): Promise<FacturaDetalle> {
    const f = await this.prisma.factura.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: { ...INCLUIR_FACTURA, lineas: true },
    });
    if (!f) throw Errores.noEncontrado('La factura');
    const pagos = await this.prisma.pago.findMany({
      where: { facturaId: id },
      include: INCLUIR_PAGO,
      orderBy: { creadoEn: 'desc' },
    });
    return facturaDetalle(f, pagos, auth.usuario.rol !== 'cliente');
  }

  async anular(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    await this.prisma.$transaction(async (tx) => {
      const f = await this.bloquear(tx, auth, id);
      if (f.estado !== 'emitida') {
        throw new ErrorApp(
          409,
          'FACTURA_NO_ANULABLE',
          f.estado === 'pagada'
            ? 'Una factura pagada no se anula: requiere un reembolso (llega con los cobros automáticos).'
            : 'La factura ya está anulada.',
        );
      }
      await this.exigirSinPagoEnRevision(tx, id);
      await tx.factura.update({
        where: { id },
        data: {
          estado: 'anulada',
          anuladaEn: new Date(),
          motivoAnulacion: motivo,
          anuladaPorId: auth.usuario.id,
        },
      });
      await this.facturacion.liberarCupon(tx, id);
      // Anular el alta deja sin objeto la suscripción que esperaba ese pago.
      if (f.concepto === 'alta' && f.suscripcionId) {
        const s = await tx.suscripcion.findUnique({ where: { id: f.suscripcionId } });
        if (s?.estado === 'pendiente_pago') {
          await tx.suscripcion.update({
            where: { id: s.id },
            data: { estado: 'cancelada', canceladaEn: new Date() },
          });
          await tx.eventoSuscripcion.create({
            data: {
              suscripcionId: s.id,
              tipo: 'cancelacion',
              actorId: auth.usuario.id,
              motivo: `Factura anulada: ${motivo}`,
              datos: { facturaId: id },
            },
          });
        }
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'factura.anulada',
          entidad: 'factura',
          entidadId: id,
          antes: { estado: f.estado, total: f.total.toFixed(2), moneda: f.moneda },
          despues: { estado: 'anulada', motivo },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(auth, id);
  }

  /**
   * Vuelve a calcular una factura emitida con la tasa de hoy, en la misma u
   * otra moneda. Útil cuando la tasa cambió o el cliente prefiere pagar en otra moneda.
   */
  async recotizar(auth: ContextoAuth, id: string, moneda: Moneda, cliente: InfoCliente) {
    await this.prisma.$transaction(async (tx) => {
      const f = await this.bloquear(tx, auth, id);
      if (f.estado !== 'emitida') {
        throw new ErrorApp(
          409,
          'FACTURA_CERRADA',
          'Solo se recalculan facturas pendientes de pago.',
        );
      }
      await this.exigirSinPagoEnRevision(tx, id);
      const linea = await tx.lineaFactura.findFirst({ where: { facturaId: id } });
      const plan = linea?.planId
        ? await tx.plan.findUnique({ where: { id: linea.planId }, include: INCLUIR_PLAN })
        : null;
      if (!linea || !plan)
        throw new ErrorApp(409, 'FACTURA_SIN_PLAN', 'Esta factura no se puede recalcular.');
      const cupon = f.cuponId ? await tx.cupon.findUnique({ where: { id: f.cuponId } }) : null;
      const c = await this.facturacion.calcular(tx, {
        plan,
        moneda,
        concepto: f.concepto,
        cupon: cupon?.codigo ?? null,
        clienteId: f.clienteId,
        cuponYaCanjeado: true,
      });
      await tx.factura.update({
        where: { id },
        data: {
          moneda,
          subtotal: c.subtotal,
          descuento: c.descuento,
          total: c.total,
          tasa: c.tasa,
          totalUsd: c.totalUsd,
          venceEn: new Date(Date.now() + REGLAS_COBRO.diasParaPagar * DIA_MS),
        },
      });
      await tx.lineaFactura.update({
        where: { id: linea.id },
        data: {
          descripcion: descripcionLinea(plan, f.concepto),
          precioUnitario: c.subtotal,
          total: c.subtotal,
        },
      });
      if (f.suscripcionId) {
        await tx.suscripcion.update({ where: { id: f.suscripcionId }, data: { moneda } });
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'factura.recotizada',
          entidad: 'factura',
          entidadId: id,
          antes: { moneda: f.moneda, total: f.total.toFixed(2), tasa: f.tasa.toFixed(6) },
          despues: { moneda, total: c.total.toFixed(2), tasa: c.tasa.toFixed(6) },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(auth, id);
  }

  async bloquear(tx: Tx, auth: ContextoAuth, id: string) {
    const visible = await tx.factura.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('La factura');
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.factura.findUniqueOrThrow({ where: { id } });
  }

  private async exigirSinPagoEnRevision(tx: Tx, facturaId: string) {
    const n = await tx.pago.count({ where: { facturaId, estado: 'en_revision' } });
    if (n > 0) {
      throw new ErrorApp(
        409,
        'PAGO_EN_REVISION',
        'Hay un pago de esta factura en revisión. Confírmalo o recházalo primero.',
      );
    }
  }
}
