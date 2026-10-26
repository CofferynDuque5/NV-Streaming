import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
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

const idValido = validar(uuidSchema);

@ApiTags('Cuentas de servicio')
@Controller('cuentas')
export class CuentasController {
  constructor(@Inject(CuentasService) private readonly cuentas: CuentasService) {}

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
}
