import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditoriaController } from './auditoria/auditoria.controller.js';
import { AlmacenService } from './almacen/almacen.service.js';
import { AuthModule } from './auth/auth.module.js';
import {
  CONTROLADORES_AUTOMATIZACIONES,
  PROVEEDORES_AUTOMATIZACIONES,
} from './automatizaciones/automatizaciones.js';
import { AutoservicioController } from './autoservicio/autoservicio.controller.js';
import { CatalogoController } from './catalogo/catalogo.controller.js';
import { CatalogoService } from './catalogo/catalogo.service.js';
import { ClientesController } from './clientes/clientes.controller.js';
import { ClientesService } from './clientes/clientes.service.js';
import {
  CuponesController,
  FacturasController,
  PagosController,
} from './cobros/cobros.controller.js';
import { CuponesService } from './cobros/cupones.service.js';
import { FacturacionService } from './cobros/facturacion.service.js';
import { FacturasService } from './cobros/facturas.service.js';
import { PagosService } from './cobros/pagos.service.js';
import { FinanzasController } from './dinero/finanzas.controller.js';
import { MetodosCobroService } from './dinero/metodos-cobro.service.js';
import { TasasService } from './dinero/tasas.service.js';
import { MetricasController } from './metricas/metricas.controller.js';
import { MetricasService } from './metricas/metricas.service.js';
import { TicketsController } from './soporte/tickets.controller.js';
import { TicketsService } from './soporte/tickets.service.js';
import { SuscripcionesController } from './suscripciones/suscripciones.controller.js';
import { SuscripcionesService } from './suscripciones/suscripciones.service.js';
import { VencimientosService } from './suscripciones/vencimientos.service.js';
import { FiltroErrores } from './comun/errores.js';
import type { Entorno } from './config/entorno.js';
import { CuentaController } from './cuenta/cuenta.controller.js';
import { CuentaService } from './cuenta/cuenta.service.js';
import { OrigenGuard } from './guardias/origen.guard.js';
import { PermisosGuard } from './guardias/permisos.guard.js';
import { SesionGuard } from './guardias/sesion.guard.js';
import { NucleoModule } from './nucleo/nucleo.module.js';
import {
  CONTROLADORES_PAGOS_EN_LINEA,
  PROVEEDORES_PAGOS_EN_LINEA,
} from './pagos-en-linea/pagos-en-linea.js';
import {
  CONTROLADORES_REVENDEDORES,
  PROVEEDORES_REVENDEDORES,
} from './revendedores/revendedores.js';
import { CONTROLADORES_SITIO, PROVEEDORES_SITIO } from './sitio/sitio.js';
import { SaludController } from './salud/salud.controller.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';

@Module({})
export class AppModule {
  static con(entorno: Entorno): DynamicModule {
    return {
      module: AppModule,
      imports: [NucleoModule.con(entorno), AuthModule],
      controllers: [
        SaludController,
        CuentaController,
        UsuariosController,
        AuditoriaController,
        FinanzasController,
        CatalogoController,
        ClientesController,
        SuscripcionesController,
        FacturasController,
        PagosController,
        CuponesController,
        TicketsController,
        MetricasController,
        AutoservicioController,
        ...CONTROLADORES_REVENDEDORES,
        ...CONTROLADORES_SITIO,
        ...CONTROLADORES_AUTOMATIZACIONES,
        ...CONTROLADORES_PAGOS_EN_LINEA,
      ],
      providers: [
        CuentaService,
        UsuariosService,
        AlmacenService,
        TasasService,
        MetodosCobroService,
        CatalogoService,
        ClientesService,
        FacturacionService,
        SuscripcionesService,
        VencimientosService,
        FacturasService,
        PagosService,
        CuponesService,
        TicketsService,
        MetricasService,
        ...PROVEEDORES_REVENDEDORES,
        ...PROVEEDORES_SITIO,
        ...PROVEEDORES_AUTOMATIZACIONES,
        ...PROVEEDORES_PAGOS_EN_LINEA,
        { provide: APP_FILTER, useClass: FiltroErrores },
        // El orden importa: origen → sesión → permisos.
        { provide: APP_GUARD, useClass: OrigenGuard },
        { provide: APP_GUARD, useClass: SesionGuard },
        { provide: APP_GUARD, useClass: PermisosGuard },
      ],
    };
  }
}
