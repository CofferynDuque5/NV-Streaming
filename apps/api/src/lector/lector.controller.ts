import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { aliasServicioSchema, uuidSchema } from '@nv/shared';
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
import { LectorService } from './lector.service.js';

/** Palabras del lector de pedidos («plus» es Spotify). */
@ApiTags('Lector de pedidos')
@Controller('lector/alias')
export class LectorController {
  constructor(@Inject(LectorService) private readonly lector: LectorService) {}

  @Get()
  @RequierePermiso('suscripciones.crear')
  listar() {
    return this.lector.alias();
  }

  @Post()
  @RequierePermiso('suscripciones.crear')
  @DocCuerpo(aliasServicioSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(aliasServicioSchema)) cuerpo: z.output<typeof aliasServicioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.lector.crear(auth, cuerpo, cliente);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso('suscripciones.crear')
  async borrar(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Cliente() cliente: InfoCliente,
  ): Promise<void> {
    await this.lector.borrar(auth, id, cliente);
  }
}
