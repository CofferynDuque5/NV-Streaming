import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  estadoConversacionWhatsAppSchema,
  listarConversacionesWhatsAppSchema,
  responderWhatsAppSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  Auth,
  type ContextoAuth,
  OrigenExterno,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { WhatsAppBandejaService } from './whatsapp-bandeja.service.js';
import { WhatsAppQrService } from './whatsapp-qr.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Soporte')
@Controller('whatsapp')
export class WhatsAppBandejaController {
  constructor(
    @Inject(WhatsAppBandejaService) private readonly bandeja: WhatsAppBandejaService,
    @Inject(WhatsAppQrService) private readonly qr: WhatsAppQrService,
  ) {}

  /** Número vinculado por código QR: estado y, mientras espera, la imagen del QR. */
  @Get('vinculo')
  @RequierePermiso('automatizaciones.configurar')
  vinculo() {
    return this.qr.ver();
  }

  @Post('vinculo')
  @RequierePermiso('automatizaciones.configurar')
  @HttpCode(200)
  vincular() {
    return this.qr.vincular();
  }

  @Delete('vinculo')
  @RequierePermiso('automatizaciones.configurar')
  desvincular() {
    return this.qr.desvincular();
  }

  /** Meta comprueba el webhook con un GET al registrarlo. */
  @Get('webhook')
  @Publica()
  @OrigenExterno()
  verificar(
    @Query('hub.mode') modo: unknown,
    @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') reto: unknown,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ) {
    const devuelto = this.bandeja.verificar(modo, token, reto);
    void respuesta.header('content-type', 'text/plain; charset=utf-8');
    return devuelto;
  }

  /** Mensajes nuevos y estados de entrega; la firma se valida con el cuerpo crudo. */
  @Post('webhook')
  @Publica()
  @OrigenExterno()
  @HttpCode(200)
  recibir(@Req() peticion: FastifyRequest) {
    return this.bandeja.recibir(peticion.headers['x-hub-signature-256'], peticion.cuerpoCrudo);
  }

  @Get('conversaciones')
  @RequierePermiso('tickets.gestionar')
  @DocConsulta(listarConversacionesWhatsAppSchema)
  listar(
    @Query(validar(listarConversacionesWhatsAppSchema))
    filtro: z.output<typeof listarConversacionesWhatsAppSchema>,
  ) {
    return this.bandeja.bandeja(filtro.estado);
  }

  @Get('conversaciones/:id')
  @RequierePermiso('tickets.gestionar')
  detalle(@Param('id', idValido) id: string) {
    return this.bandeja.detalle(id);
  }

  @Post('conversaciones/:id/mensajes')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(responderWhatsAppSchema)
  responder(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(responderWhatsAppSchema)) cuerpo: z.output<typeof responderWhatsAppSchema>,
  ) {
    return this.bandeja.responder(auth, id, cuerpo.texto);
  }

  @Patch('conversaciones/:id')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(estadoConversacionWhatsAppSchema)
  cambiarEstado(
    @Param('id', idValido) id: string,
    @Body(validar(estadoConversacionWhatsAppSchema))
    cuerpo: z.output<typeof estadoConversacionWhatsAppSchema>,
  ) {
    return this.bandeja.cambiarEstado(id, cuerpo.cerrada);
  }
}
