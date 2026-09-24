import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Factura, PrismaClient, Suscripcion } from '@nv/db';
import { formatearMonto, REGLAS_COBRO } from '@nv/shared';
import { NotificacionesService, type ResultadoAviso } from '../../avisos/notificaciones.service.js';
import { numeroFactura } from '../../comun/formato.js';
import { PRISMA } from '../../comun/tokens.js';
import { CorreoService } from '../../correo/correo.service.js';
import { Plantillas } from '../../correo/plantillas.js';
import { SuscripcionesService } from '../../suscripciones/suscripciones.service.js';
import {
  type ConfigAutomatizacion,
  ConfigAutomatizacionesService,
} from '../configuracion.service.js';
import { DIA_MS, fechaLarga, inicioDiaCaracas } from '../horario.js';
import { mensajeError, plural, Recuento, type ResultadoTarea } from '../recuento.js';
import { TRABAJO } from '../trabajos.js';
import { TrabajosService } from '../trabajos.service.js';

/** Suscripciones a las que NV avisa y cobra: sin revendedor de por medio. */
const SIN_REVENDEDOR = {
  revendedorId: null,
  cliente: { revendedorId: null, estado: 'activo' },
} as const;

const INCLUIR_PLAN = { plan: { include: { servicio: { select: { nombre: true } } } } } as const;

type AvisoSuscripcion = 'aviso_gracia' | 'aviso_suspension' | 'aviso_recuperacion';
const ESTADO_ESPERADO: Record<AvisoSuscripcion, Suscripcion['estado']> = {
  aviso_gracia: 'en_gracia',
  aviso_suspension: 'suspendida',
  aviso_recuperacion: 'activa',
};

const nombreServicio = (s: { plan: { nombre: string; servicio: { nombre: string } } }) =>
  `${s.plan.servicio.nombre} · ${s.plan.nombre}`;

/** Automatizaciones dirigidas a los clientes: recordatorios, renovaciones y avisos de estado. */
@Injectable()
export class TareasClientesService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.avisoSuscripcion, async (carga) => {
      await this.avisoSuscripcion(
        String(carga['automatizacion']) as AvisoSuscripcion,
        String(carga['suscripcionId']),
      );
    });
  }

  /** Recordatorio N días antes del vencimiento (día del calendario de Venezuela). */
  async recordatorios(
    config: ConfigAutomatizacion<'recordatorio_vencimiento'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    for (const dias of config.parametros.diasAntes) {
      const subs = await this.prisma.suscripcion.findMany({
        where: {
          ...SIN_REVENDEDOR,
          estado: 'activa',
          cancelarAlVencer: false,
          venceEn: { gte: inicioDiaCaracas(ahora, dias), lt: inicioDiaCaracas(ahora, dias + 1) },
        },
        include: {
          ...INCLUIR_PLAN,
          facturas: { where: { estado: 'emitida' }, select: { id: true }, take: 1 },
        },
        orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
        take: 2000,
      });
      for (const s of subs) {
        try {
          const venceEn = s.venceEn!;
          const factura = s.facturas[0];
          const url = this.correo.urlWeb(factura ? `/cuenta/facturas/${factura.id}` : '/cuenta');
          const servicio = nombreServicio(s);
          r.aviso(
            await this.avisos.avisar({
              plantilla: 'recordatorioVencimiento',
              destinatario: { clienteId: s.clienteId },
              claveUnica: `recordatorio:${s.id}:${venceEn.toISOString()}:${dias}`,
              automatizacion: 'recordatorio_vencimiento',
              canales: config.canales,
              entidad: { tipo: 'suscripcion', id: s.id },
              contenido: (nombre) => ({
                correo: Plantillas.recordatorioVencimiento(
                  nombre,
                  servicio,
                  fechaLarga(venceEn),
                  dias,
                  url,
                  Boolean(factura),
                ),
                whatsapp: [nombre, servicio, fechaLarga(venceEn), url],
              }),
            }),
          );
        } catch (e) {
          r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
        }
      }
    }
    return r.resultado(resumenAvisos(r, 'recordatorio enviado', 'recordatorios enviados'));
  }

  /**
   * Emite la factura de renovación de las suscripciones que vencen en los
   * próximos días y no tienen una abierta, con las mismas reglas que una
   * renovación manual, y envía las instrucciones de pago. Repetirla no emite
   * ni avisa dos veces.
   */
  async renovaciones(
    config: ConfigAutomatizacion<'factura_renovacion'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    let emitidas = 0;
    const subs = await this.prisma.suscripcion.findMany({
      where: {
        ...SIN_REVENDEDOR,
        estado: 'activa',
        cancelarAlVencer: false,
        plan: { renovable: true, activo: true },
        venceEn: { lt: inicioDiaCaracas(ahora, config.parametros.diasAntes + 1) },
      },
      include: INCLUIR_PLAN,
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    for (const s of subs) {
      try {
        const { factura, nueva } = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${s.id}::uuid FOR UPDATE`;
          const actual = await tx.suscripcion.findUniqueOrThrow({ where: { id: s.id } });
          if (actual.estado !== 'activa' || actual.cancelarAlVencer) {
            return { factura: null, nueva: false };
          }
          const abierta = await tx.factura.findFirst({
            where: { suscripcionId: s.id, estado: 'emitida' },
          });
          if (abierta) {
            // Solo se avisa de las que emitió el sistema (p. ej. si el aviso no llegó a salir).
            const propia = abierta.creadoPorId === null && abierta.concepto === 'renovacion';
            return { factura: propia ? abierta : null, nueva: false };
          }
          const f = await this.suscripciones.facturarRenovacion(tx, actual, actual.moneda, null);
          return { factura: f, nueva: true };
        });
        if (nueva) emitidas += 1;
        if (!factura || factura.estado !== 'emitida') {
          if (nueva) r.procesados += 1;
          else r.omitidos += 1;
          continue;
        }
        const aviso = await this.avisarFactura(
          s.clienteId,
          nombreServicio(s),
          factura,
          config.canales,
        );
        if (aviso.fallidas > 0) r.errores += 1;
        else if (nueva || aviso.enviadas > 0) r.procesados += 1;
        else r.omitidos += 1;
      } catch (e) {
        r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
      }
    }
    const partes = [plural(emitidas, 'factura emitida', 'facturas emitidas')];
    if (r.omitidos) partes.push(plural(r.omitidos, 'omitida', 'omitidas'));
    if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
    return r.resultado(`${partes.join(', ')}.`);
  }

  private async avisarFactura(
    clienteId: string,
    servicio: string,
    f: Factura,
    canales: ConfigAutomatizacion['canales'],
  ): Promise<ResultadoAviso> {
    const metodos = await this.prisma.metodoCobro.findMany({
      where: { moneda: f.moneda, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: { nombre: true, instrucciones: true },
    });
    const url = this.correo.urlWeb(`/cuenta/facturas/${f.id}`);
    const numero = numeroFactura(f.numero);
    const total = formatearMonto(f.total.toFixed(2), f.moneda);
    return this.avisos.avisar({
      plantilla: 'facturaRenovacion',
      destinatario: { clienteId },
      claveUnica: `factura_renovacion:${f.id}`,
      automatizacion: 'factura_renovacion',
      canales,
      entidad: { tipo: 'factura', id: f.id },
      contenido: (nombre) => ({
        correo: Plantillas.facturaRenovacion(
          nombre,
          servicio,
          numero,
          total,
          fechaLarga(f.venceEn),
          metodos,
          url,
        ),
        whatsapp: [nombre, servicio, numero, total, url],
      }),
    });
  }

  /** Aviso por un cambio de estado (gracia, suspensión o reactivación). Lo encola la transición. */
  async avisoSuscripcion(
    tipo: AvisoSuscripcion,
    suscripcionId: string,
  ): Promise<ResultadoAviso | null> {
    if (!(tipo in ESTADO_ESPERADO)) throw new Error(`Aviso de suscripción desconocido: ${tipo}`);
    const config = await this.config.leer(tipo);
    if (!config.activa) return null;
    const s = await this.prisma.suscripcion.findUnique({
      where: { id: suscripcionId },
      include: {
        ...INCLUIR_PLAN,
        facturas: {
          where: { estado: 'emitida' },
          select: { id: true },
          orderBy: { creadoEn: 'desc' },
          take: 1,
        },
      },
    });
    // Si el estado ya cambió (p. ej. pagó antes de que saliera el aviso), no se avisa.
    if (!s || s.estado !== ESTADO_ESPERADO[tipo] || !s.venceEn) return null;
    const venceEn = s.venceEn;
    const factura = s.facturas[0];
    const url = this.correo.urlWeb(
      tipo !== 'aviso_recuperacion' && factura ? `/cuenta/facturas/${factura.id}` : '/cuenta',
    );
    const servicio = nombreServicio(s);
    const suspension = new Date(venceEn.getTime() + REGLAS_COBRO.diasGracia * DIA_MS);
    const r = await this.avisos.avisar({
      plantilla:
        tipo === 'aviso_gracia'
          ? 'avisoGracia'
          : tipo === 'aviso_suspension'
            ? 'avisoSuspension'
            : 'avisoRecuperacion',
      destinatario: { clienteId: s.clienteId },
      // Un aviso por estado y periodo: aunque el trabajo se repita, no sale dos veces.
      claveUnica: `${tipo}:${s.id}:${venceEn.toISOString()}`,
      automatizacion: tipo,
      canales: config.canales,
      entidad: { tipo: 'suscripcion', id: s.id },
      contenido: (nombre) =>
        tipo === 'aviso_gracia'
          ? {
              correo: Plantillas.avisoGracia(nombre, servicio, fechaLarga(suspension), url),
              whatsapp: [nombre, servicio, fechaLarga(suspension), url],
            }
          : tipo === 'aviso_suspension'
            ? {
                correo: Plantillas.avisoSuspension(nombre, servicio, url),
                whatsapp: [nombre, servicio, url],
              }
            : {
                correo: Plantillas.avisoRecuperacion(nombre, servicio, fechaLarga(venceEn), url),
                whatsapp: [nombre, servicio, fechaLarga(venceEn)],
              },
    });
    await this.prisma.automatizacion.update({
      where: { tipo },
      data: { ultimaEjecucionEn: new Date() },
    });
    return r;
  }
}

export function resumenAvisos(r: Recuento, uno: string, varios: string): string {
  const partes = [plural(r.procesados, uno, varios)];
  if (r.omitidos) partes.push(plural(r.omitidos, 'omitido', 'omitidos'));
  if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
  return `${partes.join(', ')}.`;
}
