import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PREFIJO_TRABAJOS_ENTREGA } from '../automatizaciones/trabajos.js';
import { TrabajosService } from '../automatizaciones/trabajos.service.js';
import { mensajeError } from '../automatizaciones/recuento.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';

const INTERVALO_MS = 2000;

/**
 * Con `ENTREGAS_EN_API=true`, la propia API procesa los trabajos de entregas
 * (`entrega.*`) cada 2 s. Sirve para entornos sin proceso trabajador (pruebas
 * de extremo a extremo o una instalación mínima); en producción los procesa
 * el trabajador y esta opción queda apagada.
 */
@Injectable()
export class ProcesadorEntregasService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger('Entregas');
  private temporizador: NodeJS.Timeout | null = null;
  private vuelta: Promise<void> | null = null;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.entorno.ENTREGAS_EN_API) return;
    this.temporizador = setInterval(() => {
      if (this.vuelta) return;
      this.vuelta = this.trabajos
        .procesarLote(10, PREFIJO_TRABAJOS_ENTREGA)
        .then(() => undefined)
        .catch((e: unknown) => this.logger.warn(`Error procesando entregas: ${mensajeError(e)}`))
        .finally(() => {
          this.vuelta = null;
        });
    }, INTERVALO_MS);
    this.temporizador.unref();
    this.logger.log('La API procesa las entregas (ENTREGAS_EN_API).');
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    await this.vuelta;
  }
}
