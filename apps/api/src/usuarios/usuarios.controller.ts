import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  cambiarEstadoSchema,
  cambiarRolSchema,
  invitarUsuarioSchema,
  listarUsuariosSchema,
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
import { UsuariosService } from './usuarios.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Equipo y usuarios')
@Controller('usuarios')
export class UsuariosController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  @Get()
  @RequierePermiso('usuarios.ver')
  @DocConsulta(listarUsuariosSchema)
  listar(@Query(validar(listarUsuariosSchema)) filtro: z.output<typeof listarUsuariosSchema>) {
    return this.usuarios.listar(filtro);
  }

  @Get(':id')
  @RequierePermiso('usuarios.ver')
  obtener(@Param('id', idValido) id: string) {
    return this.usuarios.obtener(id);
  }

  @Post('invitaciones')
  @RequierePermiso('usuarios.gestionar')
  @DocCuerpo(invitarUsuarioSchema)
  invitar(
    @Auth() auth: ContextoAuth,
    @Body(validar(invitarUsuarioSchema)) cuerpo: z.output<typeof invitarUsuarioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.usuarios.invitar(auth, cuerpo, cliente);
  }

  @Post(':id/invitacion/reenviar')
  @RequierePermiso('usuarios.gestionar')
  @HttpCode(202)
  async reenviarInvitacion(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.usuarios.reenviarInvitacion(auth, id, cliente);
    return { mensaje: 'Invitación reenviada.' };
  }

  @Patch(':id/rol')
  @RequierePermiso('usuarios.gestionar')
  @DocCuerpo(cambiarRolSchema)
  cambiarRol(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(cambiarRolSchema)) cuerpo: z.output<typeof cambiarRolSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.usuarios.cambiarRol(auth, id, cuerpo.rol, cliente);
  }

  @Patch(':id/estado')
  @RequierePermiso('usuarios.gestionar')
  @DocCuerpo(cambiarEstadoSchema)
  cambiarEstado(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(cambiarEstadoSchema)) cuerpo: z.output<typeof cambiarEstadoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.usuarios.cambiarEstado(auth, id, cuerpo, cliente);
  }

  @Post(':id/2fa/restablecer')
  @RequierePermiso('usuarios.gestionar')
  @HttpCode(200)
  async restablecerDosPasos(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.usuarios.restablecerDosPasos(auth, id, cliente);
    return { mensaje: 'Verificación restablecida. La persona la configurará de nuevo al entrar.' };
  }
}
