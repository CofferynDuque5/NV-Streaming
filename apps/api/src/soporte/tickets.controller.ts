import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  abrirTicketEquipoSchema,
  actualizarTicketSchema,
  listarTicketsSchema,
  mensajeTicketImagenSchema,
  mensajeTicketSchema,
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
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { ErrorApp } from '../comun/errores.js';
import { leerFormulario } from '../comun/formulario.js';
import { validar, ZodPipe } from '../comun/zod.pipe.js';
import { TicketsService } from './tickets.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Soporte')
@Controller('tickets')
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Get()
  @RequierePermiso('tickets.ver')
  @DocConsulta(listarTicketsSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarTicketsSchema)) filtro: z.output<typeof listarTicketsSchema>,
  ) {
    return this.tickets.listar(auth, filtro);
  }

  @Post()
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(abrirTicketEquipoSchema)
  abrir(
    @Auth() auth: ContextoAuth,
    @Body(validar(abrirTicketEquipoSchema)) cuerpo: z.output<typeof abrirTicketEquipoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.abrirEquipo(auth, cuerpo, cliente);
  }

  @Get(':id')
  @RequierePermiso('tickets.ver')
  obtener(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.tickets.obtener(auth, id);
  }

  @Post(':id/mensajes')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(mensajeTicketSchema)
  responder(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(mensajeTicketSchema)) cuerpo: z.output<typeof mensajeTicketSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.responder(auth, id, cuerpo, cliente);
  }

  /** Respuesta o nota interna con una imagen (multipart: «imagen», «texto» e «interno»). */
  @Post(':id/imagen')
  @RequierePermiso('tickets.gestionar')
  @ApiConsumes('multipart/form-data')
  async responderConImagen(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'imagen');
    const datos = new ZodPipe(mensajeTicketImagenSchema).transform(campos);
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta una imagen.', {
        imagen: ['Adjunta una imagen.'],
      });
    }
    return this.tickets.responder(auth, id, { ...datos, imagen: archivo }, cliente);
  }

  @Get(':id/mensajes/:mensajeId/imagen')
  @RequierePermiso('tickets.ver')
  async imagen(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('mensajeId', idValido) mensajeId: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.tickets.imagen(auth, id, mensajeId));
  }

  @Patch(':id')
  @RequierePermiso('tickets.gestionar')
  @DocCuerpo(actualizarTicketSchema)
  actualizar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarTicketSchema)) cuerpo: z.output<typeof actualizarTicketSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.actualizar(auth, id, cuerpo, cliente);
  }
}
