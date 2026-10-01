import type { Provider, Type } from '@nestjs/common';
import { AccionesAsistenteService } from './acciones.service.js';
import { AsistenteController } from './asistente.controller.js';
import { AsistenteService } from './asistente.service.js';
import { ConfiguracionAsistenteService } from './configuracion.service.js';
import { HerramientasAsistenteService } from './herramientas/herramientas.service.js';
import { ProveedorAnthropic } from './proveedores/anthropic.proveedor.js';
import { ProveedorOllama } from './proveedores/ollama.proveedor.js';
import { RegistroProveedoresIa } from './proveedores/registro.js';
import { ProveedorSandboxIa } from './proveedores/sandbox.proveedor.js';

/** Controladores y servicios del asistente de IA (fase 5), registrados en AppModule. */
export const CONTROLADORES_ASISTENTE: Type[] = [AsistenteController];
export const PROVEEDORES_ASISTENTE: Provider[] = [
  ProveedorOllama,
  ProveedorAnthropic,
  ProveedorSandboxIa,
  RegistroProveedoresIa,
  ConfiguracionAsistenteService,
  HerramientasAsistenteService,
  AccionesAsistenteService,
  AsistenteService,
];
