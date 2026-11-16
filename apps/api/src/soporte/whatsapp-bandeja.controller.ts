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
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  estadoConversacionWhatsAppSchema,
  fijarMensajeWhatsAppSchema,
  listarConversacionesWhatsAppSchema,
  MEDIO_WHATSAPP_MAX_MB,
  medioWhatsAppSchema,
  mensajesWhatsAppSchema,
  reaccionWhatsAppSchema,
  responderWhatsAppSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  Auth,
  type ContextoAuth,
  OrigenExterno,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { detectarTipo } from '../almacen/tipos-archivo.js';
import { leerFormulario } from '../comun/formulario.js';
import { validar, ZodPipe } from '../comun/zod.pipe.js';
import { WhatsAppBandejaService } from './whatsapp-bandeja.service.js';
import { WhatsAppQrService } from './whatsapp-qr.service.js';

const idValido = validar(uuidSchema);
const escribiendoSchema = z.object({ grabando: z.boolean().default(false) });

/** Tipos que el navegador puede mostrar o reproducir; lo demás se descarga. */
const SE_MUESTRA = /^(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/(mp4|webm|3gpp))$/;

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
    return this.bandeja.bandeja(filtro.estado, filtro.busqueda);
  }

  @Get('conversaciones/:id')
  @RequierePermiso('tickets.gestionar')
  @DocConsulta(mensajesWhatsAppSchema)
  detalle(
    @Param('id', idValido) id: string,
    @Query(validar(mensajesWhatsAppSchema)) filtro: z.output<typeof mensajesWhatsAppSchema>,
  ) {
    return this.bandeja.detalle(id, filtro.antes);
  }

  /** En línea, escribiendo o última vez del contacto (solo con el número vinculado por QR). */
  @Get('conversaciones/:id/presencia')
  @RequierePermiso('tickets.gestionar')
  presencia(@Param('id', idValido) id: string) {
    return this.bandeja.presencia(id);
  }

  /** Pide al teléfono mensajes anteriores de este chat; llegan en unos segundos. */
  @Post('conversaciones/:id/historial')
  @RequierePermiso('tickets.gestionar')
  @HttpCode(202)
  historial(@Param('id', idValido) id: string) {
    return this.bandeja.pedirHistorial(id);
  }

  /** Imagen o nota de voz (multipart: «archivo», y «texto» o «segundos»). */
  @Post('conversaciones/:id/medios')
  @RequierePermiso('tickets.gestionar')
  @ApiConsumes('multipart/form-data')
  async enviarMedio(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Req() peticion: FastifyRequest,
  ) {
    const { campos, archivo } = await leerFormulario(
      peticion,
      'archivo',
      MEDIO_WHATSAPP_MAX_MB * 1024 * 1024,
    );
    const datos = new ZodPipe(medioWhatsAppSchema).transform(campos);
    return this.bandeja.enviarMedio(auth, id, archivo, datos);
  }

  /** El archivo de un mensaje, solo para el equipo y sin que el navegador lo interprete como página. */
  @Get('mensajes/:id/medio')
  @RequierePermiso('tickets.gestionar')
  async medio(@Param('id', idValido) id: string, @Res() respuesta: FastifyReply) {
    const { contenido, mime } = await this.bandeja.medio(id);
    const tipo = mime.split(';')[0]!.trim().toLowerCase();
    const seMuestra = SE_MUESTRA.test(tipo);
    void respuesta
      .header('content-type', seMuestra ? tipo : 'application/octet-stream')
      .header('content-disposition', seMuestra ? 'inline' : 'attachment; filename="archivo"')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=86400')
      .send(contenido);
  }

  @Patch('mensajes/:id')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(fijarMensajeWhatsAppSchema)
  fijarMensaje(
    @Param('id', idValido) id: string,
    @Body(validar(fijarMensajeWhatsAppSchema)) cuerpo: z.output<typeof fijarMensajeWhatsAppSchema>,
  ) {
    return this.bandeja.fijarMensaje(id, cuerpo.fijado);
  }

  /** Reacciona a un mensaje con un emoji; «emoji: null» la quita. */
  @Put('mensajes/:id/reaccion')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(reaccionWhatsAppSchema)
  reaccionar(
    @Param('id', idValido) id: string,
    @Body(validar(reaccionWhatsAppSchema)) cuerpo: z.output<typeof reaccionWhatsAppSchema>,
  ) {
    return this.bandeja.reaccionar(id, cuerpo.emoji);
  }

  /** Borra para todos un mensaje de la empresa. */
  @Delete('mensajes/:id')
  @RequierePermiso('tickets.gestionar')
  eliminar(@Param('id', idValido) id: string) {
    return this.bandeja.eliminar(id);
  }

  /** «Escribiendo…» o «grabando audio…» en el teléfono del cliente. */
  @Post('conversaciones/:id/escribiendo')
  @RequierePermiso('tickets.gestionar')
  @HttpCode(200)
  @DocCuerpo(escribiendoSchema)
  escribiendo(
    @Param('id', idValido) id: string,
    @Body(validar(escribiendoSchema)) cuerpo: z.output<typeof escribiendoSchema>,
  ) {
    return this.bandeja.escribiendo(id, cuerpo.grabando);
  }

  /** Foto de perfil del contacto (204 si no tiene o es privada). */
  @Get('conversaciones/:id/foto')
  @RequierePermiso('tickets.gestionar')
  async foto(@Param('id', idValido) id: string, @Res() respuesta: FastifyReply) {
    const contenido = await this.bandeja.foto(id);
    if (!contenido) {
      void respuesta.header('cache-control', 'private, max-age=600').code(204).send();
      return;
    }
    const tipo = detectarTipo(contenido);
    void respuesta
      .header('content-type', tipo?.startsWith('image/') ? tipo : 'application/octet-stream')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=3600')
      .send(contenido);
  }

  @Post('conversaciones/:id/mensajes')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(responderWhatsAppSchema)
  responder(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(responderWhatsAppSchema)) cuerpo: z.output<typeof responderWhatsAppSchema>,
  ) {
    return this.bandeja.responder(auth, id, cuerpo.texto, cuerpo.respuestaDe);
  }

  @Patch('conversaciones/:id')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(estadoConversacionWhatsAppSchema)
  cambiarEstado(
    @Param('id', idValido) id: string,
    @Body(validar(estadoConversacionWhatsAppSchema))
    cuerpo: z.output<typeof estadoConversacionWhatsAppSchema>,
  ) {
    return this.bandeja.cambiarEstado(id, cuerpo);
  }
}
