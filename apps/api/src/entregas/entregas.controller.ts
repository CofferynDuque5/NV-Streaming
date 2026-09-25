import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  anularCodigoSchema,
  anularEntregaSchema,
  completarEntregaSchema,
  configurarEntregaSchema,
  filtroEntregasSchema,
  subirLoteSchema,
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
import { AccesosService } from './accesos.service.js';
import { EntregasService } from './entregas.service.js';
import { InventarioService } from './inventario.service.js';
import { ProveedoresEntregaService } from './proveedores-entrega.service.js';

const idValido = validar(uuidSchema);
const filtroCodigos = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  estado: z.enum(['disponible', 'reservado', 'entregado', 'anulado']).optional(),
});
/** Las respuestas con códigos o claves nunca se guardan en cachés ni en el historial. */
const SIN_CACHE = 'private, no-store, max-age=0';

/** Entregas de servicios para el equipo: estado, reintentos, completar a mano y anular. */
@ApiTags('Entregas')
@Controller('entregas')
export class EntregasController {
  constructor(@Inject(EntregasService) private readonly entregas: EntregasService) {}

  @Get()
  @RequierePermiso('entregas.ver')
  listar(@Query(validar(filtroEntregasSchema)) filtro: z.output<typeof filtroEntregasSchema>) {
    return this.entregas.listar(filtro);
  }

  @Get(':id')
  @RequierePermiso('entregas.ver')
  obtener(@Param('id', idValido) id: string) {
    return this.entregas.obtener(id);
  }

  @Post(':id/reintentar')
  @HttpCode(200)
  @RequierePermiso('entregas.gestionar')
  reintentar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.entregas.reintentar(auth, id, cliente);
  }

  @Post(':id/completar')
  @HttpCode(200)
  @RequierePermiso('entregas.gestionar')
  @DocCuerpo(completarEntregaSchema)
  completar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(completarEntregaSchema)) cuerpo: z.output<typeof completarEntregaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.entregas.completar(auth, id, cuerpo, cliente);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @RequierePermiso('entregas.gestionar')
  @DocCuerpo(anularEntregaSchema)
  anular(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(anularEntregaSchema)) cuerpo: z.output<typeof anularEntregaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.entregas.anular(auth, id, cuerpo.motivo, cliente);
  }
}

/** Inventario de códigos por plan: existencias, lotes y anulación de códigos. */
@ApiTags('Entregas')
@Controller('inventario')
export class InventarioController {
  constructor(@Inject(InventarioService) private readonly inventario: InventarioService) {}

  @Get()
  @RequierePermiso('inventario.gestionar')
  resumen() {
    return this.inventario.resumen();
  }

  @Get('planes/:planId')
  @RequierePermiso('inventario.gestionar')
  detalle(
    @Param('planId', idValido) planId: string,
    @Query(validar(filtroCodigos)) filtro: z.output<typeof filtroCodigos>,
  ) {
    return this.inventario.detalle(planId, filtro);
  }

  @Post('planes/:planId/lotes')
  @RequierePermiso('inventario.gestionar')
  @DocCuerpo(subirLoteSchema)
  subirLote(
    @Auth() auth: ContextoAuth,
    @Param('planId', idValido) planId: string,
    @Body(validar(subirLoteSchema)) cuerpo: z.output<typeof subirLoteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.inventario.subirLote(auth, planId, cuerpo, cliente);
  }

  @Post('codigos/:id/anular')
  @HttpCode(204)
  @RequierePermiso('inventario.gestionar')
  @DocCuerpo(anularCodigoSchema)
  async anularCodigo(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(anularCodigoSchema)) cuerpo: z.output<typeof anularCodigoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    await this.inventario.anularCodigo(auth, id, cuerpo.motivo, cliente);
  }
}

/** Configuración de entrega de un proveedor (adaptador, webhook y clave de firma). */
@ApiTags('Entregas')
@Controller('catalogo/proveedores')
export class ProveedoresEntregaController {
  constructor(
    @Inject(ProveedoresEntregaService) private readonly proveedores: ProveedoresEntregaService,
  ) {}

  @Get(':id/entrega')
  @RequierePermiso('catalogo.ver')
  obtener(@Param('id', idValido) id: string) {
    return this.proveedores.obtener(id);
  }

  @Put(':id/entrega')
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(configurarEntregaSchema)
  configurar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(configurarEntregaSchema)) cuerpo: z.output<typeof configurarEntregaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.proveedores.configurar(auth, id, cuerpo, cliente);
  }

  /** Genera una clave de firma nueva y la muestra una sola vez. */
  @Post(':id/entrega/secreto')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('catalogo.gestionar')
  rotarSecreto(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.proveedores.rotarSecreto(auth, id, cliente);
  }

  @Post(':id/entrega/probar')
  @HttpCode(200)
  @RequierePermiso('catalogo.gestionar')
  probar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.proveedores.probar(auth, id, cliente);
  }
}

/** «Mis accesos» del cliente: sus servicios entregados. El código se pide aparte. */
@ApiTags('Autoservicio del cliente')
@Controller('mi/accesos')
export class MisAccesosController {
  constructor(@Inject(AccesosService) private readonly accesos: AccesosService) {}

  @Get()
  @RequierePermiso('autoservicio.usar')
  listar(@Auth() auth: ContextoAuth) {
    return this.accesos.listar(auth, 'cliente');
  }

  @Post(':id/revelar')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('autoservicio.usar')
  revelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.accesos.revelar(auth, 'cliente', id, cliente);
  }
}

/** Accesos de los clientes del revendedor (sus compras de activaciones). */
@ApiTags('Revendedores: panel')
@Controller('revendedor/accesos')
export class AccesosRevendedorController {
  constructor(@Inject(AccesosService) private readonly accesos: AccesosService) {}

  @Get()
  @RequierePermiso('reventa.usar')
  listar(@Auth() auth: ContextoAuth) {
    return this.accesos.listar(auth, 'revendedor');
  }

  @Post(':id/revelar')
  @HttpCode(200)
  @Header('Cache-Control', SIN_CACHE)
  @RequierePermiso('reventa.usar')
  revelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.accesos.revelar(auth, 'revendedor', id, cliente);
  }
}
