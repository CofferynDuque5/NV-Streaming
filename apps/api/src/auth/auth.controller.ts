import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  aceptarInvitacionSchema,
  inicioSesionSchema,
  registroSchema,
  restablecerContrasenaSchema,
  type SesionActual,
  solicitarCorreoSchema,
  type Ubicacion,
  verificar2faSchema,
  verificarCorreoSchema,
} from '@nv/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  PermitePendiente,
  Publica,
  UbicacionVisitante,
} from '../comun/contexto.js';
import { borrarCookieSesion, ponerCookieSesion } from '../comun/cookie.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { ENTORNO } from '../comun/tokens.js';
import { validar } from '../comun/zod.pipe.js';
import type { Entorno } from '../config/entorno.js';
import { AuthService } from './auth.service.js';
import { sesionActual } from './presentacion.js';
import { SesionesService } from './sesiones.service.js';

const MENSAJE_CORREO_ENVIADO = {
  mensaje:
    'Si el correo es correcto, en unos minutos recibirás un mensaje con los siguientes pasos.',
};

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  @Publica()
  @Post('registro')
  @HttpCode(202)
  @DocCuerpo(registroSchema)
  async registro(
    @Body(validar(registroSchema)) cuerpo: z.output<typeof registroSchema>,
    @Cliente() cliente: InfoCliente,
    @UbicacionVisitante() ubicacion: Ubicacion,
  ) {
    await this.auth.registrar(cuerpo, cliente, ubicacion);
    return MENSAJE_CORREO_ENVIADO;
  }

  @Publica()
  @Post('inicio-sesion')
  @HttpCode(200)
  @DocCuerpo(inicioSesionSchema)
  async iniciarSesion(
    @Body(validar(inicioSesionSchema)) cuerpo: z.output<typeof inicioSesionSchema>,
    @Cliente() cliente: InfoCliente,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ): Promise<SesionActual> {
    const { token, sesion } = await this.auth.iniciarSesion(cuerpo, cliente);
    ponerCookieSesion(respuesta, this.entorno, token, this.sesiones.duracionSegundos);
    return sesion;
  }

  @PermitePendiente()
  @Post('cierre-sesion')
  @HttpCode(204)
  async cerrarSesion(
    @Auth() auth: ContextoAuth,
    @Cliente() cliente: InfoCliente,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ): Promise<void> {
    await this.auth.cerrarSesion(auth, cliente);
    borrarCookieSesion(respuesta, this.entorno);
  }

  /** Sesión actual. Con un paso pendiente devuelve `pendiente` y ningún permiso. */
  @PermitePendiente()
  @Get('sesion')
  sesion(@Auth() auth: ContextoAuth): SesionActual {
    return sesionActual(auth.usuario, auth.pendiente);
  }

  @PermitePendiente()
  @Post('2fa/verificar')
  @HttpCode(200)
  @DocCuerpo(verificar2faSchema)
  async verificarDosPasos(
    @Auth() auth: ContextoAuth,
    @Body(validar(verificar2faSchema)) cuerpo: z.output<typeof verificar2faSchema>,
    @Cliente() cliente: InfoCliente,
    @Res({ passthrough: true }) respuesta: FastifyReply,
  ): Promise<SesionActual> {
    const { token, sesion } = await this.auth.verificarDosPasos(auth, cuerpo, cliente);
    ponerCookieSesion(respuesta, this.entorno, token, this.sesiones.duracionSegundos);
    return sesion;
  }

  @Publica()
  @Post('correo/verificar')
  @HttpCode(200)
  @DocCuerpo(verificarCorreoSchema)
  async verificarCorreo(
    @Body(validar(verificarCorreoSchema)) cuerpo: z.output<typeof verificarCorreoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.auth.verificarCorreo(cuerpo.token, cliente);
    return { mensaje: 'Tu correo quedó confirmado. Ya puedes iniciar sesión.' };
  }

  @Publica()
  @Post('correo/reenviar')
  @HttpCode(202)
  @DocCuerpo(solicitarCorreoSchema)
  async reenviarVerificacion(
    @Body(validar(solicitarCorreoSchema)) cuerpo: z.output<typeof solicitarCorreoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.auth.reenviarVerificacion(cuerpo.correo, cliente);
    return MENSAJE_CORREO_ENVIADO;
  }

  @Publica()
  @Post('contrasena/recuperar')
  @HttpCode(202)
  @DocCuerpo(solicitarCorreoSchema)
  async recuperar(
    @Body(validar(solicitarCorreoSchema)) cuerpo: z.output<typeof solicitarCorreoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.auth.solicitarRecuperacion(cuerpo.correo, cliente);
    return MENSAJE_CORREO_ENVIADO;
  }

  @Publica()
  @Post('contrasena/restablecer')
  @HttpCode(200)
  @DocCuerpo(restablecerContrasenaSchema)
  async restablecer(
    @Body(validar(restablecerContrasenaSchema))
    cuerpo: z.output<typeof restablecerContrasenaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.auth.restablecerContrasena(cuerpo.token, cuerpo.contrasena, cliente);
    return { mensaje: 'Tu contraseña se cambió. Inicia sesión con la nueva.' };
  }

  @Publica()
  @Post('invitacion/aceptar')
  @HttpCode(200)
  @DocCuerpo(aceptarInvitacionSchema)
  async aceptarInvitacion(
    @Body(validar(aceptarInvitacionSchema)) cuerpo: z.output<typeof aceptarInvitacionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.auth.aceptarInvitacion(cuerpo, cliente);
    return { mensaje: 'Tu cuenta está lista. Inicia sesión para continuar.' };
  }
}
