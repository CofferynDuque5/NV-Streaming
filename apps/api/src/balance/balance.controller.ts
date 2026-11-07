import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { balanceSchema } from '@nv/shared';
import type { z } from 'zod';
import { RequierePermiso } from '../comun/contexto.js';
import { DocConsulta } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { BalanceService } from './balance.service.js';

@ApiTags('Balance')
@Controller('balance')
export class BalanceController {
  constructor(@Inject(BalanceService) private readonly servicio: BalanceService) {}

  /** Ventas y reembolsos del período en USD, más lo que hoy está por cobrar. */
  @Get()
  @RequierePermiso('balance.ver')
  @DocConsulta(balanceSchema)
  balance(@Query(validar(balanceSchema)) q: z.output<typeof balanceSchema>) {
    return this.servicio.balance(q);
  }
}
