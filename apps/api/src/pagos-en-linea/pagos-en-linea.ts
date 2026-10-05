import type { Provider, Type } from '@nestjs/common';
import { AvisosEquipoPagosService } from './avisos-equipo.service.js';
import { CobrosAutomaticosService } from './cobros-automaticos.service.js';
import { IntentosPagoService } from './intentos.service.js';
import { AdaptadorMercadoPago } from './mercadopago/mercadopago.adaptador.js';
import { MetodosAutorizadosService } from './metodos-autorizados.service.js';
import {
  CobrosAutomaticosController,
  EventosPasarelaController,
  MetodosAutorizadosClienteController,
  PagosEnLineaClienteController,
  PasarelasController,
  ReembolsosController,
} from './pagos-en-linea.controller.js';
import { AdaptadorPaypal } from './paypal/paypal.adaptador.js';
import { ReembolsosService } from './reembolsos.service.js';
import { RegistroPasarelas } from './registro.service.js';
import { AdaptadorSandbox } from './sandbox/sandbox.adaptador.js';
import { SandboxController } from './sandbox/sandbox.controller.js';
import { WebhooksService } from './webhooks.service.js';

/** Controladores y servicios de pagos en línea y cobros autorizados, registrados en AppModule. */
export const CONTROLADORES_PAGOS_EN_LINEA: Type[] = [
  PagosEnLineaClienteController,
  PasarelasController,
  SandboxController,
  CobrosAutomaticosController,
  EventosPasarelaController,
  ReembolsosController,
  MetodosAutorizadosClienteController,
];
export const PROVEEDORES_PAGOS_EN_LINEA: Provider[] = [
  AdaptadorSandbox,
  AdaptadorPaypal,
  AdaptadorMercadoPago,
  RegistroPasarelas,
  AvisosEquipoPagosService,
  MetodosAutorizadosService,
  IntentosPagoService,
  CobrosAutomaticosService,
  ReembolsosService,
  WebhooksService,
];
