import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permiso, tienePermiso } from '@nv/shared';
import type { FastifyRequest } from 'fastify';
import { META_PERMISO } from '../comun/contexto.js';
import { Errores } from '../comun/errores.js';

/**
 * Comprueba @RequierePermiso() con el rol actual del usuario (leído de la base
 * de datos en cada petición). Las sesiones con un paso pendiente ya quedaron
 * limitadas por SesionGuard a las rutas marcadas con @PermitePendiente().
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const permiso = this.reflector.getAllAndOverride<Permiso | undefined>(META_PERMISO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permiso) return true;
    const { auth } = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!auth || !tienePermiso(auth.usuario.rol, permiso)) throw Errores.sinPermiso();
    return true;
  }
}
