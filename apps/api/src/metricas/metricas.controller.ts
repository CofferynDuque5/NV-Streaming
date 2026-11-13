import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { metaMesSchema } from '@nv/shared';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { CentroService } from './centro.service.js';
import { InicioGestorService } from './inicio-gestor.service.js';
import { MetricasService } from './metricas.service.js';

@ApiTags('Métricas')
@Controller('metricas')
export class MetricasController {
  constructor(
    @Inject(MetricasService) private readonly metricas: MetricasService,
    @Inject(CentroService) private readonly centro: CentroService,
    @Inject(InicioGestorService) private readonly inicio: InicioGestorService,
  ) {}

  /** Tarjetas por plataforma, renovados hoy, notas por avisar y meta del mes. */
  @Get('inicio')
  @RequierePermiso('metricas.ver')
  inicioGestor(@Auth() auth: ContextoAuth) {
    return this.inicio.ver(auth);
  }

  /** Meta de ingresos del mes en curso (USD); null la quita. */
  @Put('meta')
  @RequierePermiso('finanzas.configurar')
  @DocCuerpo(metaMesSchema)
  fijarMeta(
    @Auth() auth: ContextoAuth,
    @Body(validar(metaMesSchema)) cuerpo: z.output<typeof metaMesSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.inicio.fijarMeta(auth, cuerpo, cliente);
  }

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
