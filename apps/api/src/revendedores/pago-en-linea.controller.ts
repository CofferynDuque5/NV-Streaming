import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  declararPagoBinanceSchema,
  declararPagoPaypalSchema,
  leerComprobantePaypalSchema,
  pagarRenovacionEnLineaSchema,
  retornoPagoSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { enviarComprobante } from '../cobros/cobros.controller.js';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { leerFormulario } from '../comun/formulario.js';
import { validar, ZodPipe } from '../comun/zod.pipe.js';
import { PagoEnLineaRevendedorService } from './pago-en-linea.service.js';

const idValido = validar(uuidSchema);

/**
 * Renovar servicios de la cartera pagando en línea (Binance Pay, PayPal…): las
 * mismas pantallas y verificaciones que una compra del cliente, sobre la
 * factura a nombre del revendedor. Un pago ajeno responde 404.
 */
@ApiTags('Revendedores: panel')
@Controller('revendedor')
export class PagoEnLineaRevendedorController {
  constructor(
    @Inject(PagoEnLineaRevendedorService) private readonly pagos: PagoEnLineaRevendedorService,
  ) {}

  @Get('pago-en-linea/metodos')
  @RequierePermiso('reventa.usar')
  metodos() {
    return this.pagos.metodos();
  }

  @Post('renovaciones/pago-en-linea')
  @RequierePermiso('reventa.usar')
  @DocCuerpo(pagarRenovacionEnLineaSchema)
  iniciar(
    @Auth() auth: ContextoAuth,
    @Body(validar(pagarRenovacionEnLineaSchema))
    cuerpo: z.output<typeof pagarRenovacionEnLineaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.iniciar(auth, cuerpo, cliente);
  }

  @Get('pagos-en-linea/:id')
  @RequierePermiso('reventa.usar')
  intento(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.pagos.obtener(auth, id);
  }

  @Post('pagos-en-linea/:id/retorno')
  @RequierePermiso('reventa.usar')
  @HttpCode(200)
  @DocCuerpo(retornoPagoSchema)
  retorno(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(retornoPagoSchema)) cuerpo: z.output<typeof retornoPagoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.retorno(auth, id, cuerpo.parametros, cliente);
  }

  @Post('pagos-en-linea/:id/cancelar')
  @RequierePermiso('reventa.usar')
  @HttpCode(200)
  cancelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.cancelar(auth, id, cliente);
  }

  @Post('pagos-en-linea/:id/binance')
  @RequierePermiso('reventa.usar')
  @HttpCode(200)
  @DocCuerpo(declararPagoBinanceSchema)
  binance(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(declararPagoBinanceSchema)) cuerpo: z.output<typeof declararPagoBinanceSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.declararBinance(auth, id, cuerpo, cliente);
  }

  /** Multipart: «facturaId», «metodoCobroId» y archivo «comprobante». No guarda nada. */
  @Post('pagos-en-linea/paypal/leer-captura')
  @RequierePermiso('reventa.usar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  async leerCaptura(@Auth() auth: ContextoAuth, @Req() peticion: FastifyRequest) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(leerComprobantePaypalSchema).transform(campos);
    return this.pagos.leerCapturaPaypal(auth, datos, archivo);
  }

  /** Multipart: campo «nombre» y archivo «comprobante» (captura del pago). */
  @Post('pagos-en-linea/:id/paypal')
  @RequierePermiso('reventa.usar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  async paypal(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(declararPagoPaypalSchema).transform(campos);
    return this.pagos.declararPaypal(auth, id, datos, archivo, cliente);
  }

  @Get('pagos-en-linea/:id/paypal/comprobante')
  @RequierePermiso('reventa.usar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.pagos.comprobantePaypal(auth, id));
  }
}
