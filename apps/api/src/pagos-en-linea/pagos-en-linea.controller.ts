import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  cobroAutomaticoSuscripcionSchema,
  type EstadoPasarela,
  filtroCobrosAutomaticosSchema,
  filtroEventosPasarelaSchema,
  INFO_PASARELA,
  iniciarPagoEnLineaSchema,
  PASARELAS,
  reembolsoSchema,
  retornoPagoSchema,
  revocarMetodoSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  OrigenExterno,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { CobrosAutomaticosService } from './cobros-automaticos.service.js';
import { IntentosPagoService } from './intentos.service.js';
import { MetodosAutorizadosService } from './metodos-autorizados.service.js';
import { ReembolsosService } from './reembolsos.service.js';
import { RegistroPasarelas } from './registro.service.js';
import { WebhooksService } from './webhooks.service.js';

const idValido = validar(uuidSchema);

/** Pagos en línea y métodos autorizados del propio cliente (un id ajeno responde 404). */
@ApiTags('Autoservicio del cliente')
@Controller('mi')
export class PagosEnLineaClienteController {
  constructor(
    @Inject(IntentosPagoService) private readonly intentos: IntentosPagoService,
    @Inject(MetodosAutorizadosService) private readonly metodos: MetodosAutorizadosService,
  ) {}

  @Get('facturas/:id/pago-en-linea')
  @RequierePermiso('autoservicio.usar')
  opciones(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.intentos.opciones(auth, id);
  }

  @Post('facturas/:id/pago-en-linea')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(iniciarPagoEnLineaSchema)
  iniciar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(iniciarPagoEnLineaSchema)) cuerpo: z.output<typeof iniciarPagoEnLineaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.intentos.iniciar(auth, id, cuerpo, cliente);
  }

  @Get('pagos-en-linea/:id')
  @RequierePermiso('autoservicio.usar')
  intento(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.intentos.obtener(auth, id);
  }

  @Post('pagos-en-linea/:id/retorno')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(retornoPagoSchema)
  retorno(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(retornoPagoSchema)) cuerpo: z.output<typeof retornoPagoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.intentos.retorno(auth, id, cuerpo.parametros, cliente);
  }

  @Post('pagos-en-linea/:id/cancelar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  cancelar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.intentos.cancelar(auth, id, cliente);
  }

  @Get('metodos-autorizados')
  @RequierePermiso('autoservicio.usar')
  metodosAutorizados(@Auth() auth: ContextoAuth) {
    return this.metodos.propios(auth);
  }

  @Post('metodos-autorizados/:id/revocar')
  @RequierePermiso('autoservicio.usar')
  @HttpCode(200)
  @DocCuerpo(revocarMetodoSchema)
  revocar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(revocarMetodoSchema)) cuerpo: z.output<typeof revocarMetodoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.metodos.revocar(auth, id, cuerpo.motivo ?? null, cliente);
  }

  @Put('suscripciones/:id/cobro-automatico')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(cobroAutomaticoSuscripcionSchema)
  cobroAutomatico(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(cobroAutomaticoSuscripcionSchema))
    cuerpo: z.output<typeof cobroAutomaticoSuscripcionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.metodos.asignar(auth, id, cuerpo.metodoAutorizadoId, cliente);
  }
}

/** Estado de las pasarelas (administración) y recepción de sus webhooks. */
@ApiTags('Pagos en línea')
@Controller('pasarelas')
export class PasarelasController {
  constructor(
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  @RequierePermiso('pasarelas.configurar')
  estado(): EstadoPasarela[] {
    return PASARELAS.map((p) => {
      const a = this.registro.adaptador(p);
      return {
        pasarela: p,
        nombre: INFO_PASARELA[p].nombre,
        configurada: a.configurada(),
        modo: a.modo,
        monedas: this.registro.monedas(p),
        admiteCobroRecurrente: INFO_PASARELA[p].admiteCobroRecurrente,
        urlWebhook: this.registro.urlWebhook(p),
      };
    });
  }

  /** Webhook de una pasarela: firma verificada con el cuerpo crudo; repetidos responden 200. */
  @Post(':pasarela/webhook')
  @Publica()
  @OrigenExterno()
  @HttpCode(200)
  webhook(@Param('pasarela') pasarela: string, @Req() peticion: FastifyRequest) {
    return this.webhooks.recibir(pasarela, peticion.headers, peticion.cuerpoCrudo);
  }
}

@ApiTags('Pagos en línea')
@Controller('cobros-automaticos')
export class CobrosAutomaticosController {
  constructor(
    @Inject(CobrosAutomaticosService) private readonly cobros: CobrosAutomaticosService,
  ) {}

  @Get()
  @RequierePermiso('facturas.ver')
  @DocConsulta(filtroCobrosAutomaticosSchema)
  listar(
    @Auth() auth: ContextoAuth,
    @Query(validar(filtroCobrosAutomaticosSchema))
    filtro: z.output<typeof filtroCobrosAutomaticosSchema>,
  ) {
    return this.cobros.listar(auth, filtro);
  }
}

@ApiTags('Pagos en línea')
@Controller('eventos-pasarela')
export class EventosPasarelaController {
  constructor(@Inject(WebhooksService) private readonly webhooks: WebhooksService) {}

  @Get()
  @RequierePermiso('pasarelas.configurar')
  @DocConsulta(filtroEventosPasarelaSchema)
  listar(
    @Query(validar(filtroEventosPasarelaSchema))
    filtro: z.output<typeof filtroEventosPasarelaSchema>,
  ) {
    return this.webhooks.listar(filtro);
  }

  @Post(':id/reprocesar')
  @RequierePermiso('pasarelas.configurar')
  @HttpCode(200)
  reprocesar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.webhooks.reprocesar(auth, id, cliente);
  }
}

/** Devoluciones de pagos en línea (la suscripción no se cancela sola). */
@ApiTags('Pagos y conciliación')
@Controller('pagos')
export class ReembolsosController {
  constructor(@Inject(ReembolsosService) private readonly reembolsos: ReembolsosService) {}

  @Get(':id/reembolsos')
  @RequierePermiso('facturas.ver')
  listar(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.reembolsos.listar(auth, id);
  }

  /** Acepta la cabecera `Idempotency-Key` para que un doble envío no devuelva dos veces. */
  @Post(':id/reembolsos')
  @RequierePermiso('pagos.reembolsar')
  @DocCuerpo(reembolsoSchema)
  solicitar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(reembolsoSchema)) cuerpo: z.output<typeof reembolsoSchema>,
    @Headers('idempotency-key') clave: string | undefined,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.reembolsos.solicitar(auth, id, cuerpo, clave, cliente);
  }
}

/** Métodos autorizados de un cliente, vistos por el equipo (respeta la cartera de ventas). */
@ApiTags('Clientes')
@Controller('clientes')
export class MetodosAutorizadosClienteController {
  constructor(
    @Inject(MetodosAutorizadosService) private readonly metodos: MetodosAutorizadosService,
  ) {}

  @Get(':id/metodos-autorizados')
  @RequierePermiso('clientes.ver')
  listar(@Auth() auth: ContextoAuth, @Param('id', idValido) id: string) {
    return this.metodos.deClienteConAlcance(auth, id);
  }

  @Post(':id/metodos-autorizados/:metodoId/revocar')
  @RequierePermiso('clientes.gestionar')
  @HttpCode(200)
  @DocCuerpo(revocarMetodoSchema)
  revocar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Param('metodoId', idValido) metodoId: string,
    @Body(validar(revocarMetodoSchema)) cuerpo: z.output<typeof revocarMetodoSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.metodos.revocar(auth, metodoId, cuerpo.motivo ?? null, cliente, id);
  }
}
