import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  cancelarSuscripcionSchema,
  crearSuscripcionSchema,
  listarSuscripcionesSchema,
  motivoSchema,
  renovarSchema,
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
import { SuscripcionesService } from './suscripciones.service.js';

const idValido = validar(uuidSchema);
const SIN_CACHE = 'private, no-store, max-age=0';

@ApiTags('Suscripciones')
@Controller('suscripciones')
export class SuscripcionesController {
  constructor(@Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService) {}

  @Get()
  @RequierePermiso('suscripciones.ver')
  @DocConsulta(listarSuscripcionesSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarSuscripcionesSchema)) filtro: z.output<typeof listarSuscripcionesSchema>,
  ) {
    return this.suscripciones.listar(auth, filtro);
  }

  @Post()
  @RequierePermiso('suscripciones.crear')
  @DocCuerpo(crearSuscripcionSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearSuscripcionSchema)) cuerpo: z.output<typeof crearSuscripcionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.crear(auth, cuerpo, cliente);
  }

  @Post('cotizar')
  @RequierePermiso('suscripciones.crear')
  @HttpCode(200)
  @DocCuerpo(crearSuscripcionSchema)
  cotizar(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearSuscripcionSchema)) cuerpo: z.output<typeof crearSuscripcionSchema>,
  ) {
    return this.suscripciones.cotizar(auth, cuerpo);
  }

  @Get('vencimientos')
  @RequierePermiso('suscripciones.ver')
  vencimientos(@Auth() auth: ContextoAuth) {
    return this.suscripciones.vencimientos(auth);
  }

  /** Cuánto devolver si se cancela hoy (proporcional a los días que le quedan). */
  @Get(':id/devolucion')
  @RequierePermiso('suscripciones.ver')
  devolucion(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.suscripciones.devolucion(auth, id);
  }

  @Get(':id')
  @RequierePermiso('suscripciones.ver')
  obtener(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.suscripciones.obtener(auth, id);
  }

  /** Datos de la compra con la contraseña de la cuenta del cliente. Auditado y con límite. */
  @Post(':id/revelar-datos')
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.revelar')
  @HttpCode(200)
  revelarDatos(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.revelarDatos(auth, id, cliente);
  }

  @Post(':id/renovar')
  @RequierePermiso('suscripciones.crear')
  @HttpCode(200)
  @DocCuerpo(renovarSchema)
  renovar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(renovarSchema)) cuerpo: z.output<typeof renovarSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.renovar(auth, id, cuerpo, cliente);
  }

  @Post(':id/pausar')
  @RequierePermiso('suscripciones.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoSchema)
  pausar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoSchema)) cuerpo: z.output<typeof motivoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.pausar(auth, id, cuerpo.motivo, cliente);
  }

  @Post(':id/reanudar')
  @RequierePermiso('suscripciones.gestionar')
  @HttpCode(200)
  reanudar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.reanudar(auth, id, cliente);
  }

  @Post(':id/cancelar')
  @RequierePermiso('suscripciones.gestionar')
  @HttpCode(200)
  @DocCuerpo(cancelarSuscripcionSchema)
  cancelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(cancelarSuscripcionSchema)) cuerpo: z.output<typeof cancelarSuscripcionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.cancelar(auth, id, cuerpo, cliente);
  }

  @Post(':id/revertir-cancelacion')
  @RequierePermiso('suscripciones.gestionar')
  @HttpCode(200)
  revertir(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.revertirCancelacion(auth, id, cliente);
  }
}
