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
  confirmarPagoSchema,
  cuponSchema,
  monedaSchema,
  listarFacturasSchema,
  listarPagosSchema,
  motivoSchema,
  recotizarSchema,
  rechazarPagoSchema,
  registrarPagoSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
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
import { CuponesService } from './cupones.service.js';
import { FacturasService } from './facturas.service.js';
import { PagosService } from './pagos.service.js';

const idValido = validar(uuidSchema);
const filtroMetodos = z.object({ moneda: monedaSchema.optional() });

/** Envía un comprobante sin permitir que el navegador lo interprete como otra cosa. */
export function enviarComprobante(
  respuesta: FastifyReply,
  r: { archivo: { tipoMime: string; nombreOriginal: string }; contenido: Buffer },
) {
  void respuesta
    .header('content-type', r.archivo.tipoMime)
    .header(
      'content-disposition',
      `inline; filename="${r.archivo.nombreOriginal.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(r.archivo.nombreOriginal)}`,
    )
    .header(
      'content-security-policy',
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    )
    .header('cache-control', 'private, no-store')
    .send(r.contenido);
}

@ApiTags('Facturas')
@Controller('facturas')
export class FacturasController {
  constructor(
    @Inject(FacturasService) private readonly facturas: FacturasService,
    @Inject(PagosService) private readonly pagos: PagosService,
  ) {}

  @Get()
  @RequierePermiso('facturas.ver')
  @DocConsulta(listarFacturasSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarFacturasSchema)) filtro: z.output<typeof listarFacturasSchema>,
  ) {
    return this.facturas.listar(auth, filtro);
  }

  @Get(':id')
  @RequierePermiso('facturas.ver')
  obtener(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.facturas.obtener(auth, id);
  }

  @Post(':id/anular')
  @RequierePermiso('facturas.anular')
  @HttpCode(200)
  @DocCuerpo(motivoSchema)
  anular(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoSchema)) cuerpo: z.output<typeof motivoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.facturas.anular(auth, id, cuerpo.motivo, cliente);
  }

  @Post(':id/recotizar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(recotizarSchema)
  recotizar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(recotizarSchema)) cuerpo: z.output<typeof recotizarSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.facturas.recotizar(auth, id, cuerpo.moneda, cliente);
  }

  /** Pago recibido que registra el equipo (formulario multipart; el comprobante es opcional). */
  @Post(':id/pagos')
  @RequierePermiso('pagos.gestionar')
  @ApiConsumes('multipart/form-data')
  async registrarPago(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(registrarPagoSchema).transform(campos);
    return this.pagos.registrar(auth, id, datos, archivo, cliente);
  }
}

@ApiTags('Pagos y conciliación')
@Controller('pagos')
export class PagosController {
  constructor(
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(MetodosCobroService) private readonly metodos: MetodosCobroService,
  ) {}

  /** Métodos de cobro activos, para registrar un pago recibido. */
  @Get('metodos')
  @RequierePermiso('pagos.gestionar')
  metodosActivos(@Query(validar(filtroMetodos)) filtro: z.output<typeof filtroMetodos>) {
    return this.metodos.listar({ ...filtro, soloActivos: true });
  }

  @Get()
  @RequierePermiso('pagos.gestionar')
  @DocConsulta(listarPagosSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarPagosSchema)) filtro: z.output<typeof listarPagosSchema>,
  ) {
    return this.pagos.listar(auth, filtro);
  }

  @Get(':id')
  @RequierePermiso('pagos.gestionar')
  obtener(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.pagos.obtener(auth, id);
  }

  @Get(':id/comprobante')
  @RequierePermiso('pagos.gestionar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.pagos.comprobante(auth, id, cliente));
  }

  @Post(':id/confirmar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(confirmarPagoSchema)
  confirmar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(confirmarPagoSchema)) cuerpo: z.output<typeof confirmarPagoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.confirmar(auth, id, cuerpo, cliente);
  }

  @Post(':id/rechazar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(rechazarPagoSchema)
  rechazar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(rechazarPagoSchema)) cuerpo: z.output<typeof rechazarPagoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.pagos.rechazar(auth, id, cuerpo.motivo, cliente);
  }
}

@ApiTags('Cupones')
@Controller('cupones')
export class CuponesController {
  constructor(@Inject(CuponesService) private readonly cupones: CuponesService) {}

  @Get()
  @RequierePermiso('cupones.ver')
  listar() {
    return this.cupones.listar();
  }

  @Post()
  @RequierePermiso('cupones.gestionar')
  @DocCuerpo(cuponSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(cuponSchema)) cuerpo: z.output<typeof cuponSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cupones.crear(auth, cuerpo, cliente);
  }

  @Post(':id/desactivar')
  @RequierePermiso('cupones.gestionar')
  @HttpCode(200)
  desactivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cupones.cambiarActivo(auth, id, false, cliente);
  }

  @Post(':id/activar')
  @RequierePermiso('cupones.gestionar')
  @HttpCode(200)
  activar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.cupones.cambiarActivo(auth, id, true, cliente);
  }
}
