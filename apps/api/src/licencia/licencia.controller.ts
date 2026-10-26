import { Body, Controller, Get, Header, Inject, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { cargarLicenciaSchema, esEquipo } from '@nv/shared';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  PermiteSinLicencia,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { Errores } from '../comun/errores.js';
import { validar } from '../comun/zod.pipe.js';
import { LicenciaService } from './licencia.service.js';

@ApiTags('Licencia')
@Controller('licencia')
@PermiteSinLicencia()
@RequierePermiso('panel.ver')
export class LicenciaController {
  constructor(@Inject(LicenciaService) private readonly licencia: LicenciaService) {}

  /** Estado de la licencia de esta instalación (solo el equipo). */
  @Get()
  @Header('Cache-Control', 'no-store')
  estado(@Auth() auth: ContextoAuth) {
    if (!esEquipo(auth.usuario.rol)) throw Errores.sinPermiso();
    return this.licencia.estado();
  }

  /** Pega la licencia nueva o la renovación (solo administración). */
  @Put()
  @DocCuerpo(cargarLicenciaSchema)
  cargar(
    @Body(validar(cargarLicenciaSchema)) cuerpo: z.output<typeof cargarLicenciaSchema>,
    @Auth() auth: ContextoAuth,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.licencia.cargar(cuerpo.licencia, auth, cliente);
  }
}
