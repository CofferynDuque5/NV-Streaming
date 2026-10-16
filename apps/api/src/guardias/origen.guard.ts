import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { META_ORIGEN_EXTERNO } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF: toda petición que cambia datos debe venir de la web de NV.
 * Se exige la cabecera Origin (o, si falta, Sec-Fetch-Site: same-origin).
 * Junto con la cookie SameSite=Lax cubre los ataques entre sitios.
 */
@Injectable()
export class OrigenGuard implements CanActivate {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const p = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (METODOS_SEGUROS.has(p.method)) return true;
    // Webhooks de pasarelas: los envía un servidor (sin Origin) y se verifican por su firma.
    if (
      this.reflector.getAllAndOverride<boolean>(META_ORIGEN_EXTERNO, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }
    const origen = p.headers.origin;
    if (origen !== undefined) {
      if (origen === this.entorno.WEB_ORIGEN) return true;
    } else if (p.headers['sec-fetch-site'] === 'same-origin') {
      return true;
    }
    throw new ErrorApp(
      403,
      'ORIGEN_NO_PERMITIDO',
      'La solicitud no viene de la web de NV Streaming.',
    );
  }
}
