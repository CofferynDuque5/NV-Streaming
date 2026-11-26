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
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarBuzonSchema,
  asuntoCodigoSchema,
  buscarCodigoSchema,
  buzonSchema,
  conectorSchema,
  pedirProveedorClienteSchema,
  pedirProveedorSchema,
  pegarSesionSpotifySchema,
  revisarSpotifySchema,
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
import { ConectorCodigosService } from './conector.service.js';
import { RevisionSpotifyService } from './revision-spotify.service.js';

const idValido = validar(uuidSchema);
const SIN_CACHE = 'private, no-store, max-age=0';
const sugerirSchema = z.object({ servicioId: uuidSchema });

/** Buzones IMAP donde llegan los códigos, asuntos por servicio y consulta del equipo. */
@ApiTags('Correos de códigos')
@Controller('codigos')
export class CodigosController {
  constructor(
    @Inject(CodigosService) private readonly codigos: CodigosService,
    @Inject(ConectorCodigosService) private readonly conector: ConectorCodigosService,
    @Inject(RevisionSpotifyService) private readonly spotify: RevisionSpotifyService,
  ) {}

  /** Cuentas Spotify del dominio propio y lo que encontró la última revisión de cada una. */
  @Get('spotify')
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('codigos.consultar')
  revisionesSpotify() {
    return this.spotify.listar();
  }

  /** Revisa ahora las cuentas pedidas (o todas las del dominio), una a la vez, en segundo plano. */
  @Post('spotify/revisar')
  @HttpCode(202)
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(revisarSpotifySchema)
  revisarSpotify(
    @Auth() auth: ContextoAuth,
    @Body(validar(revisarSpotifySchema)) cuerpo: z.output<typeof revisarSpotifySchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.spotify.revisar(auth, cuerpo, cliente);
  }

  /** Guarda cifrada la sesión (cookie sp_dc) de una cuenta, copiada del navegador. */
  @Post('spotify/:cuentaId/sesion')
  @HttpCode(200)
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(pegarSesionSpotifySchema)
  pegarSesionSpotify(
    @Auth() auth: ContextoAuth,
    @Param('cuentaId', idValido) cuentaId: string,
    @Body(validar(pegarSesionSpotifySchema)) cuerpo: z.output<typeof pegarSesionSpotifySchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.spotify.pegarSesion(auth, cuentaId, cuerpo, cliente);
  }

  /** Conexión con el panel del proveedor (ikercuentas): sin usuario ni clave. */
  @Get('conector')
  @RequierePermiso('codigos.consultar')
  verConector() {
    return this.conector.ver();
  }

  @Put('conector')
  @RequierePermiso('codigos.configurar')
  @DocCuerpo(conectorSchema)
  guardarConector(
    @Auth() auth: ContextoAuth,
    @Body(validar(conectorSchema)) cuerpo: z.output<typeof conectorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.conector.guardar(auth, cuerpo, cliente);
  }

  /** Entra al panel del proveedor (aprobando la IP por correo si hace falta). */
  @Post('conector/probar')
  @HttpCode(200)
  @RequierePermiso('codigos.configurar')
  probarConector(@Auth() auth: ContextoAuth, @Cliente() cliente: InfoCliente) {
    return this.conector.probar(auth, cliente);
  }

  /** Pulsa un botón del proveedor (Code, Code6, Link, sobre, Hogar). Queda registrado. */
  @Post('conector/pedir')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('codigos.consultar')
  @DocCuerpo(pedirProveedorSchema)
  pedirAlProveedor(
    @Auth() auth: ContextoAuth,
    @Body(validar(pedirProveedorSchema)) cuerpo: z.output<typeof pedirProveedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.conector.pedir(auth, cuerpo, cliente);
  }

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
  constructor(
    @Inject(CodigosService) private readonly codigos: CodigosService,
    @Inject(ConectorCodigosService) private readonly conector: ConectorCodigosService,
  ) {}

  /** Pulsa un botón del panel del proveedor para este perfil (Code, Code6, Link, sobre, Hogar). */
  @Post(':suscripcionId/codigo-proveedor')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(pedirProveedorClienteSchema)
  codigoProveedor(
    @Auth() auth: ContextoAuth,
    @Param('suscripcionId', idValido) suscripcionId: string,
    @Body(validar(pedirProveedorClienteSchema))
    cuerpo: z.output<typeof pedirProveedorClienteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.conector.pedirMio(auth, suscripcionId, cuerpo.accion, cliente);
  }

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

/** El revendedor pide el código de un perfil que vendió, desde «Accesos de clientes». */
@ApiTags('Revendedores: panel')
@Controller('revendedor/perfiles')
export class CodigosRevendedorController {
  constructor(
    @Inject(CodigosService) private readonly codigos: CodigosService,
    @Inject(ConectorCodigosService) private readonly conector: ConectorCodigosService,
  ) {}

  /** Pulsa un botón del panel del proveedor para este perfil (Code, Code6, Link, sobre, Hogar). */
  @Post(':suscripcionId/codigo-proveedor')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('reventa.usar')
  @DocCuerpo(pedirProveedorClienteSchema)
  codigoProveedor(
    @Auth() auth: ContextoAuth,
    @Param('suscripcionId', idValido) suscripcionId: string,
    @Body(validar(pedirProveedorClienteSchema))
    cuerpo: z.output<typeof pedirProveedorClienteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.conector.pedirDeRevendedor(auth, suscripcionId, cuerpo.accion, cliente);
  }

  @Post(':suscripcionId/codigo')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('reventa.usar')
  async codigo(
    @Auth() auth: ContextoAuth,
    @Param('suscripcionId', idValido) suscripcionId: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return { codigo: await this.codigos.buscarDeRevendedor(auth, suscripcionId, cliente) };
  }
}
