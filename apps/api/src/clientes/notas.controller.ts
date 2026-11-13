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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { crearNotaSchema, editarNotaSchema, listarNotasSchema, uuidSchema } from '@nv/shared';
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
import { NotasService } from './notas.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Notas')
@Controller('notas')
export class NotasController {
  constructor(@Inject(NotasService) private readonly notas: NotasService) {}

  @Get()
  @RequierePermiso('clientes.notas')
  @DocConsulta(listarNotasSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarNotasSchema)) filtro: z.output<typeof listarNotasSchema>,
  ) {
    return this.notas.listar(auth, filtro);
  }

  @Post()
  @RequierePermiso('clientes.notas')
  @DocCuerpo(crearNotaSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearNotaSchema)) cuerpo: z.output<typeof crearNotaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.notas.crear(auth, cuerpo, cliente);
  }

  @Patch(':id')
  @RequierePermiso('clientes.notas')
  @DocCuerpo(editarNotaSchema)
  editar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(editarNotaSchema)) cuerpo: z.output<typeof editarNotaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.notas.editar(auth, id, cuerpo, cliente);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso('clientes.notas')
  async borrar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.notas.borrar(auth, id, cliente);
  }
}
