import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditoriaController } from './auditoria/auditoria.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { FiltroErrores } from './comun/errores.js';
import type { Entorno } from './config/entorno.js';
import { CuentaController } from './cuenta/cuenta.controller.js';
import { CuentaService } from './cuenta/cuenta.service.js';
import { OrigenGuard } from './guardias/origen.guard.js';
import { PermisosGuard } from './guardias/permisos.guard.js';
import { SesionGuard } from './guardias/sesion.guard.js';
import { NucleoModule } from './nucleo/nucleo.module.js';
import { SaludController } from './salud/salud.controller.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';

@Module({})
export class AppModule {
  static con(entorno: Entorno): DynamicModule {
    return {
      module: AppModule,
      imports: [NucleoModule.con(entorno), AuthModule],
      controllers: [SaludController, CuentaController, UsuariosController, AuditoriaController],
      providers: [
        CuentaService,
        UsuariosService,
        { provide: APP_FILTER, useClass: FiltroErrores },
        // El orden importa: origen → sesión → permisos.
        { provide: APP_GUARD, useClass: OrigenGuard },
        { provide: APP_GUARD, useClass: SesionGuard },
        { provide: APP_GUARD, useClass: PermisosGuard },
      ],
    };
  }
}
