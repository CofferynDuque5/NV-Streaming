import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  asignarPerfilSchema,
  buscarAsignablesSchema,
  crearCuentaSchema,
  editarCuentaSchema,
  editarPerfilSchema,
  listarCuentasSchema,
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
import { CuentasService } from './cuentas.service.js';
import { PerfilesClienteService } from './perfiles-cliente.service.js';

const idValido = validar(uuidSchema);

/** Las respuestas con credenciales no se guardan en ninguna caché. */
const SIN_CACHE = 'private, no-store, max-age=0';

@ApiTags('Cuentas de servicio')
@Controller('cuentas')
export class CuentasController {
  constructor(
    @Inject(CuentasService) private readonly cuentas: CuentasService,
    @Inject(PerfilesClienteService) private readonly perfiles: PerfilesClienteService,
  ) {}

  /** Cuentas sin credenciales: el correo va como pista. */
  @Get()
  @RequierePermiso('cuentas.ver')
  @DocConsulta(listarCuentasSchema)
  listar(@Query(validar(listarCuentasSchema)) q: z.output<typeof listarCuentasSchema>) {
    return this.cuentas.listar(q);
  }

  @Get(':id')
  @RequierePermiso('cuentas.ver')
  ver(@Param('id', idValido) id: string) {
    return this.cuentas.ver(id);
  }

  @Post()
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(crearCuentaSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearCuentaSchema)) cuerpo: z.output<typeof crearCuentaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.crear(auth, cuerpo, cliente);
  }

  @Patch(':id')
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(editarCuentaSchema)
  editar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(editarCuentaSchema)) cuerpo: z.output<typeof editarCuentaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.editar(auth, id, cuerpo, cliente);
  }

  /** Descifra correo, clave y PIN. Queda en la auditoría y tiene límite por hora. */
  @Post(':id/revelar')
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.revelar')
  revelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.revelar(auth, id, cliente);
  }

  @Get(':id/suscripciones-asignables')
  @RequierePermiso('cuentas.gestionar')
  @DocConsulta(buscarAsignablesSchema)
  asignables(
    @Param('id', idValido) id: string,
    @Query(validar(buscarAsignablesSchema)) q: z.output<typeof buscarAsignablesSchema>,
  ) {
    return this.cuentas.asignables(id, q.busqueda);
  }

  @Patch(':id/perfiles/:perfilId')
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(editarPerfilSchema)
  editarPerfil(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('perfilId', idValido) perfilId: string,
    @Body(validar(editarPerfilSchema)) cuerpo: z.output<typeof editarPerfilSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.editarPerfil(auth, id, perfilId, cuerpo, cliente);
  }

  @Post(':id/perfiles/:perfilId/asignar')
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(asignarPerfilSchema)
  asignar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('perfilId', idValido) perfilId: string,
    @Body(validar(asignarPerfilSchema)) cuerpo: z.output<typeof asignarPerfilSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.asignar(auth, id, perfilId, cuerpo.suscripcionId, cliente);
  }

  @Post(':id/perfiles/:perfilId/liberar')
  @RequierePermiso('cuentas.gestionar')
  liberar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('perfilId', idValido) perfilId: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.liberar(auth, id, perfilId, cliente);
  }

  /** Arma el mensaje con los datos del perfil para enviarlo a mano. Cuenta como ver credenciales. */
  @Post(':id/perfiles/:perfilId/mensaje')
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.revelar')
  mensaje(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('perfilId', idValido) perfilId: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.perfiles.mensaje(auth, id, perfilId, cliente);
  }
}

/** Perfiles de cuentas compartidas del cliente, en «Mis accesos». */
@ApiTags('Autoservicio del cliente')
@Controller('mi/perfiles')
export class MisPerfilesController {
  constructor(@Inject(PerfilesClienteService) private readonly perfiles: PerfilesClienteService) {}

  @Get()
  @RequierePermiso('autoservicio.usar')
  listar(@Auth() auth: ContextoAuth) {
    return this.perfiles.mios(auth);
  }

  @Post(':suscripcionId/revelar')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('autoservicio.usar')
  revelar(
    @Auth() auth: ContextoAuth,
    @Param('suscripcionId', idValido) suscripcionId: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.perfiles.revelarMio(auth, suscripcionId, cliente);
  }
}
