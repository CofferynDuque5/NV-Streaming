import type { Provider, Type } from '@nestjs/common';
import { AdaptadorBinance } from './binance/binance.adaptador.js';
import { BinanceAdminController, BinanceClienteController } from './binance/binance.controller.js';
import { CorreosBinanceService } from './binance/correos-binance.service.js';
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
import { ComprobantesPaypalService } from './paypal-correo/comprobantes-paypal.service.js';
import { CorreosPaypalService } from './paypal-correo/correos-paypal.service.js';
import { LectorOcr } from './paypal-correo/lector-ocr.js';
import { AdaptadorPaypalCorreo } from './paypal-correo/paypal-correo.adaptador.js';
import {
  PaypalCorreoAdminController,
  PaypalCorreoClienteController,
} from './paypal-correo/paypal-correo.controller.js';
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
  BinanceClienteController,
  BinanceAdminController,
  PaypalCorreoClienteController,
  PaypalCorreoAdminController,
];
export const PROVEEDORES_PAGOS_EN_LINEA: Provider[] = [
  AdaptadorSandbox,
  AdaptadorPaypal,
  AdaptadorMercadoPago,
  AdaptadorBinance,
  AdaptadorPaypalCorreo,
  RegistroPasarelas,
  AvisosEquipoPagosService,
  MetodosAutorizadosService,
  IntentosPagoService,
  CobrosAutomaticosService,
  CorreosBinanceService,
  CorreosPaypalService,
  ComprobantesPaypalService,
  LectorOcr,
  ReembolsosService,
  WebhooksService,
];
