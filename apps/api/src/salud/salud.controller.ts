import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrismaClient } from '@nv/db';
import { Publica } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';

@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  /**
   * Para el balanceador y el monitor: responde 200 solo si la base de datos contesta.
   * Con BASE_AHORRO solo la consulta si se pide `?base=1`: Docker llama cada 30 s y
   * la base nunca podría apagarse.
   */
  @Publica()
  @Get()
  async salud(@Query('base') base?: string) {
    if (this.entorno.BASE_AHORRO && base !== '1') return { estado: 'ok' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ErrorApp(503, 'BASE_DE_DATOS_NO_DISPONIBLE', 'La base de datos no responde.');
    }
    return { estado: 'ok' };
  }
}
