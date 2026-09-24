import type { Provider, Type } from '@nestjs/common';
import { ComprasService } from './compras.service.js';
import { NivelesService } from './niveles.service.js';
import {
  PanelRevendedorController,
  RecargasController,
  RevendedoresController,
  SolicitudRevendedorController,
} from './revendedores.controller.js';
import { RevendedoresService } from './revendedores.service.js';
import { SaldoService } from './saldo.service.js';

/** Controladores y servicios del programa de revendedores, registrados en AppModule. */
export const CONTROLADORES_REVENDEDORES: Type[] = [
  SolicitudRevendedorController,
  PanelRevendedorController,
  RevendedoresController,
  RecargasController,
];
export const PROVEEDORES_REVENDEDORES: Provider[] = [
  RevendedoresService,
  NivelesService,
  SaldoService,
  ComprasService,
];
