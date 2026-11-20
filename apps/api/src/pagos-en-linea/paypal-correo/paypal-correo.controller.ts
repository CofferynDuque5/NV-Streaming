import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  configPaypalCorreoSchema,
  declararPagoPaypalSchema,
  leerComprobantePaypalSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { enviarComprobante } from '../../cobros/cobros.controller.js';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../../comun/contexto.js';
import { DocCuerpo } from '../../comun/documentacion.js';
import { leerFormulario } from '../../comun/formulario.js';
import { validar, ZodPipe } from '../../comun/zod.pipe.js';
import { ComprobantesPaypalService } from './comprobantes-paypal.service.js';
import { CorreosPaypalService } from './correos-paypal.service.js';

/** El cliente dice a nombre de quién está su PayPal y sube la captura del pago. */
@ApiTags('Autoservicio del cliente')
@Controller('mi/pagos-en-linea')
export class PaypalCorreoClienteController {
  constructor(
    @Inject(CorreosPaypalService) private readonly paypal: CorreosPaypalService,
    @Inject(ComprobantesPaypalService) private readonly capturas: ComprobantesPaypalService,
  ) {}

  /**
   * Lee la captura de un pago de PayPal (en este servidor) para llenar el ID de
   * transacción y el monto. No guarda la imagen ni confirma el pago.
   * Multipart: «facturaId», «metodoCobroId» y archivo «comprobante».
   */
  @Post('paypal/leer-captura')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  async leerCaptura(@Auth() auth: ContextoAuth, @Req() peticion: FastifyRequest) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(leerComprobantePaypalSchema).transform(campos);
    return this.capturas.leer(auth, datos, archivo);
  }

  /** Multipart: campo «nombre» y archivo «comprobante» (captura del pago). */
  @Post(':id/paypal')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  async declarar(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(declararPagoPaypalSchema).transform(campos);
    return this.paypal.declarar(auth, id, datos, archivo, cliente);
  }

  @Get(':id/paypal/comprobante')
  @RequierePermiso('autoservicio.usar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.paypal.comprobantePropio(auth, id));
  }
}

/** Buzón donde llegan los avisos de PayPal (administración). */
@ApiTags('Pagos en línea')
@Controller('pasarelas/paypal-correo')
export class PaypalCorreoAdminController {
  constructor(@Inject(CorreosPaypalService) private readonly paypal: CorreosPaypalService) {}

  @Get('config')
  @RequierePermiso('pasarelas.configurar')
  config() {
    return this.paypal.config();
  }

  @Put('config')
  @RequierePermiso('pasarelas.configurar')
  @DocCuerpo(configPaypalCorreoSchema)
  guardar(
    @Auth() auth: ContextoAuth,
    @Body(validar(configPaypalCorreoSchema)) cuerpo: z.output<typeof configPaypalCorreoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.paypal.guardarConfig(auth, cuerpo, cliente);
  }

  @Post('probar')
  @RequierePermiso('pasarelas.configurar')
  @HttpCode(200)
  probar(@Auth() auth: ContextoAuth, @Cliente() cliente: InfoCliente) {
    return this.paypal.probar(auth, cliente);
  }

  @Get('correos')
  @RequierePermiso('pasarelas.configurar')
  correos() {
    return this.paypal.correos();
  }

  @Post('leer')
  @RequierePermiso('pasarelas.configurar')
  @HttpCode(200)
  async leer() {
    return { nuevos: await this.paypal.leer() };
  }

  /** Captura de un pago por PayPal que no se confirmó solo (para revisarlo). */
  @Get('intentos/:id/comprobante')
  @RequierePermiso('pagos.gestionar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.paypal.comprobantePropio(auth, id));
  }
}
