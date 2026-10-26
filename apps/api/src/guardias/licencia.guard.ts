import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { esEquipo } from '@nv/shared';
import type { FastifyRequest } from 'fastify';
import { META_SIN_LICENCIA } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { LicenciaService } from '../licencia/licencia.service.js';

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Con la licencia vencida, el equipo solo consulta: no crea ni cambia nada. Los
 * clientes, los revendedores, los webhooks de pago y el trabajador siguen igual,
 * para no dejar sin servicio a quien ya pagó.
 */
@Injectable()
export class LicenciaGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(LicenciaService) private readonly licencia: LicenciaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.licencia.controlActivo) return true;
    const peticion = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (METODOS_DE_LECTURA.has(peticion.method)) return true;
    if (!peticion.auth || !esEquipo(peticion.auth.usuario.rol)) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(META_SIN_LICENCIA, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }
    const estado = await this.licencia.estado();
    if (estado.permiteCambios) return true;
    throw new ErrorApp(
      403,
      'LICENCIA_VENCIDA',
      'La licencia de este sistema no está vigente: puedes consultar, pero no crear ni cambiar nada. Administración puede cargar una licencia vigente en Licencia.',
    );
  }
}
