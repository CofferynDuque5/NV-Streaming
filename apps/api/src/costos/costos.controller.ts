import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  anularPagoCuentaSchema,
  balanceSchema,
  porPagarSchema,
  registrarPagoCuentaSchema,
  uuidSchema,
} from '@nv/shared';
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
import { CostosService } from './costos.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Cuentas de servicio')
@Controller('cuentas/:id/pagos')
export class PagosCuentaController {
  constructor(@Inject(CostosService) private readonly costos: CostosService) {}

  @Get()
  @RequierePermiso('cuentas.ver')
  listar(@Param('id', idValido) id: string) {
    return this.costos.pagos(id);
  }

  /** Registra el pago al proveedor y corre el próximo cobro un ciclo. */
  @Post()
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(registrarPagoCuentaSchema)
  registrar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(registrarPagoCuentaSchema)) cuerpo: z.output<typeof registrarPagoCuentaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.costos.registrarPago(auth, id, cuerpo, cliente);
  }

  @Post(':pagoId/anular')
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(anularPagoCuentaSchema)
  anular(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('pagoId', idValido) pagoId: string,
    @Body(validar(anularPagoCuentaSchema)) cuerpo: z.output<typeof anularPagoCuentaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.costos.anularPago(auth, id, pagoId, cuerpo.motivo, cliente);
  }
}

@ApiTags('Balance')
@Controller('balance')
export class BalanceController {
  constructor(@Inject(CostosService) private readonly costos: CostosService) {}

  /** Ventas, reembolsos y costos del período en USD, más lo que hoy está por cobrar y por pagar. */
  @Get()
  @RequierePermiso('balance.ver')
  @DocConsulta(balanceSchema)
  balance(@Query(validar(balanceSchema)) q: z.output<typeof balanceSchema>) {
    return this.costos.balance(q);
  }

  /** Cobros del proveedor atrasados y próximos (quien gestiona las cuentas los paga). */
  @Get('por-pagar')
  @RequierePermiso('cuentas.ver')
  @DocConsulta(porPagarSchema)
  porPagar(@Query(validar(porPagarSchema)) q: z.output<typeof porPagarSchema>) {
    return this.costos.porPagar(q.dias);
  }
}
