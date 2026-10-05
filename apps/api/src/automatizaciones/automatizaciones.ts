import type { Provider, Type } from '@nestjs/common';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { crearCanalWhatsApp, WHATSAPP } from '../avisos/whatsapp.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import {
  AutomatizacionesController,
  NotificacionesController,
  PreferenciasAvisosController,
} from './automatizaciones.controller.js';
import { ConfigAutomatizacionesService } from './configuracion.service.js';
import { EjecutorAutomatizacionesService } from './ejecutor.service.js';
import { PanelAutomatizacionesService } from './panel.service.js';
import { PlanificadorService } from './planificador.service.js';
import { TareasClientesService } from './tareas/clientes.service.js';
import { TareasEquipoService } from './tareas/equipo.service.js';
import { FuentesTasaService, TasaAutomaticaService } from './tasas/tasa-automatica.service.js';
import { TrabajadorService } from './trabajador.service.js';
import { TrabajosService } from './trabajos.service.js';

/** Controladores y servicios de automatizaciones y avisos, registrados en AppModule. */
export const CONTROLADORES_AUTOMATIZACIONES: Type[] = [
  AutomatizacionesController,
  NotificacionesController,
  PreferenciasAvisosController,
];
export const PROVEEDORES_AUTOMATIZACIONES: Provider[] = [
  {
    provide: WHATSAPP,
    useFactory: (entorno: Entorno) => crearCanalWhatsApp(entorno),
    inject: [ENTORNO],
  },
  ConfigAutomatizacionesService,
  TrabajosService,
  NotificacionesService,
  FuentesTasaService,
  TasaAutomaticaService,
  TareasClientesService,
  TareasEquipoService,
  EjecutorAutomatizacionesService,
  PlanificadorService,
  TrabajadorService,
  PanelAutomatizacionesService,
];
