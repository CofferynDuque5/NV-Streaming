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
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarPerfilSchema,
  cambiarContrasenaSchema,
  confirmar2faSchema,
  desactivar2faSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { SesionesService } from '../auth/sesiones.service.js';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  PermitePendiente,
  RequierePermiso,
} from '../comun/contexto.js';
import { ponerCookieSesion } from '../comun/cookie.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { ENTORNO } from '../comun/tokens.js';
import { validar } from '../comun/zod.pipe.js';
import type { Entorno } from '../config/entorno.js';
import { CuentaService } from './cuenta.service.js';

@ApiTags('Mi cuenta')
@Controller('cuenta')
@RequierePermiso('cuenta.gestionar')
export class CuentaController {
  constructor(
    @Inject(CuentaService) private readonly cuenta: CuentaService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  @Get('sesiones')
  sesionesActivas(@Auth() auth: ContextoAuth) {
    return this.cuenta.listarSesiones(auth);
  }

  @Delete('sesiones/:id')
  @HttpCode(204)
  async cerrarSesion(
    @Auth() auth: ContextoAuth,
    @Param('id', validar(uuidSchema)) id: string,
    @Cliente() cliente: InfoCliente,
  ): Promise<void> {
    await this.cuenta.cerrarSesion(auth, id, cliente);
  }

  @Post('sesiones/cerrar-otras')
  @HttpCode(200)
  async cerrarOtras(@Auth() auth: ContextoAuth, @Cliente() cliente: InfoCliente) {
    return { cerradas: await this.cuenta.cerrarOtras(auth, cliente) };
  }

  @Patch('perfil')
  @DocCuerpo(actualizarPerfilSchema)
  actualizarPerfil(
    @Auth() auth: ContextoAuth,
    @Body(validar(actualizarPerfilSchema)) cuerpo: z.output<typeof actualizarPerfilSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuenta.actualizarPerfil(auth, cuerpo.nombre, cliente);
  }

  @Post('contrasena')
  @HttpCode(200)
  @DocCuerpo(cambiarContrasenaSchema)
  async cambiarContrasena(
    @Auth() auth: ContextoAuth,
    @Body(validar(cambiarContrasenaSchema)) cuerpo: z.output<typeof cambiarContrasenaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.cuenta.cambiarContrasena(auth, cuerpo, cliente);
    return { mensaje: 'Tu contraseña se cambió y cerramos tus otras sesiones.' };
  }

  @Get('2fa')
  estadoDosPasos(@Auth() auth: ContextoAuth) {
    return this.cuenta.estadoDosPasos(auth);
  }

  /** Genera el QR. Disponible también para sesiones que deben configurar la verificación. */
  @PermitePendiente()
  @Post('2fa/iniciar')
  @HttpCode(200)
  iniciarDosPasos(@Auth() auth: ContextoAuth) {
    return this.cuenta.iniciarDosPasos(auth);
  }

  @PermitePendiente()
  @Post('2fa/confirmar')
  @HttpCode(200)
  @DocCuerpo(confirmar2faSchema)
  async confirmarDosPasos(
    @Auth() auth: ContextoAuth,
    @Body(validar(confirmar2faSchema)) cuerpo: z.output<typeof confirmar2faSchema>,
    @Cliente() cliente: InfoCliente,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ) {
    const { codigosRespaldo, sesion, token } = await this.cuenta.confirmarDosPasos(
      auth,
      cuerpo.codigo,
      cliente,
    );
    if (token) ponerCookieSesion(respuesta, this.entorno, token, this.sesiones.duracionSegundos);
    return { codigosRespaldo, sesion };
  }

  @Post('2fa/desactivar')
  @HttpCode(200)
  @DocCuerpo(desactivar2faSchema)
  async desactivarDosPasos(
    @Auth() auth: ContextoAuth,
    @Body(validar(desactivar2faSchema)) cuerpo: z.output<typeof desactivar2faSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.cuenta.desactivarDosPasos(auth, cuerpo, cliente);
    return { mensaje: 'La verificación en dos pasos quedó desactivada.' };
  }

  @Post('2fa/codigos-respaldo')
  @HttpCode(200)
  @DocCuerpo(confirmar2faSchema)
  async regenerarCodigos(
    @Auth() auth: ContextoAuth,
    @Body(validar(confirmar2faSchema)) cuerpo: z.output<typeof confirmar2faSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return { codigosRespaldo: await this.cuenta.regenerarCodigos(auth, cuerpo.codigo, cliente) };
  }
}
