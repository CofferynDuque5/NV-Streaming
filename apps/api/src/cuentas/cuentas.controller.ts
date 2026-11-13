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
  pasarAIndividualesSchema,
  reponerPerfilSchema,
  reporteCaidasSchema,
  buscarAsignablesSchema,
  crearCuentaSchema,
  editarCuentaSchema,
  editarPerfilSchema,
  importarCuentasSchema,
  importarGestorSchema,
  listarCuentasSchema,
  revisarImportacionSchema,
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
import { ImportarCuentasService } from './importar-cuentas.service.js';
import { ImportarGestorService } from './importar-gestor.service.js';
import { ReporteCaidasService } from './reporte-caidas.service.js';
import { InventarioCuentasService } from './inventario-cuentas.service.js';
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
    @Inject(InventarioCuentasService) private readonly inventario: InventarioCuentasService,
    @Inject(ReporteCaidasService) private readonly caidas: ReporteCaidasService,
  ) {}

  /** Todas las cuentas con sus perfiles y quién los usa (sin secretos). */
  @Get('inventario')
  @RequierePermiso('cuentas.ver')
  verInventario(@Query('retiradas') retiradas?: string) {
    return this.inventario.ver(retiradas === 'true');
  }

  /** Cuentas sin credenciales: el correo va como pista. */
  @Get()
  @RequierePermiso('cuentas.ver')
  @DocConsulta(listarCuentasSchema)
  listar(@Query(validar(listarCuentasSchema)) q: z.output<typeof listarCuentasSchema>) {
    return this.cuentas.listar(q);
  }

  /** Caídas de los últimos N días, con cuánto tardaron en volver, por plataforma y proveedor. */
  @Get('reporte-caidas')
  @RequierePermiso('cuentas.ver')
  @DocConsulta(reporteCaidasSchema)
  reporteCaidas(@Query(validar(reporteCaidasSchema)) q: z.output<typeof reporteCaidasSchema>) {
    return this.caidas.ver(q.dias);
  }

  @Get('reposicion')
  @RequierePermiso('cuentas.ver')
  porReponer() {
    return this.cuentas.porReponer();
  }

  @Post('reposicion/:perfilId')
  @RequierePermiso('cuentas.gestionar')
  @HttpCode(200)
  @DocCuerpo(reponerPerfilSchema)
  reponer(
    @Auth() auth: ContextoAuth,
    @Param('perfilId', idValido) perfilId: string,
    @Body(validar(reponerPerfilSchema)) cuerpo: z.output<typeof reponerPerfilSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.reponer(auth, perfilId, cuerpo, cliente);
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
  @Post(':id/individuales')
  @RequierePermiso('cuentas.gestionar')
  @HttpCode(200)
  @DocCuerpo(pasarAIndividualesSchema)
  pasarAIndividuales(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(pasarAIndividualesSchema)) cuerpo: z.output<typeof pasarAIndividualesSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cuentas.pasarAIndividuales(auth, id, cuerpo.perfiles, cliente);
  }

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

/** Lista del proveedor (TXT o CSV, leída en el navegador): revisar y luego importar. */
@ApiTags('Cuentas de servicio')
@Controller('cuentas/importar')
export class ImportarCuentasController {
  constructor(@Inject(ImportarCuentasService) private readonly importar: ImportarCuentasService) {}

  /** No escribe nada: dice qué filas son nuevas, cuáles ya están y qué cambió. */
  @Post('revisar')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(revisarImportacionSchema)
  revisar(
    @Auth() auth: ContextoAuth,
    @Body(validar(revisarImportacionSchema)) cuerpo: z.output<typeof revisarImportacionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.importar.revisar(auth, cuerpo, cliente);
  }

  @Post()
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(importarCuentasSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(importarCuentasSchema)) cuerpo: z.output<typeof importarCuentasSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.importar.importar(auth, cuerpo, cliente);
  }
}

/** Importación del Gestor viejo (G6), plataforma por plataforma. Solo administración. */
@ApiTags('Cuentas de servicio')
@Controller('cuentas/gestor')
export class ImportarGestorController {
  constructor(@Inject(ImportarGestorService) private readonly gestor: ImportarGestorService) {}

  @Get('lotes')
  @RequierePermiso('cuentas.gestionar')
  lotes() {
    return this.gestor.lotes();
  }

  /** No escribe nada: cuadra conteos y montos de lo que se importaría. */
  @Post('simular')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(importarGestorSchema)
  simular(
    @Auth() auth: ContextoAuth,
    @Body(validar(importarGestorSchema)) cuerpo: z.output<typeof importarGestorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.gestor.simular(auth, cuerpo, cliente);
  }

  @Post('importar')
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('cuentas.gestionar')
  @DocCuerpo(importarGestorSchema)
  importar(
    @Auth() auth: ContextoAuth,
    @Body(validar(importarGestorSchema)) cuerpo: z.output<typeof importarGestorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.gestor.importar(auth, cuerpo, cliente);
  }

  @Post('lotes/:id/deshacer')
  @HttpCode(204)
  @RequierePermiso('cuentas.gestionar')
  async deshacer(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.gestor.revertir(auth, id, cliente);
  }
}
