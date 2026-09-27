import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  ajusteSaldoSchema,
  type BilleteraPublica,
  confirmarRecargaSchema,
  cotizarPedidoSchema,
  crearPedidoSchema,
  listarPedidosSchema,
  listarRecargasBilleteraSchema,
  paginacionSchema,
  rechazarRecargaSchema,
  reportarRecargaBilleteraSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { enviarComprobante } from '../cobros/cobros.controller.js';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { leerFormulario } from '../comun/formulario.js';
import { validar, ZodPipe } from '../comun/zod.pipe.js';
import { MetodosCobroService } from '../dinero/metodos-cobro.service.js';
import { BilleteraService } from './billetera.service.js';
import { PedidosService } from './pedidos.service.js';

const idValido = validar(uuidSchema);

/** Billetera y carrito del cliente directo (siempre sobre su propia ficha). */
@ApiTags('Autoservicio: billetera y carrito')
@Controller('mi')
export class MiBilleteraController {
  constructor(
    @Inject(BilleteraService) private readonly billetera: BilleteraService,
    @Inject(PedidosService) private readonly pedidos: PedidosService,
    @Inject(MetodosCobroService) private readonly metodos: MetodosCobroService,
  ) {}

  @Get('billetera')
  @RequierePermiso('autoservicio.usar')
  resumen(@Auth() auth: ContextoAuth): Promise<BilleteraPublica> {
    return this.billetera.resumen(auth);
  }

  /** Métodos con los que se puede recargar (pagos manuales con comprobante). */
  @Get('billetera/metodos-cobro')
  @RequierePermiso('autoservicio.usar')
  metodosCobro() {
    return this.metodos.listar({ soloActivos: true, tipo: 'manual' });
  }

  @Get('billetera/movimientos')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(paginacionSchema)
  movimientos(
    @Auth() auth: ContextoAuth,
    @Query(validar(paginacionSchema)) filtro: z.output<typeof paginacionSchema>,
  ) {
    return this.billetera.misMovimientos(auth, filtro);
  }

  @Get('billetera/recargas')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarRecargasBilleteraSchema)
  recargas(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarRecargasBilleteraSchema))
    filtro: z.output<typeof listarRecargasBilleteraSchema>,
  ) {
    return this.billetera.misRecargas(auth, filtro);
  }

  /** Reporta un pago para recargar la billetera (multipart: campos + archivo "comprobante"). */
  @Post('billetera/recargas')
  @RequierePermiso('autoservicio.usar')
  @ApiConsumes('multipart/form-data')
  async reportarRecarga(
    @Auth() auth: ContextoAuth,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(reportarRecargaBilleteraSchema).transform(campos);
    return this.billetera.reportarRecarga(auth, datos, archivo, cliente);
  }

  @Get('billetera/recargas/:id/comprobante')
  @RequierePermiso('autoservicio.usar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.billetera.comprobantePropio(auth, id));
  }

  @Post('facturas/:id/pagar-con-saldo')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  pagarFactura(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.billetera.pagarFactura(auth, id, cliente);
  }

  @Post('pedidos/cotizar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(cotizarPedidoSchema)
  cotizar(
    @Auth() auth: ContextoAuth,
    @Body(validar(cotizarPedidoSchema)) cuerpo: z.output<typeof cotizarPedidoSchema>,
  ) {
    return this.pedidos.cotizar(auth, cuerpo);
  }

  @Post('pedidos')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(crearPedidoSchema)
  crearPedido(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearPedidoSchema)) cuerpo: z.output<typeof crearPedidoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pedidos.crear(auth, cuerpo, cliente);
  }

  @Get('pedidos')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarPedidosSchema)
  listarPedidos(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarPedidosSchema)) filtro: z.output<typeof listarPedidosSchema>,
  ) {
    return this.pedidos.listar(auth, filtro);
  }

  @Get('pedidos/:id')
  @RequierePermiso('autoservicio.usar')
  pedido(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.pedidos.obtener(auth, id);
  }

  @Post('pedidos/:id/pagar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  pagarPedido(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pedidos.pagar(auth, id, cliente);
  }

  @Post('pedidos/:id/cancelar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  cancelarPedido(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pedidos.cancelar(auth, id, cliente);
  }
}

// ── Equipo: conciliación de recargas y saldo de cada cliente ────────────────

@ApiTags('Billeteras de clientes')
@Controller('billeteras')
export class BilleterasController {
  constructor(@Inject(BilleteraService) private readonly billetera: BilleteraService) {}

  @Get('recargas')
  @RequierePermiso('pagos.gestionar')
  @DocConsulta(listarRecargasBilleteraSchema)
  listar(
    @Query(validar(listarRecargasBilleteraSchema))
    filtro: z.output<typeof listarRecargasBilleteraSchema>,
  ) {
    return this.billetera.listarRecargas(filtro);
  }

  @Get('recargas/:id/comprobante')
  @RequierePermiso('pagos.gestionar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.billetera.comprobante(auth, id, cliente));
  }

  @Post('recargas/:id/confirmar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(confirmarRecargaSchema)
  confirmar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(confirmarRecargaSchema)) cuerpo: z.output<typeof confirmarRecargaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.billetera.confirmarRecarga(auth, id, cuerpo, cliente);
  }

  @Post('recargas/:id/rechazar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(rechazarRecargaSchema)
  rechazar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(rechazarRecargaSchema)) cuerpo: z.output<typeof rechazarRecargaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.billetera.rechazarRecarga(auth, id, cuerpo.motivo, cliente);
  }

  @Get('clientes/:id')
  @RequierePermiso('clientes.ver')
  @DocConsulta(paginacionSchema)
  deCliente(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Query(validar(paginacionSchema)) filtro: z.output<typeof paginacionSchema>,
  ) {
    return this.billetera.deCliente(auth, id, filtro);
  }

  @Post('clientes/:id/ajustes')
  @RequierePermiso('billeteras.ajustar')
  @DocCuerpo(ajusteSaldoSchema)
  ajustar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(ajusteSaldoSchema)) cuerpo: z.output<typeof ajusteSaldoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.billetera.ajustar(auth, id, cuerpo, cliente);
  }
}
