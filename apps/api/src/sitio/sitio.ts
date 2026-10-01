import type { Provider, Type } from '@nestjs/common';
import { MediosService } from './medios.service.js';
import { SitioController, SitioPublicoController } from './sitio.controller.js';
import { SitioService } from './sitio.service.js';

/** Controladores y servicios del editor visual, registrados en AppModule. */
export const CONTROLADORES_SITIO: Type[] = [SitioController, SitioPublicoController];
export const PROVEEDORES_SITIO: Provider[] = [SitioService, MediosService];
