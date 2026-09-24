import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { SuscripcionesService } from './suscripciones.service.js';

/**
 * Respaldo opcional (VENCIMIENTOS_EN_API=true) para instalaciones sin proceso
 * trabajador: la API pasa los vencimientos (activa → en gracia → suspendida →
 * vencida) con su propio temporizador. Normalmente lo hace el trabajador
 * (`dist/trabajador.js`), que además envía los avisos que quedan en cola.
 */
@Injectable()
export class VencimientosService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Vencimientos');
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
  ) {}

  onApplicationBootstrap(): void {
    const minutos = this.entorno.VENCIMIENTOS_CADA_MINUTOS;
    if (!this.entorno.VENCIMIENTOS_EN_API || minutos === 0 || this.entorno.NODE_ENV === 'test') {
      return;
    }
    this.temporizador = setInterval(() => void this.ejecutar(), minutos * 60_000);
    this.temporizador.unref();
    void this.ejecutar();
  }

  onApplicationShutdown(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  private async ejecutar(): Promise<void> {
    try {
      await this.suscripciones.aplicarVencimientos();
    } catch (e) {
      this.logger.error({ err: e }, 'Falló la pasada de vencimientos');
    }
  }
}
