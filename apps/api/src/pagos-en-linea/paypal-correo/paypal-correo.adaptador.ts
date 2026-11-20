import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { CorreoPaypal, IntentoPago, PrismaClient } from '@nv/db';
import { ENTORNO, PRISMA } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import type {
  AdaptadorPasarela,
  DatosCrearPago,
  ResultadoPago,
  ResultadoReembolso,
  VerificacionWebhook,
} from '../adaptador.js';
import { motivoRevisionEntrega } from '../entrega-automatica.js';
import { mismoNombre } from './correo-paypal.js';

/** Margen antes del inicio del intento en el que se acepta la hora del aviso. */
const MARGEN_PREVIO_MS = 10 * 60_000;
const REFRESCO_MS = 60_000;
/** Ventana en la que se buscan otros pagos parecidos (mismo nombre y monto) antes de emparejar por nombre. */
const DIAS_AMBIGUEDAD = 7;

/**
 * PayPal con cuenta personal. Sin API: el cliente paga desde su PayPal y NV lo
 * confirma con el aviso «Ha recibido un pago» firmado por paypal.com. Se empareja
 * primero por la referencia de NV escrita en la nota (L-XXXXXXXX) y, si no la trae, por
 * el nombre del pagador y el monto exacto. El Id. de transacción del cliente no
 * sirve: PayPal le da uno distinto al que ve la tienda.
 */
@Injectable()
export class AdaptadorPaypalCorreo implements AdaptadorPasarela, OnModuleInit {
  readonly pasarela = 'paypal_correo' as const;
  readonly modo = 'produccion' as const;
  private readonly logger = new Logger('PayPalCorreo');
  private lista = false;
  private revisadoEn = 0;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refrescar();
  }

  configurada(): boolean {
    if (Date.now() - this.revisadoEn > REFRESCO_MS) void this.refrescar();
    return this.lista;
  }

  async refrescar(): Promise<boolean> {
    try {
      const c = await this.prisma.configPaypalCorreo.findUnique({ where: { id: 1 } });
      this.lista = !!c && c.activo && c.probadoEn !== null;
    } catch (e) {
      this.logger.warn(`No se pudo leer la configuración de PayPal: ${String(e)}`);
    }
    this.revisadoEn = Date.now();
    return this.lista;
  }

  async crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }> {
    const url = new URL('/cuenta/pagos/paypal', this.entorno.WEB_ORIGEN);
    url.searchParams.set('intento', e.idInterno);
    return { idExterno: `paypal-correo-${e.idInterno}`, urlPago: url.toString() };
  }

  confirmarRetorno(idExterno: string): Promise<ResultadoPago> {
    return this.consultarPago(idExterno);
  }

  async consultarPago(idExterno: string): Promise<ResultadoPago> {
    const i = await this.prisma.intentoPago.findUnique({
      where: { pasarela_idExterno: { pasarela: 'paypal_correo', idExterno } },
    });
    if (!i) return pendiente();
    const correo =
      (await this.prisma.correoPaypal.findUnique({ where: { intentoId: i.id } })) ??
      (await this.vincular(i));
    if (!correo?.monto) return pendiente();
    const revision = await motivoRevisionEntrega(this.prisma, i.facturaId, 'PayPal');
    return {
      estado: 'aprobado',
      idCobro: `paypal-correo-${correo.idTransaccion ?? correo.id}`,
      montoRecibido: correo.monto.toFixed(2),
      moneda: 'USD',
      ...(revision ? { revisionManual: revision } : {}),
    };
  }

  /**
   * Reserva para el intento un aviso libre que le corresponda: el que trae su
   * referencia en la nota o, si el cliente ya dijo a nombre de quién pagó, uno sin
   * referencia con ese nombre y el monto exacto. Si hay otro pago abierto con el
   * mismo nombre y monto, no adivina: lo deja para el equipo.
   */
  async vincular(i: IntentoPago): Promise<CorreoPaypal | null> {
    if (i.pagoId) return null;
    const porReferencia = await this.prisma.correoPaypal.findMany({
      where: { estado: 'libre', intentoId: null, moneda: 'USD', referencia: i.referencia },
      orderBy: { recibidoEn: 'asc' },
      take: 3,
    });
    const reservado = await this.reservar(porReferencia, i.id);
    if (reservado) return reservado;

    if (!i.declaradoEn || !i.pagadorDeclarado) return null;
    const candidatos = (
      await this.prisma.correoPaypal.findMany({
        where: {
          estado: 'libre',
          intentoId: null,
          moneda: 'USD',
          referencia: null,
          monto: i.monto,
          pagadoEn: { gte: new Date(i.creadoEn.getTime() - MARGEN_PREVIO_MS) },
        },
        orderBy: { pagadoEn: 'asc' },
        take: 20,
      })
    ).filter((c) => mismoNombre(c.pagador, i.pagadorDeclarado));
    if (candidatos.length === 0) return null;
    const parecidos = (
      await this.prisma.intentoPago.findMany({
        where: {
          id: { not: i.id },
          pasarela: 'paypal_correo',
          pagoId: null,
          monto: i.monto,
          declaradoEn: { not: null, gte: new Date(Date.now() - DIAS_AMBIGUEDAD * 86_400_000) },
        },
        select: { pagadorDeclarado: true },
      })
    ).filter((o) => mismoNombre(o.pagadorDeclarado, i.pagadorDeclarado));
    if (parecidos.length > 0) return null;
    return this.reservar(candidatos, i.id);
  }

  private async reservar(correos: CorreoPaypal[], intentoId: string) {
    for (const c of correos) {
      const r = await this.prisma.correoPaypal.updateMany({
        where: { id: c.id, estado: 'libre', intentoId: null },
        data: { estado: 'usado', intentoId },
      });
      if (r.count === 1) return { ...c, estado: 'usado', intentoId };
    }
    return null;
  }

  async cobrarConMetodo(): Promise<ResultadoPago> {
    return {
      estado: 'rechazado',
      idCobro: null,
      montoRecibido: null,
      moneda: null,
      metodoInvalido: true,
      mensaje: 'PayPal personal no admite cobros automáticos.',
    };
  }

  async reembolsar(): Promise<ResultadoReembolso> {
    return {
      estado: 'fallido',
      idReembolso: null,
      mensaje: 'Las devoluciones por PayPal se hacen a mano desde tu cuenta de PayPal.',
    };
  }

  async verificarWebhook(): Promise<VerificacionWebhook> {
    return { valido: false };
  }
}

const pendiente = (): ResultadoPago => ({
  estado: 'pendiente',
  idCobro: null,
  montoRecibido: null,
  moneda: null,
});
