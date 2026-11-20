import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { configBinanceSchema, declararPagoBinanceSchema, uuidSchema } from '@nv/shared';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../../comun/contexto.js';
import { DocCuerpo } from '../../comun/documentacion.js';
import { validar } from '../../comun/zod.pipe.js';
import { CorreosBinanceService } from './correos-binance.service.js';

/** El cliente declara con qué usuario de Binance pagó y cuánto envió. */
@ApiTags('Autoservicio del cliente')
@Controller('mi/pagos-en-linea')
export class BinanceClienteController {
  constructor(@Inject(CorreosBinanceService) private readonly binance: CorreosBinanceService) {}

  @Post(':id/binance')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(declararPagoBinanceSchema)
  declarar(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Body(validar(declararPagoBinanceSchema)) cuerpo: z.output<typeof declararPagoBinanceSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.binance.declarar(auth, id, cuerpo, cliente);
  }
}

/** Buzón donde llegan los avisos de Binance (administración). */
@ApiTags('Pagos en línea')
@Controller('pasarelas/binance')
export class BinanceAdminController {
  constructor(@Inject(CorreosBinanceService) private readonly binance: CorreosBinanceService) {}

  @Get('config')
  @RequierePermiso('pasarelas.configurar')
  config() {
    return this.binance.config();
  }

  @Put('config')
  @RequierePermiso('pasarelas.configurar')
  @DocCuerpo(configBinanceSchema)
  guardar(
    @Auth() auth: ContextoAuth,
    @Body(validar(configBinanceSchema)) cuerpo: z.output<typeof configBinanceSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.binance.guardarConfig(auth, cuerpo, cliente);
  }

  @Post('probar')
  @RequierePermiso('pasarelas.configurar')
  @HttpCode(200)
  probar(@Auth() auth: ContextoAuth, @Cliente() cliente: InfoCliente) {
    return this.binance.probar(auth, cliente);
  }

  @Get('correos')
  @RequierePermiso('pasarelas.configurar')
  correos() {
    return this.binance.correos();
  }

  /** Lee el buzón ahora (además de la lectura automática cada 2 minutos). */
  @Post('leer')
  @RequierePermiso('pasarelas.configurar')
  @HttpCode(200)
  async leer() {
    return { nuevos: await this.binance.leer() };
  }
}
