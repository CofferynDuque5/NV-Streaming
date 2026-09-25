import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, type ContextoAuth, RequierePermiso } from '../comun/contexto.js';
import { MetricasService } from './metricas.service.js';

@ApiTags('Métricas')
@Controller('metricas')
export class MetricasController {
  constructor(@Inject(MetricasService) private readonly metricas: MetricasService) {}

  /** Cifras del panel. Ventas solo recibe las de su cartera. */
  @Get('panel')
  @RequierePermiso('metricas.ver')
  panel(@Auth() auth: ContextoAuth) {
    return this.metricas.panel(auth);
  }
}
