import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  abrirTicketEquipoSchema,
  actualizarTicketSchema,
  listarTicketsSchema,
  mensajeTicketSchema,
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
