import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarBuzonSchema,
  asuntoCodigoSchema,
  buscarCodigoSchema,
  buzonSchema,
  uuidSchema,
} from '@nv/shared';
import { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { CodigosService } from './codigos.service.js';

const idValido = validar(uuidSchema);
const SIN_CACHE = 'private, no-store, max-age=0';
const sugerirSchema = z.object({ servicioId: uuidSchema });

/** Buzones IMAP donde llegan los códigos, asuntos por servicio y consulta del equipo. */
@ApiTags('Correos de códigos')
@Controller('codigos')
export class CodigosController {
  constructor(@Inject(CodigosService) private readonly codigos: CodigosService) {}

  @Get('buzones')
  @RequierePermiso('codigos.configurar')
  buzones() {
    return this.codigos.buzones();
  }

  @Post('buzones')
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(buzonSchema)
  crearBuzon(
    @Auth() auth: ContextoAuth,
    @Body(validar(buzonSchema)) cuerpo: z.output<typeof buzonSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.crearBuzon(auth, cuerpo, cliente);
  }

  @Patch('buzones/:id')
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(actualizarBuzonSchema)
  actualizarBuzon(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarBuzonSchema)) cuerpo: z.output<typeof actualizarBuzonSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.actualizarBuzon(auth, id, cuerpo, cliente);
  }

  @Delete('buzones/:id')
  @HttpCode(204)
  @RequierePermiso('codigos.configurar')
  async eliminarBuzon(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.codigos.eliminarBuzon(auth, id, cliente);
  }

  @Post('buzones/:id/probar')
  @HttpCode(200)
  @RequierePermiso('codigos.configurar')
  probarBuzon(@Param('id', idValido) id: string) {
    return this.codigos.probarBuzon(id);
  }

  @Get('asuntos')
  @RequierePermiso('codigos.consultar')
  asuntos() {
    return this.codigos.asuntos();
  }

  @Post('asuntos')
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(asuntoCodigoSchema)
  crearAsunto(
    @Auth() auth: ContextoAuth,
    @Body(validar(asuntoCodigoSchema)) cuerpo: z.output<typeof asuntoCodigoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.crearAsunto(auth, cuerpo, cliente);
  }

  @Post('asuntos/sugerir')
  @HttpCode(200)
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(sugerirSchema)
  sugerir(
    @Auth() auth: ContextoAuth,
    @Body(validar(sugerirSchema)) cuerpo: z.output<typeof sugerirSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.sugerirAsuntos(auth, cuerpo.servicioId, cliente);
  }

  @Delete('asuntos/:id')
  @RequierePermiso('codigos.configurar')
  eliminarAsunto(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.eliminarAsunto(auth, id, cliente);
  }

  /** Último código o enlace que llegó al correo de una cuenta. Queda registrado. */
  @Post('buscar')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('codigos.consultar')
  @DocCuerpo(buscarCodigoSchema)
  buscar(
    @Auth() auth: ContextoAuth,
    @Body(validar(buscarCodigoSchema)) cuerpo: z.output<typeof buscarCodigoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.codigos.buscar(auth, cuerpo, cliente);
  }
}

/** El cliente pide el código de su propio perfil desde «Mis accesos». */
@ApiTags('Autoservicio del cliente')
@Controller('mi/perfiles')
export class MisCodigosController {
  constructor(@Inject(CodigosService) private readonly codigos: CodigosService) {}

  @Post(':suscripcionId/codigo')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('autoservicio.usar')
  async codigo(
    @Auth() auth: ContextoAuth,
    @Param('suscripcionId', idValido) suscripcionId: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return { codigo: await this.codigos.buscarMio(auth, suscripcionId, cliente) };
  }
}
