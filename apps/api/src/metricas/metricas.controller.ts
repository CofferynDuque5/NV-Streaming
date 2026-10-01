import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, type ContextoAuth, RequierePermiso } from '../comun/contexto.js';
import { CentroService } from './centro.service.js';
import { MetricasService } from './metricas.service.js';

@ApiTags('Métricas')
@Controller('metricas')
export class MetricasController {
  constructor(
    @Inject(MetricasService) private readonly metricas: MetricasService,
    @Inject(CentroService) private readonly centro: CentroService,
  ) {}

  /** Cifras del panel. Ventas solo recibe las de su cartera. */
  @Get('panel')
  @RequierePermiso('metricas.ver')
  panel(@Auth() auth: ContextoAuth) {
    return this.metricas.panel(auth);
  }

  /**
   * Centro de módulos del equipo: colas por atender, cifras de cada módulo y
   * estado del sistema, solo de los módulos que el rol puede abrir.
   */
  @Get('centro')
  @RequierePermiso('metricas.ver')
  centroEquipo(@Auth() auth: ContextoAuth) {
    return this.centro.centro(auth);
  }
}
