import type { Provider, Type } from '@nestjs/common';
import { AccesosService } from './accesos.service.js';
import { AdaptadoresEntrega } from './adaptadores/registro.js';
import {
  AccesosRevendedorController,
  EntregasController,
  InventarioController,
  MisAccesosController,
  ProveedoresEntregaController,
} from './entregas.controller.js';
import { EntregasService } from './entregas.service.js';
import { InventarioService } from './inventario.service.js';
import { ProcesadorEntregasService } from './procesador.service.js';
import { ProveedoresEntregaService } from './proveedores-entrega.service.js';

/** Controladores y servicios de entregas (fase 6), registrados en AppModule. */
export const CONTROLADORES_ENTREGAS: Type[] = [
  EntregasController,
  InventarioController,
  ProveedoresEntregaController,
  MisAccesosController,
  AccesosRevendedorController,
];
export const PROVEEDORES_ENTREGAS: Provider[] = [
  AdaptadoresEntrega,
  EntregasService,
  AccesosService,
  InventarioService,
  ProveedoresEntregaService,
  ProcesadorEntregasService,
];
