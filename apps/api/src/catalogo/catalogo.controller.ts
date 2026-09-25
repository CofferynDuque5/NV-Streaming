import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarPlanSchema,
  actualizarProveedorSchema,
  actualizarServicioSchema,
  planSchema,
  precioFijoSchema,
  proveedorSchema,
  servicioSchema,
  uuidSchema,
} from '@nv/shared';
import { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { CatalogoService } from './catalogo.service.js';

const idValido = validar(uuidSchema);
const filtroPlanes = z.object({ servicioId: uuidSchema.optional() });

@ApiTags('Catálogo')
@Controller('catalogo')
export class CatalogoController {
  constructor(@Inject(CatalogoService) private readonly catalogo: CatalogoService) {}

  /** Planes visibles con su precio en cada moneda. Lo usa el sitio público. */
  @Get()
  @Publica()
  publico() {
    return this.catalogo.publico();
  }

  @Get('proveedores')
  @RequierePermiso('catalogo.ver')
  proveedores() {
    return this.catalogo.proveedores();
  }

  @Post('proveedores')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(proveedorSchema)
  crearProveedor(
    @Auth() auth: ContextoAuth,
    @Body(validar(proveedorSchema)) cuerpo: z.output<typeof proveedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.crearProveedor(auth, cuerpo, cliente);
  }

  @Patch('proveedores/:id')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(actualizarProveedorSchema)
  actualizarProveedor(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarProveedorSchema)) cuerpo: z.output<typeof actualizarProveedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.actualizarProveedor(auth, id, cuerpo, cliente);
  }

  @Get('servicios')
  @RequierePermiso('catalogo.ver')
  servicios() {
    return this.catalogo.servicios();
  }

  @Post('servicios')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(servicioSchema)
  crearServicio(
    @Auth() auth: ContextoAuth,
    @Body(validar(servicioSchema)) cuerpo: z.output<typeof servicioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.crearServicio(auth, cuerpo, cliente);
  }

  @Patch('servicios/:id')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(actualizarServicioSchema)
  actualizarServicio(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarServicioSchema)) cuerpo: z.output<typeof actualizarServicioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.actualizarServicio(auth, id, cuerpo, cliente);
  }

  @Get('planes')
  @RequierePermiso('catalogo.ver')
  planes(@Query(validar(filtroPlanes)) filtro: z.output<typeof filtroPlanes>) {
    return this.catalogo.planes(filtro);
  }

  @Get('planes/:id')
  @RequierePermiso('catalogo.ver')
  plan(@Param('id', idValido) id: string) {
    return this.catalogo.plan(id);
  }

  @Post('planes')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(planSchema)
  crearPlan(
    @Auth() auth: ContextoAuth,
    @Body(validar(planSchema)) cuerpo: z.output<typeof planSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.crearPlan(auth, cuerpo, cliente);
  }

  @Patch('planes/:id')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(actualizarPlanSchema)
  actualizarPlan(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarPlanSchema)) cuerpo: z.output<typeof actualizarPlanSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.actualizarPlan(auth, id, cuerpo, cliente);
  }

  @Put('planes/:id/precio')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(precioFijoSchema)
  fijarPrecio(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(precioFijoSchema)) cuerpo: z.output<typeof precioFijoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.catalogo.fijarPrecio(auth, id, cuerpo, cliente);
  }
}
