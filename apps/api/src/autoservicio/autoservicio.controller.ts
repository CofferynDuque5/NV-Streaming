import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  abrirTicketSchema,
  cancelarSuscripcionSchema,
  contratarSchema,
  listarFacturasSchema,
  listarPagosSchema,
  listarSuscripcionesSchema,
  listarTicketsSchema,
  monedaSchema,
  perfilClienteSchema,
  recotizarSchema,
  renovarSchema,
  reportarPagoSchema,
  type ResumenCliente,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ClientesService } from '../clientes/clientes.service.js';
import { enviarComprobante } from '../cobros/cobros.controller.js';
import { FacturasService } from '../cobros/facturas.service.js';
import { PagosService } from '../cobros/pagos.service.js';
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
import { TicketsService } from '../soporte/tickets.service.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';

const idValido = validar(uuidSchema);
const filtroMetodos = z.object({ moneda: monedaSchema });
const mensajeCliente = z.object({
  texto: z
    .string()
    .trim()
    .min(2, 'Escribe el mensaje.')
    .max(5000, 'El mensaje es demasiado largo.'),
});

/**
 * Autoservicio del cliente. Todas las consultas se limitan a su propia ficha
 * (ver `alcanceClientes`), así que un id ajeno responde 404.
 */
@ApiTags('Autoservicio del cliente')
@Controller('mi')
export class AutoservicioController {
  constructor(
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(FacturasService) private readonly facturas: FacturasService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(MetodosCobroService) private readonly metodos: MetodosCobroService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
  ) {}

  @Get('resumen')
  @RequierePermiso('autoservicio.usar')
  async resumen(@Auth() auth: ContextoAuth): Promise<ResumenCliente> {
    const propio = await this.clientes.deUsuario(auth.usuario);
    const [cliente, suscripciones, facturas, tickets] = await Promise.all([
      this.clientes.obtener(auth, propio.id),
      this.suscripciones.listar(auth, { pagina: 1, porPagina: 50 }),
      this.facturas.listar(auth, { pagina: 1, porPagina: 20, estado: 'emitida' }),
      this.tickets.listar(auth, { pagina: 1, porPagina: 1, abiertos: true }),
    ]);
    return {
      cliente,
      suscripciones: suscripciones.elementos.filter(
        (s) =>
          s.estado !== 'cancelada' ||
          !s.canceladaEn ||
          Date.now() - new Date(s.canceladaEn).getTime() < 30 * 24 * 3600_000,
      ),
      facturasPendientes: facturas.elementos,
      ticketsAbiertos: tickets.total,
    };
  }

  @Patch('perfil')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(perfilClienteSchema)
  perfil(
    @Auth() auth: ContextoAuth,
    @Body(validar(perfilClienteSchema)) cuerpo: z.output<typeof perfilClienteSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.clientes.actualizarPerfil(auth, cuerpo, cliente);
  }

  // ── Contratar y gestionar suscripciones ────────────────────────────────────

  @Post('cotizar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(contratarSchema)
  cotizar(
    @Auth() auth: ContextoAuth,
    @Body(validar(contratarSchema)) cuerpo: z.output<typeof contratarSchema>,
  ) {
    return this.suscripciones.cotizar(auth, cuerpo);
  }

  @Post('suscripciones')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(contratarSchema)
  contratar(
    @Auth() auth: ContextoAuth,
    @Body(validar(contratarSchema)) cuerpo: z.output<typeof contratarSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.crear(auth, cuerpo, cliente);
  }

  @Get('suscripciones')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarSuscripcionesSchema)
  suscripcionesPropias(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarSuscripcionesSchema)) filtro: z.output<typeof listarSuscripcionesSchema>,
  ) {
    return this.suscripciones.listar(auth, filtro);
  }

  @Get('suscripciones/:id')
  @RequierePermiso('autoservicio.usar')
  suscripcion(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.suscripciones.obtener(auth, id);
  }

  @Post('suscripciones/:id/renovar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(renovarSchema)
  renovar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(renovarSchema)) cuerpo: z.output<typeof renovarSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.renovar(auth, id, cuerpo.moneda, cliente);
  }

  /** El cliente programa la cancelación al vencimiento (o la cancela si aún no pagó). */
  @Post('suscripciones/:id/cancelar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(cancelarSuscripcionSchema)
  cancelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(cancelarSuscripcionSchema)) cuerpo: z.output<typeof cancelarSuscripcionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.cancelar(auth, id, { ...cuerpo, inmediata: false }, cliente);
  }

  @Post('suscripciones/:id/revertir-cancelacion')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  revertir(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.suscripciones.revertirCancelacion(auth, id, cliente);
  }

  // ── Facturas y pagos ───────────────────────────────────────────────────────

  @Get('facturas')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarFacturasSchema)
  facturasPropias(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarFacturasSchema)) filtro: z.output<typeof listarFacturasSchema>,
  ) {
    return this.facturas.listar(auth, filtro);
  }

  @Get('facturas/:id')
  @RequierePermiso('autoservicio.usar')
  factura(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.facturas.obtener(auth, id);
  }

  @Post('facturas/:id/recotizar')
  @RequierePermiso('autoservicio.usar')
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

  @Get('metodos-cobro')
  @RequierePermiso('autoservicio.usar')
  metodosCobro(@Query(validar(filtroMetodos)) filtro: z.output<typeof filtroMetodos>) {
    return this.metodos.listar({ moneda: filtro.moneda, soloActivos: true, tipo: 'manual' });
  }

  /** Reporta un pago con su comprobante (multipart: campos + archivo "comprobante"). */
  @Post('facturas/:id/pagos')
  @RequierePermiso('autoservicio.usar')
  @ApiConsumes('multipart/form-data')
  async reportarPago(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'comprobante');
    const datos = new ZodPipe(reportarPagoSchema).transform(campos);
    return this.pagos.reportar(auth, id, datos, archivo, cliente);
  }

  @Get('pagos')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarPagosSchema)
  pagosPropios(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarPagosSchema)) filtro: z.output<typeof listarPagosSchema>,
  ) {
    return this.pagos.listar(auth, filtro);
  }

  @Get('pagos/:id/comprobante')
  @RequierePermiso('autoservicio.usar')
  async comprobante(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
    @Res() respuesta: FastifyReply,
  ) {
    enviarComprobante(respuesta, await this.pagos.comprobante(auth, id, cliente));
  }

  // ── Soporte ────────────────────────────────────────────────────────────────

  @Get('tickets')
  @RequierePermiso('autoservicio.usar')
  @DocConsulta(listarTicketsSchema)
  ticketsPropios(
    @Auth() auth: ContextoAuth,
    @Query(validar(listarTicketsSchema)) filtro: z.output<typeof listarTicketsSchema>,
  ) {
    return this.tickets.listar(auth, filtro);
  }

  @Post('tickets')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(abrirTicketSchema)
  abrirTicket(
    @Auth() auth: ContextoAuth,
    @Body(validar(abrirTicketSchema)) cuerpo: z.output<typeof abrirTicketSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.abrir(auth, cuerpo, cliente);
  }

  @Get('tickets/:id')
  @RequierePermiso('autoservicio.usar')
  ticket(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.tickets.obtener(auth, id);
  }

  @Post('tickets/:id/mensajes')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(mensajeCliente)
  responder(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(mensajeCliente)) cuerpo: z.output<typeof mensajeCliente>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.responder(auth, id, { texto: cuerpo.texto, interno: false }, cliente);
  }

  @Post('tickets/:id/cerrar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  cerrarTicket(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.tickets.cerrarPorCliente(auth, id, cliente);
  }
}
