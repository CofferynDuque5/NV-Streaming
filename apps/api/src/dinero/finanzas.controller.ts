import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarMetodoCobroSchema,
  metodoCobroSchema,
  monedaConTasaSchema,
  monedaSchema,
  registrarTasaSchema,
  uuidSchema,
} from '@nv/shared';
import { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { MetodosCobroService } from './metodos-cobro.service.js';
import { TasasService } from './tasas.service.js';

const filtroMetodos = z.object({ moneda: monedaSchema.optional() });
const actualizarMetodo = actualizarMetodoCobroSchema;

@ApiTags('Monedas y cobro')
@Controller('finanzas')
export class FinanzasController {
  constructor(
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(MetodosCobroService) private readonly metodos: MetodosCobroService,
  ) {}

  /** Tasas vigentes: son públicas porque el sitio muestra los precios en cada moneda. */
  @Get('tasas')
  @Publica()
  vigentes() {
    return this.tasas.vigentes();
  }

  @Get('tasas/:moneda/historial')
  @RequierePermiso('finanzas.configurar')
  historial(
    @Param('moneda', validar(monedaConTasaSchema)) moneda: z.output<typeof monedaConTasaSchema>,
  ) {
    return this.tasas.historial(moneda);
  }

  @Post('tasas')
  @RequierePermiso('finanzas.configurar')
  @DocCuerpo(registrarTasaSchema)
  registrarTasa(
    @Auth() auth: ContextoAuth,
    @Body(validar(registrarTasaSchema)) cuerpo: z.output<typeof registrarTasaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tasas.registrar(auth, cuerpo, cliente);
  }

  @Get('metodos-cobro')
  @RequierePermiso('finanzas.configurar')
  listarMetodos(@Query(validar(filtroMetodos)) filtro: z.output<typeof filtroMetodos>) {
    return this.metodos.listar(filtro);
  }

  @Post('metodos-cobro')
  @RequierePermiso('finanzas.configurar')
  @DocCuerpo(metodoCobroSchema)
  crearMetodo(
    @Auth() auth: ContextoAuth,
    @Body(validar(metodoCobroSchema)) cuerpo: z.output<typeof metodoCobroSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.metodos.crear(auth, cuerpo, cliente);
  }

  @Patch('metodos-cobro/:id')
  @RequierePermiso('finanzas.configurar')
  @DocCuerpo(actualizarMetodo)
  actualizarMetodo(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Body(validar(actualizarMetodo)) cuerpo: z.output<typeof actualizarMetodo>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.metodos.actualizar(auth, id, cuerpo, cliente);
  }
}
