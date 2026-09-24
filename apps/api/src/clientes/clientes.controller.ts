import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarClienteSchema,
  clienteSchema,
  listarClientesSchema,
  motivoSchema,
  notaSchema,
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
import { ClientesService } from './clientes.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Clientes')
@Controller('clientes')
export class ClientesController {
  constructor(@Inject(ClientesService) private readonly clientes: ClientesService) {}

  @Get()
  @RequierePermiso('clientes.ver')
  @DocConsulta(listarClientesSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarClientesSchema)) filtro: z.output<typeof listarClientesSchema>,
  ) {
    return this.clientes.listar(auth, filtro);
  }

  @Post()
  @RequierePermiso('clientes.gestionar')
  @DocCuerpo(clienteSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(clienteSchema)) cuerpo: z.output<typeof clienteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.crear(auth, cuerpo, cliente);
  }

  @Get(':id')
  @RequierePermiso('clientes.ver')
  obtener(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.clientes.obtener(auth, id);
  }

  @Patch(':id')
  @RequierePermiso('clientes.gestionar')
  @DocCuerpo(actualizarClienteSchema)
  actualizar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarClienteSchema)) cuerpo: z.output<typeof actualizarClienteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.actualizar(auth, id, cuerpo, cliente);
  }

  @Post(':id/archivar')
  @RequierePermiso('clientes.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoSchema)
  archivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoSchema)) cuerpo: z.output<typeof motivoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.cambiarEstado(auth, id, true, cuerpo.motivo, cliente);
  }

  @Post(':id/reactivar')
  @RequierePermiso('clientes.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoSchema)
  reactivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoSchema)) cuerpo: z.output<typeof motivoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.cambiarEstado(auth, id, false, cuerpo.motivo, cliente);
  }

  @Post(':id/invitar')
  @RequierePermiso('clientes.gestionar')
  @HttpCode(200)
  invitar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.invitar(auth, id, cliente);
  }

  @Get(':id/notas')
  @RequierePermiso('clientes.notas')
  notas(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.clientes.notas(auth, id);
  }

  @Post(':id/notas')
  @RequierePermiso('clientes.notas')
  @DocCuerpo(notaSchema)
  agregarNota(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(notaSchema)) cuerpo: z.output<typeof notaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.agregarNota(auth, id, cuerpo.texto, cliente);
  }
}
