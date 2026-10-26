import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { cerrarCajaSchema, consultarCajaSchema } from '@nv/shared';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { CajaService } from './caja.service.js';

@ApiTags('Caja')
@Controller('caja')
export class CajaController {
  constructor(@Inject(CajaService) private readonly caja: CajaService) {}

  /** Caja de un día (hoy por defecto): movimientos, totales y cierres. */
  @Get()
  @RequierePermiso('caja.ver')
  @DocConsulta(consultarCajaSchema)
  ver(@Query(validar(consultarCajaSchema)) q: z.output<typeof consultarCajaSchema>) {
    return this.caja.caja(q.dia);
  }

  @Post('cierres')
  @RequierePermiso('caja.cerrar')
  @DocCuerpo(cerrarCajaSchema)
  cerrar(
    @Auth() auth: ContextoAuth,
    @Body(validar(cerrarCajaSchema)) cuerpo: z.output<typeof cerrarCajaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.caja.cerrar(auth, cuerpo, cliente);
  }
}
