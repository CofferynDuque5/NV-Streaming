import type { Provider, Type } from '@nestjs/common';
import { BilleterasController, MiBilleteraController } from './billetera.controller.js';
import { BilleteraService } from './billetera.service.js';
import { PedidosService } from './pedidos.service.js';

/** Controladores y servicios de la billetera y el carrito, registrados en AppModule. */
export const CONTROLADORES_BILLETERA: Type[] = [MiBilleteraController, BilleterasController];
export const PROVEEDORES_BILLETERA: Provider[] = [BilleteraService, PedidosService];
