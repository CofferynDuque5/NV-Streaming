import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrismaClient } from '@nv/db';
import { Publica } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Para el balanceador y el monitor: responde 200 solo si la base de datos contesta. */
  @Publica()
  @Get()
  async salud() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ErrorApp(503, 'BASE_DE_DATOS_NO_DISPONIBLE', 'La base de datos no responde.');
    }
    return { estado: 'ok' };
  }
}
