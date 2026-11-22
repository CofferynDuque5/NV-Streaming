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
   *
   * Con `?base=1` (lo usa infra/estado.sh) también dice cuánto tarda la base: la
   * primera consulta incluye despertarla si dormía y abrir la conexión; la segunda es
   * solo el viaje de ida y vuelta, lo que paga cada consulta de cada página.
   */
  @Publica()
  @Get()
  async salud(@Query('base') base?: string) {
    if (this.entorno.BASE_AHORRO && base !== '1') return { estado: 'ok' };
    try {
      const inicio = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      if (base !== '1') return { estado: 'ok' };
      const primera = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const fin = performance.now();
      return {
        estado: 'ok',
        baseMs: Math.round(primera - inicio),
        consultaMs: Math.round(fin - primera),
      };
    } catch {
      throw new ErrorApp(503, 'BASE_DE_DATOS_NO_DISPONIBLE', 'La base de datos no responde.');
    }
  }
}
