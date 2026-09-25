import { Inject, Injectable } from '@nestjs/common';
import { AUTOMATIZACIONES } from '@nv/shared';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import {
  ConfigAutomatizacionesService,
  esTipoAutomatizacion,
  interpretar,
} from './configuracion.service.js';
import { claveRanura, programaDe, ranuraActual } from './horario.js';
import { TRABAJO } from './trabajos.js';
import { TrabajosService } from './trabajos.service.js';

/**
 * Programador: en cada vuelta encola la ejecución de las automatizaciones
 * activas cuya hora (de Venezuela) ya llegó. La clave única de cada ranura
 * (`auto:<tipo>:<instante>`) impide que varios trabajadores o un reinicio la
 * ejecuten dos veces.
 */
@Injectable()
export class PlanificadorService {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  /** Devuelve cuántos trabajos encoló. */
  async vuelta(ahora = new Date()): Promise<number> {
    let encolados = 0;
    for (const fila of await this.config.todas()) {
      if (!esTipoAutomatizacion(fila.tipo) || !fila.activa) continue;
      if (AUTOMATIZACIONES[fila.tipo].disparo !== 'programada') continue;
      const c = interpretar(fila.tipo, fila);
      const programa = programaDe(fila.tipo, c.parametros);
      if (!programa) continue;
      const ranura = ranuraActual(programa, ahora);
      if (!ranura) continue;
      // Ya corrió después de esa hora (p. ej. se cambió la hora tras la ejecución de hoy).
      if (c.ultimaEjecucionEn && c.ultimaEjecucionEn >= ranura) continue;
      const nuevo = await this.trabajos.encolar({
        tipo: TRABAJO.ejecutarAutomatizacion,
        carga: { tipo: fila.tipo, disparo: 'programada', ranura: ranura.toISOString() },
        claveUnica: claveRanura(fila.tipo, ranura),
        maxIntentos: 3,
      });
      if (nuevo) encolados += 1;
    }
    // Pagos en línea abandonados: se consultan y se vencen cada 15 minutos.
    const ranuraIntentos = ranuraActual({ tipo: 'intervalo', minutos: 15 }, ahora)!;
    if (
      await this.trabajos.encolar({
        tipo: TRABAJO.expirarIntentosPago,
        claveUnica: `expirar_intentos_pago:${ranuraIntentos.toISOString()}`,
        maxIntentos: 3,
      })
    ) {
      encolados += 1;
    }
    const minutos = this.entorno.VENCIMIENTOS_CADA_MINUTOS;
    if (minutos > 0) {
      const ranura = ranuraActual({ tipo: 'intervalo', minutos }, ahora)!;
      const nuevo = await this.trabajos.encolar({
        tipo: TRABAJO.vencimientos,
        claveUnica: `vencimientos:${ranura.toISOString()}`,
        maxIntentos: 3,
      });
      if (nuevo) encolados += 1;
    }
    return encolados;
  }
}
