import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { CorreoBinance, IntentoPago, PrismaClient } from '@nv/db';
import {
  CATEGORIAS_ENTREGA_AUTOMATICA_BINANCE,
  INFO_CATEGORIA,
  esCategoriaServicio,
} from '@nv/shared';
import { ENTORNO, PRISMA } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import type {
  AdaptadorPasarela,
  DatosCrearPago,
  ResultadoPago,
  ResultadoReembolso,
  VerificacionWebhook,
} from '../adaptador.js';

/** Margen antes del inicio del intento en el que se acepta la hora del pago en Binance. */
const MARGEN_PREVIO_MS = 10 * 60_000;
/** Cada cuánto se vuelve a mirar en la base si el buzón de Binance sigue listo. */
const REFRESCO_MS = 60_000;

const AUTOMATICAS = CATEGORIAS_ENTREGA_AUTOMATICA_BINANCE as readonly string[];

/**
 * Binance Pay entre usuarios. Binance no tiene API para esto: el cliente paga
 * desde su app, dice con qué usuario pagó y cuánto envió, y NV lo confirma con
 * el correo «Pago recibido correctamente» que Binance envía (firmado con DKIM).
 * La lectura del buzón la hace CorreosBinanceService; aquí solo se empareja un
 * correo ya validado con su intento y se informa el resultado al núcleo.
 */
@Injectable()
export class AdaptadorBinance implements AdaptadorPasarela, OnModuleInit {
  readonly pasarela = 'binance' as const;
  readonly modo = 'produccion' as const;
  private readonly logger = new Logger('Binance');
  private lista = false;
  private revisadoEn = 0;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refrescar();
  }

  /** Lista si el buzón está activo y se probó con éxito. Se refresca sola cada minuto. */
  configurada(): boolean {
    if (Date.now() - this.revisadoEn > REFRESCO_MS) void this.refrescar();
    return this.lista;
  }

  async refrescar(): Promise<boolean> {
    try {
      const c = await this.prisma.configBinance.findUnique({ where: { id: 1 } });
      this.lista = !!c && c.activo && c.probadoEn !== null;
    } catch (e) {
      this.logger.warn(`No se pudo leer la configuración de Binance: ${String(e)}`);
    }
    this.revisadoEn = Date.now();
    return this.lista;
  }

  async crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }> {
    const url = new URL('/cuenta/pagos/binance', this.entorno.WEB_ORIGEN);
    url.searchParams.set('intento', e.idInterno);
    return { idExterno: `binance-${e.idInterno}`, urlPago: url.toString() };
  }

  confirmarRetorno(idExterno: string): Promise<ResultadoPago> {
    return this.consultarPago(idExterno);
  }

  async consultarPago(idExterno: string): Promise<ResultadoPago> {
    const i = await this.prisma.intentoPago.findUnique({
      where: { pasarela_idExterno: { pasarela: 'binance', idExterno } },
    });
    if (!i) return pendiente();
    const correo =
      (await this.prisma.correoBinance.findUnique({ where: { intentoId: i.id } })) ??
      (await this.vincular(i));
    if (!correo?.monto) return pendiente();
    const revision = await this.motivoRevision(i.facturaId);
    return {
      estado: 'aprobado',
      idCobro: correo.id,
      montoRecibido: correo.monto.toFixed(2),
      moneda: 'USD',
      ...(revision ? { revisionManual: revision } : {}),
    };
  }

  /**
   * Busca un correo libre que coincida con lo que declaró el cliente (mismo
   * usuario sin importar mayúsculas, monto exacto en USDT, pagado después de
   * iniciar el intento) y lo reserva para él. Un correo solo sirve a un intento.
   */
  async vincular(i: IntentoPago): Promise<CorreoBinance | null> {
    if (!i.declaradoEn || !i.pagadorDeclarado || !i.montoDeclarado || i.pagoId) return null;
    const candidatos = await this.prisma.correoBinance.findMany({
      where: {
        estado: 'libre',
        intentoId: null,
        moneda: 'USDT',
        monto: i.montoDeclarado,
        remitente: { equals: i.pagadorDeclarado.trim(), mode: 'insensitive' },
        pagadoEn: { gte: new Date(i.creadoEn.getTime() - MARGEN_PREVIO_MS) },
      },
      orderBy: { pagadoEn: 'asc' },
      take: 5,
    });
    for (const c of candidatos) {
      const r = await this.prisma.correoBinance.updateMany({
        where: { id: c.id, estado: 'libre', intentoId: null },
        data: { estado: 'usado', intentoId: i.id },
      });
      if (r.count === 1) return { ...c, estado: 'usado', intentoId: i.id };
    }
    return null;
  }

  /** Solo streaming, música, IA y software se entregan solos; lo demás lo revisa el equipo. */
  private async motivoRevision(facturaId: string): Promise<string | null> {
    const f = await this.prisma.factura.findUnique({
      where: { id: facturaId },
      select: {
        lineas: {
          select: { plan: { select: { servicio: { select: { nombre: true, categoria: true } } } } },
        },
        suscripcion: {
          select: { plan: { select: { servicio: { select: { nombre: true, categoria: true } } } } },
        },
      },
    });
    if (!f) return null;
    const servicios = [
      ...f.lineas.map((l) => l.plan?.servicio),
      f.suscripcion?.plan.servicio,
    ].filter((s) => s !== undefined && s !== null);
    const fuera = servicios.filter((s) => !s.categoria || !AUTOMATICAS.includes(s.categoria));
    if (fuera.length === 0) return null;
    const nombres = [
      ...new Set(
        fuera.map((s) =>
          s.categoria && esCategoriaServicio(s.categoria)
            ? `${s.nombre} (${INFO_CATEGORIA[s.categoria].nombre})`
            : `${s.nombre} (sin categoría)`,
        ),
      ),
    ];
    return `Pago por Binance confirmado. ${nombres.join(', ')} no se entrega solo: revísalo y entrégalo.`;
  }

  async cobrarConMetodo(): Promise<ResultadoPago> {
    return {
      estado: 'rechazado',
      idCobro: null,
      montoRecibido: null,
      moneda: null,
      metodoInvalido: true,
      mensaje: 'Binance no admite cobros automáticos.',
    };
  }

  async reembolsar(): Promise<ResultadoReembolso> {
    return {
      estado: 'fallido',
      idReembolso: null,
      mensaje: 'Las devoluciones por Binance se hacen a mano desde tu app de Binance.',
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
