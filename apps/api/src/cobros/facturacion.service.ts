import { Inject, Injectable } from '@nestjs/common';
import type { ConceptoFactura, Cupon, Factura, Moneda, Prisma } from '@nv/db';
import { type Cotizacion, REGLAS_COBRO } from '@nv/shared';
import { ErrorApp } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import type { PlanCompleto } from '../catalogo/catalogo.service.js';
import { aUsd, CERO, type Dec, precioEn, redondear } from '../dinero/dinero.js';
import { sinTasa, TasasService } from '../dinero/tasas.service.js';

type Tx = Prisma.TransactionClient;

const DIA_MS = 24 * 3600_000;

const cuponNoValido = (mensaje: string, codigo = 'CUPON_NO_VALIDO') =>
  new ErrorApp(409, codigo, mensaje, { cupon: [mensaje] });

export interface CalculoFactura {
  moneda: Moneda;
  subtotal: Dec;
  descuento: Dec;
  total: Dec;
  tasa: Dec;
  totalUsd: Dec;
  cupon: Cupon | null;
}

/** Precios, descuentos y emisión de facturas. Todo el cálculo ocurre aquí, en el servidor. */
@Injectable()
export class FacturacionService {
  constructor(@Inject(TasasService) private readonly tasas: TasasService) {}

  async calcular(
    tx: Tx,
    e: {
      plan: PlanCompleto;
      moneda: Moneda;
      concepto: ConceptoFactura;
      cupon?: string | null;
      clienteId: string | null;
      /** Al recotizar, el cupón ya está canjeado por esta factura. */
      cuponYaCanjeado?: boolean;
    },
  ): Promise<CalculoFactura> {
    const precio = precioEn(e.plan, e.moneda, await this.tasas.mapa(tx));
    if (!precio) throw sinTasa(e.moneda);
    const subtotal = precio.precio;
    const cupon = e.cupon
      ? await this.validarCupon(tx, e.cupon, e.plan.id, e.concepto, e.clienteId, e.cuponYaCanjeado)
      : null;
    let descuento = CERO;
    if (cupon) {
      descuento =
        cupon.tipo === 'porcentaje'
          ? redondear(subtotal.mul(cupon.valor).div(100), e.moneda)
          : redondear(cupon.valor.mul(precio.tasa), e.moneda);
      if (descuento.gt(subtotal)) descuento = subtotal;
    }
    const total = subtotal.sub(descuento);
    return {
      moneda: e.moneda,
      subtotal,
      descuento,
      total,
      tasa: precio.tasa,
      totalUsd: aUsd(total, precio.tasa),
      cupon,
    };
  }

  cotizacion(c: CalculoFactura): Cotizacion {
    return {
      moneda: c.moneda,
      subtotal: c.subtotal.toFixed(2),
      descuento: c.descuento.toFixed(2),
      total: c.total.toFixed(2),
      cupon: c.cupon?.codigo ?? null,
    };
  }

  /**
   * Emite una factura. Si el total es cero (plan gratuito o cupón del 100 %),
   * nace pagada y quien llama activa o renueva la suscripción.
   */
  async emitir(
    tx: Tx,
    e: {
      clienteId: string;
      suscripcionId: string;
      plan: PlanCompleto;
      moneda: Moneda;
      concepto: ConceptoFactura;
      cupon?: string | null;
      actorId: string | null;
    },
  ): Promise<Factura> {
    const c = await this.calcular(tx, { ...e, clienteId: e.clienteId });
    const ahora = new Date();
    const gratis = c.total.isZero();
    let factura: Factura;
    try {
      factura = await tx.factura.create({
        data: {
          clienteId: e.clienteId,
          suscripcionId: e.suscripcionId,
          concepto: e.concepto,
          estado: gratis ? 'pagada' : 'emitida',
          moneda: c.moneda,
          subtotal: c.subtotal,
          descuento: c.descuento,
          total: c.total,
          tasa: c.tasa,
          totalUsd: c.totalUsd,
          cuponId: c.cupon?.id ?? null,
          venceEn: new Date(ahora.getTime() + REGLAS_COBRO.diasParaPagar * DIA_MS),
          pagadaEn: gratis ? ahora : null,
          creadoPorId: e.actorId,
          lineas: {
            create: {
              planId: e.plan.id,
              descripcion: descripcionLinea(e.plan, e.concepto),
              cantidad: 1,
              precioUnitario: c.subtotal,
              total: c.subtotal,
            },
          },
        },
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(
          409,
          'FACTURA_ABIERTA',
          'Esta suscripción ya tiene una factura pendiente de pago.',
        );
      }
      throw err;
    }
    if (c.cupon) await this.canjear(tx, c.cupon, e.clienteId, factura.id);
    return factura;
  }

  /** Devuelve el uso del cupón de una factura anulada, para que el cliente pueda volver a usarlo. */
  async liberarCupon(tx: Tx, facturaId: string): Promise<void> {
    const canje = await tx.canjeCupon.findUnique({ where: { facturaId } });
    if (!canje) return;
    await tx.canjeCupon.delete({ where: { id: canje.id } });
    await tx.$executeRaw`UPDATE cupones SET usos = usos - 1, actualizado_en = now() WHERE id = ${canje.cuponId}::uuid AND usos > 0`;
  }

  async validarCupon(
    tx: Tx,
    codigo: string,
    planId: string,
    concepto: ConceptoFactura,
    clienteId: string | null,
    yaCanjeado = false,
  ): Promise<Cupon> {
    const cupon = await tx.cupon.findUnique({
      where: { codigo: codigo.toUpperCase() },
      include: { planes: { select: { planId: true } } },
    });
    const ahora = new Date();
    if (!cupon || !cupon.activo) throw cuponNoValido('Ese cupón no existe o ya no está activo.');
    if (cupon.validoDesde && cupon.validoDesde > ahora)
      throw cuponNoValido('Ese cupón todavía no está vigente.');
    if (cupon.validoHasta && cupon.validoHasta < ahora) throw cuponNoValido('Ese cupón ya venció.');
    if (!yaCanjeado && cupon.usosMaximos !== null && cupon.usos >= cupon.usosMaximos)
      throw cuponNoValido('Ese cupón ya se agotó.', 'CUPON_AGOTADO');
    if (cupon.planes.length > 0 && !cupon.planes.some((p) => p.planId === planId))
      throw cuponNoValido('Ese cupón no aplica a este plan.');
    if (cupon.soloAltas && concepto === 'renovacion')
      throw cuponNoValido('Ese cupón solo vale para contrataciones nuevas.');
    if (clienteId && !yaCanjeado) {
      const usado = await tx.canjeCupon.findUnique({
        where: { cuponId_clienteId: { cuponId: cupon.id, clienteId } },
      });
      if (usado) throw cuponNoValido('Ya usaste este cupón.', 'CUPON_YA_USADO');
    }
    return cupon;
  }

  private async canjear(tx: Tx, cupon: Cupon, clienteId: string, facturaId: string) {
    // Incremento condicional: dos canjes simultáneos no pueden superar el máximo.
    const n = await tx.$executeRaw`UPDATE cupones SET usos = usos + 1, actualizado_en = now()
      WHERE id = ${cupon.id}::uuid AND activo AND (usos_maximos IS NULL OR usos < usos_maximos)`;
    if (n === 0) throw cuponNoValido('Ese cupón ya se agotó.', 'CUPON_AGOTADO');
    try {
      await tx.canjeCupon.create({ data: { cuponId: cupon.id, clienteId, facturaId } });
    } catch (err) {
      if (esUnicoDuplicado(err)) throw cuponNoValido('Ya usaste este cupón.', 'CUPON_YA_USADO');
      throw err;
    }
  }
}

export function descripcionLinea(
  plan: Pick<PlanCompleto, 'nombre' | 'duracionCantidad' | 'duracionUnidad'> & {
    servicio: { nombre: string };
  },
  concepto: ConceptoFactura,
): string {
  const unidad =
    plan.duracionUnidad === 'mes'
      ? plan.duracionCantidad === 1
        ? 'mes'
        : 'meses'
      : plan.duracionCantidad === 1
        ? 'día'
        : 'días';
  const prefijo = concepto === 'renovacion' ? 'Renovación' : 'Alta';
  return `${prefijo}: ${plan.servicio.nombre} · ${plan.nombre} (${plan.duracionCantidad} ${unidad})`.slice(
    0,
    200,
  );
}
