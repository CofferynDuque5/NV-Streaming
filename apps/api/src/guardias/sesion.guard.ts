import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SesionesService } from '../auth/sesiones.service.js';
import { META_PERMITE_PENDIENTE, META_PUBLICA } from '../comun/contexto.js';
import { borrarCookieSesion, leerCookieSesion } from '../comun/cookie.js';
import { Errores } from '../comun/errores.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';

/** Carga la sesión desde la cookie. Las rutas son privadas salvo que se marquen con @Publica(). */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SesionesService) private readonly sesiones: SesionesService,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const destinos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLICA, destinos)) return true;

    const peticion = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = leerCookieSesion(peticion, this.entorno);
    const validada = token ? await this.sesiones.validar(token) : null;
    if (!validada) {
      if (token) borrarCookieSesion(ctx.switchToHttp().getResponse<FastifyReply>(), this.entorno);
      throw Errores.noAutenticado();
    }
    peticion.auth = validada;

    if (
      validada.pendiente &&
      !this.reflector.getAllAndOverride<boolean>(META_PERMITE_PENDIENTE, destinos)
    ) {
      throw Errores.pasoPendiente(validada.pendiente);
    }
    return true;
  }
}
