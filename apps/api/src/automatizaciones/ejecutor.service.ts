import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EjecucionAutomatizacion, EstadoEjecucion, PrismaClient } from '@nv/db';
import { AUTOMATIZACIONES, type TipoAutomatizacion } from '@nv/shared';
import { PRISMA } from '../comun/tokens.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import {
  type ConfigAutomatizacion,
  ConfigAutomatizacionesService,
  esTipoAutomatizacion,
} from './configuracion.service.js';
import { mensajeError, type ResultadoTarea } from './recuento.js';
import { TareasClientesService } from './tareas/clientes.service.js';
import { TareasEquipoService } from './tareas/equipo.service.js';
import { TasaAutomaticaService } from './tasas/tasa-automatica.service.js';
import { TRABAJO } from './trabajos.js';
import { TrabajosService } from './trabajos.service.js';

export type Disparo = 'programada' | 'manual';

/** Tarea de una automatización programada que registra otro módulo (p. ej. pagos en línea). */
export type TareaAutomatizacion = (
  config: ConfigAutomatizacion,
  ahora: Date,
) => Promise<ResultadoTarea>;

/**
 * Ejecuta las automatizaciones programadas y deja constancia de cada ejecución
 * (procesados, omitidos, errores y un resumen) en `ejecuciones_automatizacion`.
 */
@Injectable()
export class EjecutorAutomatizacionesService implements OnModuleInit {
  private readonly logger = new Logger('Automatizaciones');
  private readonly tareasRegistradas = new Map<TipoAutomatizacion, TareaAutomatizacion>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
    @Inject(TareasClientesService) private readonly clientes: TareasClientesService,
    @Inject(TareasEquipoService) private readonly equipo: TareasEquipoService,
    @Inject(TasaAutomaticaService) private readonly tasa: TasaAutomaticaService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.ejecutarAutomatizacion, async (carga) => {
      const tipo = String(carga['tipo']);
      if (!esTipoAutomatizacion(tipo)) throw new Error(`Automatización desconocida: ${tipo}`);
      await this.ejecutar(tipo, {
        disparo: carga['disparo'] === 'manual' ? 'manual' : 'programada',
      });
    });
    this.trabajos.registrar(TRABAJO.vencimientos, async () => {
      await this.suscripciones.aplicarVencimientos();
    });
  }

  /** Otro módulo aporta la tarea de una automatización programada del catálogo. */
  registrarTarea(tipo: TipoAutomatizacion, tarea: TareaAutomatizacion): void {
    this.tareasRegistradas.set(tipo, tarea);
  }

  /**
   * Ejecuta una automatización programada. Las ejecuciones programadas de una
   * automatización desactivada no hacen nada; las manuales corren igual (es una
   * acción explícita de administración). Devuelve la ejecución registrada.
   */
  async ejecutar(
    tipo: TipoAutomatizacion,
    opciones: { disparo: Disparo; ahora?: Date },
  ): Promise<EjecucionAutomatizacion | null> {
    if (AUTOMATIZACIONES[tipo].disparo !== 'programada') {
      throw new Error(`"${tipo}" la dispara un evento: no se ejecuta a mano.`);
    }
    const config = await this.config.leer(tipo);
    if (opciones.disparo === 'programada' && !config.activa) return null;
    const ahora = opciones.ahora ?? new Date();
    const ejecucion = await this.prisma.ejecucionAutomatizacion.create({
      data: { tipo, disparo: opciones.disparo },
    });
    let estado: EstadoEjecucion;
    let resultado: ResultadoTarea;
    try {
      resultado = await this.tarea(config, ahora);
      estado = resultado.errores > 0 ? 'con_errores' : 'completada';
    } catch (e) {
      estado = 'fallida';
      resultado = { procesados: 0, omitidos: 0, errores: 1, resumen: mensajeError(e) };
      this.logger.warn(`La automatización ${tipo} falló: ${resultado.resumen}`);
    }
    const terminadaEn = new Date();
    const [fila] = await this.prisma.$transaction([
      this.prisma.ejecucionAutomatizacion.update({
        where: { id: ejecucion.id },
        data: {
          estado,
          procesados: resultado.procesados,
          omitidos: resultado.omitidos,
          errores: resultado.errores,
          resumen: resultado.resumen.slice(0, 1000),
          ...(resultado.detalle === undefined ? {} : { detalle: resultado.detalle }),
          terminadaEn,
        },
      }),
      this.prisma.automatizacion.update({
        where: { tipo },
        data: { ultimaEjecucionEn: terminadaEn },
      }),
    ]);
    return fila;
  }

  private tarea(config: ConfigAutomatizacion, ahora: Date): Promise<ResultadoTarea> {
    const registrada = this.tareasRegistradas.get(config.tipo);
    if (registrada) return registrada(config, ahora);
    switch (config.tipo) {
      case 'recordatorio_vencimiento':
        return this.clientes.recordatorios(
          config as ConfigAutomatizacion<typeof config.tipo>,
          ahora,
        );
      case 'factura_renovacion':
        return this.clientes.renovaciones(
          config as ConfigAutomatizacion<typeof config.tipo>,
          ahora,
        );
      case 'escalado_suspension':
        return this.equipo.escalado(config as ConfigAutomatizacion<typeof config.tipo>, ahora);
      case 'alerta_sla_tickets':
        return this.equipo.alertaSla(config as ConfigAutomatizacion<typeof config.tipo>, ahora);
      case 'alerta_pagos_pendientes':
        return this.equipo.pagosPendientes(
          config as ConfigAutomatizacion<typeof config.tipo>,
          ahora,
        );
      case 'tasa_automatica':
        return this.tasa.ejecutar(config as ConfigAutomatizacion<typeof config.tipo>, ahora);
      default:
        throw new Error(`"${config.tipo}" no es una automatización programada.`);
    }
  }
}
