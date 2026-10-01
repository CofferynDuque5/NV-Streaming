import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { crearClientePrisma, type PrismaClient } from '@nv/db';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Cifrador } from '../comun/cripto.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { CorreoService } from '../correo/correo.service.js';
import { LimitesService } from '../limites/limites.service.js';

const servicios = [AuditoriaService, CorreoService, LimitesService];

/** Servicios compartidos por todos los módulos: configuración, base de datos, cifrado, auditoría y correo. */
@Global()
@Module({})
export class NucleoModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  static con(entorno: Entorno) {
    return {
      module: NucleoModule,
      providers: [
        { provide: ENTORNO, useValue: entorno },
        { provide: PRISMA, useFactory: () => crearClientePrisma(entorno.DATABASE_URL) },
        {
          provide: Cifrador,
          useFactory: () => new Cifrador(Buffer.from(entorno.CLAVE_CIFRADO, 'base64')),
        },
        ...servicios,
      ],
      exports: [ENTORNO, PRISMA, Cifrador, ...servicios],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
