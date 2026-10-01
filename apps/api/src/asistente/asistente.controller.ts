import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  configurarAsistenteSchema,
  decidirAccionSchema,
  enviarMensajeAsistenteSchema,
  filtroAccionesSchema,
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
import { AccionesAsistenteService } from './acciones.service.js';
import { AsistenteService } from './asistente.service.js';
import { ConfiguracionAsistenteService } from './configuracion.service.js';

const idValido = validar(uuidSchema);

/**
 * Asistente de IA del equipo. Consulta con los permisos y la cartera de quien
 * pregunta; lo que tiene efecto queda como acción propuesta hasta que se confirma.
 */
@ApiTags('Asistente de IA')
@Controller('asistente')
export class AsistenteController {
  constructor(
    @Inject(AsistenteService) private readonly asistente: AsistenteService,
    @Inject(AccionesAsistenteService) private readonly acciones: AccionesAsistenteService,
    @Inject(ConfiguracionAsistenteService) private readonly config: ConfiguracionAsistenteService,
  ) {}

  @Get('estado')
  @RequierePermiso('asistente.usar')
  estado(@Auth() auth: ContextoAuth) {
    return this.asistente.estado(auth);
  }

  /** Conversaciones propias sin archivar (las 50 más recientes). */
  @Get('conversaciones')
  @RequierePermiso('asistente.usar')
  conversaciones(@Auth() auth: ContextoAuth) {
    return this.asistente.conversaciones(auth);
  }

  @Get('conversaciones/:id')
  @RequierePermiso('asistente.usar')
  conversacion(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.asistente.conversacion(auth, id);
  }

  @Delete('conversaciones/:id')
  @RequierePermiso('asistente.usar')
  @HttpCode(204)
  async archivar(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    await this.asistente.archivar(auth, id);
  }

  /** Envía una pregunta (sin conversacionId empieza una conversación nueva). */
  @Post('mensajes')
  @RequierePermiso('asistente.usar')
  @HttpCode(200)
  @DocCuerpo(enviarMensajeAsistenteSchema)
  enviar(
    @Auth() auth: ContextoAuth,
    @Body(validar(enviarMensajeAsistenteSchema))
    cuerpo: z.output<typeof enviarMensajeAsistenteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.asistente.enviar(auth, cuerpo, cliente);
  }

  /** Acciones propuestas: las propias, o todas con asistente.configurar. */
  @Get('acciones')
  @RequierePermiso('asistente.usar')
  @DocConsulta(filtroAccionesSchema)
  listarAcciones(
    @Auth() auth: ContextoAuth,
    @Query(validar(filtroAccionesSchema)) filtro: z.output<typeof filtroAccionesSchema>,
  ) {
    return this.acciones.listar(auth, filtro);
  }

  /** Confirma (ejecuta) o rechaza una acción propuesta. */
  @Post('acciones/:id/decision')
  @RequierePermiso('asistente.usar')
  @HttpCode(200)
  @DocCuerpo(decidirAccionSchema)
  decidir(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(decidirAccionSchema)) cuerpo: z.output<typeof decidirAccionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.acciones.decidir(auth, id, cuerpo, cliente);
  }

  @Get('configuracion')
  @RequierePermiso('asistente.configurar')
  configuracion() {
    return this.config.publica();
  }

  @Put('configuracion')
  @RequierePermiso('asistente.configurar')
  @DocCuerpo(configurarAsistenteSchema)
  configurar(
    @Auth() auth: ContextoAuth,
    @Body(validar(configurarAsistenteSchema)) cuerpo: z.output<typeof configurarAsistenteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.config.actualizar(auth, cuerpo, cliente);
  }
}
