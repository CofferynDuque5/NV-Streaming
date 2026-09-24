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
 * Pasa periódicamente los vencimientos (activa → en gracia → suspendida →
 * vencida). Es un temporizador dentro de la API; en la fase 3 lo sustituye el
 * trabajador con colas, que además envía los avisos.
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
    if (minutos === 0 || this.entorno.NODE_ENV === 'test') return;
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
