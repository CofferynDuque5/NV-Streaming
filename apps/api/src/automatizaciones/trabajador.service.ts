import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { hostname } from 'node:os';
import { type BeforeApplicationShutdown, Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { latidoVigenteMs } from './ahorro.js';
import { ConfigAutomatizacionesService } from './configuracion.service.js';
import { PlanificadorService } from './planificador.service.js';
import { TrabajosService } from './trabajos.service.js';

const LATIDO_MS = 30_000;
const VUELTA_PLANIFICADOR_MS = 30_000;
const PURGA_MS = 3600_000;
/** Con BASE_AHORRO, tras un aviso o un trabajo sigue mirando la cola este tiempo antes de dormir. */
const VENTANA_ACTIVA_MS = 30_000;

/**
 * Bucle del proceso trabajador: late cada 30 s, pasa el programador y procesa
 * la cola. Solo arranca con `iniciar()` (lo llama `trabajador.ts`); en la API
 * no hace nada. Al recibir SIGTERM termina el lote en curso y se detiene.
 *
 * Con BASE_AHORRO duerme TRABAJADOR_PAUSA_MINUTOS cuando no hay trabajo, para que
 * la base pueda apagarse, y escucha en TRABAJADOR_PUERTO: la API lo despierta
 * (POST /despertar) cuando hay algo nuevo y Docker comprueba su salud (GET /salud)
 * sin consultar la base.
 */
@Injectable()
export class TrabajadorService implements BeforeApplicationShutdown {
  private readonly logger = new Logger('Trabajador');
  private readonly id = `${hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`.slice(
    -120,
  );
  private readonly iniciadoEn = new Date();
  private activo = false;
  private bucle: Promise<void> | null = null;
  private despertar: (() => void) | null = null;
  private servidor: Server | null = null;
  private ultimaActividad = 0;
  private ultimaVueltaEn = Date.now();

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(PlanificadorService) private readonly planificador: PlanificadorService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  async iniciar(): Promise<void> {
    if (this.activo) return;
    this.activo = true;
    await this.config.asegurar();
    await this.prisma.latidoTrabajador.deleteMany({
      where: { ultimoLatidoEn: { lt: new Date(Date.now() - 24 * 3600_000) } },
    });
    await this.latir();
    if (this.entorno.BASE_AHORRO) await this.escuchar();
    this.bucle = this.ciclo();
    this.logger.log(`Trabajador ${this.id} en marcha.`);
  }

  /** Pausa tras una vuelta sin trabajo. */
  private pausaMs(): number {
    const normal = this.entorno.TRABAJADOR_ESPERA_SEGUNDOS * 1000;
    if (!this.entorno.BASE_AHORRO) return normal;
    if (Date.now() - this.ultimaActividad < VENTANA_ACTIVA_MS) return normal;
    return this.entorno.TRABAJADOR_PAUSA_MINUTOS * 60_000;
  }

  private escuchar(): Promise<void> {
    const servidor = createServer((peticion, respuesta) => {
      const ruta = peticion.url?.split('?')[0];
      if (peticion.method === 'POST' && ruta === '/despertar') {
        this.ultimaActividad = Date.now();
        this.despertar?.();
        respuesta.writeHead(204).end();
        return;
      }
      if (peticion.method === 'GET' && ruta === '/salud') {
        // Sano si el bucle completó una vuelta dentro del plazo que el panel tolera.
        const sano =
          this.activo && Date.now() - this.ultimaVueltaEn < latidoVigenteMs(this.entorno);
        respuesta.writeHead(sano ? 200 : 503).end();
        return;
      }
      respuesta.writeHead(404).end();
    });
    this.servidor = servidor;
    return new Promise((resolver, rechazar) => {
      servidor.once('error', rechazar);
      servidor.listen(this.entorno.TRABAJADOR_PUERTO, () => {
        servidor.off('error', rechazar);
        resolver();
      });
    });
  }

  private async ciclo(): Promise<void> {
    let ultimoLatido = Date.now();
    let ultimaVuelta = 0;
    let ultimaPurga = 0;
    while (this.activo) {
      try {
        const ahora = Date.now();
        if (ahora - ultimoLatido >= LATIDO_MS) {
          await this.latir();
          ultimoLatido = ahora;
        }
        if (ahora - ultimaVuelta >= VUELTA_PLANIFICADOR_MS) {
          await this.planificador.vuelta();
          ultimaVuelta = ahora;
        }
        if (ahora - ultimaPurga >= PURGA_MS) {
          await this.purgar();
          ultimaPurga = ahora;
        }
        this.ultimaVueltaEn = Date.now();
        if ((await this.trabajos.procesarLote(10)) > 0) {
          this.ultimaActividad = Date.now();
          continue;
        }
      } catch (e) {
        this.logger.error(
          `Error en el ciclo del trabajador: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      await this.esperar(this.pausaMs());
    }
  }

  /**
   * Limpieza horaria: trabajos terminados hace más de 30 días y ejecuciones sin
   * nada que contar (0 procesados, 0 errores) de hace más de 30 días.
   */
  private async purgar(): Promise<void> {
    await this.trabajos.purgar();
    await this.prisma.$executeRaw`
      DELETE FROM ejecuciones_automatizacion
      WHERE estado = 'completada' AND procesados = 0 AND errores = 0
        AND iniciada_en < now() - interval '30 days'`;
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
      const t = setTimeout(fin, ms);
      function fin() {
        clearTimeout(t);
        resolver();
      }
      this.despertar = fin;
    });
  }

  private async latir(): Promise<void> {
    const ahora = new Date();
    await this.prisma.latidoTrabajador.upsert({
      where: { id: this.id },
      create: {
        id: this.id,
        host: hostname().slice(0, 120),
        pid: process.pid,
        iniciadoEn: this.iniciadoEn,
        ultimoLatidoEn: ahora,
      },
      update: { ultimoLatidoEn: ahora },
    });
  }

  /** Antes de cerrar la base de datos: termina el lote en curso y borra su latido. */
  async beforeApplicationShutdown(): Promise<void> {
    if (!this.activo) return;
    this.activo = false;
    this.despertar?.();
    await this.bucle;
    await new Promise<void>((resolver) => {
      if (!this.servidor) return resolver();
      this.servidor.close(() => resolver());
      this.servidor.closeAllConnections();
    });
    await this.prisma.latidoTrabajador
      .deleteMany({ where: { id: this.id } })
      .catch(() => undefined);
    this.logger.log('Trabajador detenido.');
  }
}
