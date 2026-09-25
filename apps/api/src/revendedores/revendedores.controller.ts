import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  actualizarNivelRevendedorSchema,
  actualizarRevendedorSchema,
  ajusteSaldoSchema,
  aprobarRevendedorSchema,
  comprarSchema,
  confirmarRecargaSchema,
  listarCarteraSchema,
  listarComprasSchema,
  listarMovimientosSchema,
  listarRecargasSchema,
  listarRevendedoresSchema,
  monedaSchema,
  motivoRevendedorSchema,
  nivelRevendedorSchema,
  precioMayoristaSchema,
  rechazarRecargaSchema,
  reembolsarCompraSchema,
  reportarRecargaSchema,
  solicitudRevendedorSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
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
import { ComprasService } from './compras.service.js';
import { NivelesService } from './niveles.service.js';
import { RevendedoresService } from './revendedores.service.js';
import { SaldoService } from './saldo.service.js';

const idValido = validar(uuidSchema);
const filtroMetodos = z.object({ moneda: monedaSchema.optional() });

// ── Solicitud (cliente) ──────────────────────────────────────────────────────

@ApiTags('Revendedores: solicitud')
@Controller('revendedor/solicitud')
export class SolicitudRevendedorController {
  constructor(@Inject(RevendedoresService) private readonly revendedores: RevendedoresService) {}

  /** La solicitud propia y su estado, o null si no ha solicitado. */
  @Get()
  @RequierePermiso('revendedor.solicitar')
  async obtener(@Auth() auth: ContextoAuth) {
    return { solicitud: await this.revendedores.miSolicitud(auth) };
  }

  @Post()
  @RequierePermiso('revendedor.solicitar')
  @DocCuerpo(solicitudRevendedorSchema)
  solicitar(
    @Auth() auth: ContextoAuth,
    @Body(validar(solicitudRevendedorSchema)) cuerpo: z.output<typeof solicitudRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.solicitar(auth, cuerpo, cliente);
  }
}

// ── Panel del revendedor ─────────────────────────────────────────────────────

/**
 * Panel del revendedor. Todo se limita a su propia ficha: un id de otro
 * revendedor responde 404.
 */
@ApiTags('Revendedores: panel')
@Controller('revendedor')
export class PanelRevendedorController {
  constructor(
    @Inject(ComprasService) private readonly compras: ComprasService,
    @Inject(SaldoService) private readonly saldo: SaldoService,
    @Inject(MetodosCobroService) private readonly metodos: MetodosCobroService,
  ) {}

  @Get('resumen')
  @RequierePermiso('reventa.usar')
  resumen(@Auth() auth: ContextoAuth) {
    return this.compras.resumen(auth);
  }

  @Get('catalogo')
  @RequierePermiso('reventa.usar')
  catalogo(@Auth() auth: ContextoAuth) {
    return this.compras.catalogo(auth);
  }

  @Get('metodos-cobro')
  @RequierePermiso('reventa.usar')
  metodosCobro(@Query(validar(filtroMetodos)) filtro: z.output<typeof filtroMetodos>) {
    return this.metodos.listar({ ...filtro, soloActivos: true, tipo: 'manual' });
  }

  @Get('recargas')
  @RequierePermiso('reventa.usar')
  @DocConsulta(listarRecargasSchema)
  recargas(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarRecargasSchema)) filtro: z.output<typeof listarRecargasSchema>,
  ) {
    return this.saldo.misRecargas(auth, filtro);
  }

  /** Reporta un pago para recargar saldo (multipart: campos + archivo "comprobante"). */
  @Post('recargas')
  @RequierePermiso('reventa.usar')
  @ApiConsumes('multipart/form-data')
  async reportarRecarga(
    @Auth() auth: ContextoAuth,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(reportarRecargaSchema).transform(campos);
    return this.saldo.reportarRecarga(auth, datos, archivo, cliente);
  }

  @Get('recargas/:id/comprobante')
  @RequierePermiso('reventa.usar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.saldo.comprobantePropio(auth, id));
  }

  @Get('movimientos')
  @RequierePermiso('reventa.usar')
  @DocConsulta(listarMovimientosSchema)
  movimientos(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarMovimientosSchema)) filtro: z.output<typeof listarMovimientosSchema>,
  ) {
    return this.saldo.misMovimientos(auth, filtro);
  }

  @Get('clientes')
  @RequierePermiso('reventa.usar')
  @DocConsulta(listarCarteraSchema)
  cartera(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarCarteraSchema)) filtro: z.output<typeof listarCarteraSchema>,
  ) {
    return this.compras.cartera(auth, filtro);
  }

  @Get('clientes/:id')
  @RequierePermiso('reventa.usar')
  cliente(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.compras.clienteDeCartera(auth, id);
  }

  @Get('compras')
  @RequierePermiso('reventa.usar')
  @DocConsulta(listarComprasSchema)
  misCompras(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarComprasSchema)) filtro: z.output<typeof listarComprasSchema>,
  ) {
    return this.compras.misCompras(auth, filtro);
  }

  /** Compra un alta o una renovación con saldo. Repetir la misma clave no vuelve a cobrar. */
  @Post('compras')
  @RequierePermiso('reventa.usar')
  @DocCuerpo(comprarSchema)
  comprar(
    @Auth() auth: ContextoAuth,
    @Body(validar(comprarSchema)) cuerpo: z.output<typeof comprarSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.compras.comprar(auth, cuerpo, cliente);
  }
}

// ── Administración ───────────────────────────────────────────────────────────

@ApiTags('Revendedores: administración')
@Controller('revendedores')
export class RevendedoresController {
  constructor(
    @Inject(RevendedoresService) private readonly revendedores: RevendedoresService,
    @Inject(NivelesService) private readonly niveles: NivelesService,
    @Inject(SaldoService) private readonly saldo: SaldoService,
    @Inject(ComprasService) private readonly compras: ComprasService,
  ) {}

  @Get()
  @RequierePermiso('revendedores.ver')
  @DocConsulta(listarRevendedoresSchema)
  listar(
    @Query(validar(listarRevendedoresSchema)) filtro: z.output<typeof listarRevendedoresSchema>,
  ) {
    return this.revendedores.listar(filtro);
  }

  @Get('resumen')
  @RequierePermiso('revendedores.ver')
  resumen() {
    return this.revendedores.resumenPrograma();
  }

  // Niveles y precios mayoristas

  @Get('niveles')
  @RequierePermiso('revendedores.ver')
  listarNiveles() {
    return this.niveles.listar();
  }

  @Post('niveles')
  @RequierePermiso('revendedores.gestionar')
  @DocCuerpo(nivelRevendedorSchema)
  crearNivel(
    @Auth() auth: ContextoAuth,
    @Body(validar(nivelRevendedorSchema)) cuerpo: z.output<typeof nivelRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.niveles.crear(auth, cuerpo, cliente);
  }

  @Patch('niveles/:id')
  @RequierePermiso('revendedores.gestionar')
  @DocCuerpo(actualizarNivelRevendedorSchema)
  actualizarNivel(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarNivelRevendedorSchema))
    cuerpo: z.output<typeof actualizarNivelRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.niveles.actualizar(auth, id, cuerpo, cliente);
  }

  @Get('precios')
  @RequierePermiso('revendedores.ver')
  precios() {
    return this.niveles.tabla();
  }

  @Put('precios')
  @RequierePermiso('revendedores.gestionar')
  @DocCuerpo(precioMayoristaSchema)
  fijarPrecio(
    @Auth() auth: ContextoAuth,
    @Body(validar(precioMayoristaSchema)) cuerpo: z.output<typeof precioMayoristaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.niveles.fijarPrecio(auth, cuerpo, cliente);
  }

  // Compras

  @Post('compras/:id/reembolsar')
  @RequierePermiso('revendedores.gestionar')
  @HttpCode(200)
  @DocCuerpo(reembolsarCompraSchema)
  reembolsar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(reembolsarCompraSchema)) cuerpo: z.output<typeof reembolsarCompraSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.compras.reembolsar(auth, id, cuerpo.motivo, cliente);
  }

  // Un revendedor

  @Get(':id')
  @RequierePermiso('revendedores.ver')
  obtener(@Param('id', idValido) id: string) {
    return this.revendedores.obtener(id);
  }

  @Patch(':id')
  @RequierePermiso('revendedores.gestionar')
  @DocCuerpo(actualizarRevendedorSchema)
  actualizar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(actualizarRevendedorSchema))
    cuerpo: z.output<typeof actualizarRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.actualizar(auth, id, cuerpo, cliente);
  }

  @Post(':id/aprobar')
  @RequierePermiso('revendedores.gestionar')
  @HttpCode(200)
  @DocCuerpo(aprobarRevendedorSchema)
  aprobar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(aprobarRevendedorSchema)) cuerpo: z.output<typeof aprobarRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.aprobar(auth, id, cuerpo, cliente);
  }

  @Post(':id/rechazar')
  @RequierePermiso('revendedores.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoRevendedorSchema)
  rechazar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoRevendedorSchema)) cuerpo: z.output<typeof motivoRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.rechazar(auth, id, cuerpo.motivo, cliente);
  }

  @Post(':id/suspender')
  @RequierePermiso('revendedores.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoRevendedorSchema)
  suspender(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoRevendedorSchema)) cuerpo: z.output<typeof motivoRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.suspender(auth, id, cuerpo.motivo, cliente);
  }

  @Post(':id/reactivar')
  @RequierePermiso('revendedores.gestionar')
  @HttpCode(200)
  @DocCuerpo(motivoRevendedorSchema)
  reactivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(motivoRevendedorSchema)) cuerpo: z.output<typeof motivoRevendedorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.revendedores.reactivar(auth, id, cuerpo.motivo, cliente);
  }

  @Get(':id/movimientos')
  @RequierePermiso('revendedores.ver')
  @DocConsulta(listarMovimientosSchema)
  movimientos(
    @Param('id', idValido) id: string,
    @Query(validar(listarMovimientosSchema)) filtro: z.output<typeof listarMovimientosSchema>,
  ) {
    return this.saldo.movimientos(id, filtro);
  }

  @Post(':id/ajustes')
  @RequierePermiso('revendedores.gestionar')
  @DocCuerpo(ajusteSaldoSchema)
  ajustar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(ajusteSaldoSchema)) cuerpo: z.output<typeof ajusteSaldoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.saldo.ajustar(auth, id, cuerpo, cliente);
  }

  @Get(':id/compras')
  @RequierePermiso('revendedores.ver')
  @DocConsulta(listarComprasSchema)
  comprasDe(
    @Param('id', idValido) id: string,
    @Query(validar(listarComprasSchema)) filtro: z.output<typeof listarComprasSchema>,
  ) {
    return this.compras.compras(id, filtro);
  }

  @Get(':id/recargas')
  @RequierePermiso('revendedores.ver')
  @DocConsulta(listarRecargasSchema)
  recargasDe(
    @Param('id', idValido) id: string,
    @Query(validar(listarRecargasSchema)) filtro: z.output<typeof listarRecargasSchema>,
  ) {
    return this.saldo.listarRecargas({ ...filtro, revendedorId: id });
  }
}

// ── Conciliación de recargas (quien concilia pagos) ──────────────────────────

@ApiTags('Revendedores: recargas')
@Controller('recargas-saldo')
export class RecargasController {
  constructor(@Inject(SaldoService) private readonly saldo: SaldoService) {}

  @Get()
  @RequierePermiso('pagos.gestionar')
  @DocConsulta(listarRecargasSchema)
  listar(@Query(validar(listarRecargasSchema)) filtro: z.output<typeof listarRecargasSchema>) {
    return this.saldo.listarRecargas(filtro);
  }

  @Get(':id/comprobante')
  @RequierePermiso('pagos.gestionar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.saldo.comprobante(auth, id, cliente));
  }

  @Post(':id/confirmar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(confirmarRecargaSchema)
  confirmar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(confirmarRecargaSchema)) cuerpo: z.output<typeof confirmarRecargaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.saldo.confirmarRecarga(auth, id, cuerpo, cliente);
  }

  @Post(':id/rechazar')
  @RequierePermiso('pagos.gestionar')
  @HttpCode(200)
  @DocCuerpo(rechazarRecargaSchema)
  rechazar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(rechazarRecargaSchema)) cuerpo: z.output<typeof rechazarRecargaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.saldo.rechazarRecarga(auth, id, cuerpo.motivo, cliente);
  }
}
