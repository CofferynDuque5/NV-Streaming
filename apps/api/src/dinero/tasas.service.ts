import { Inject, Injectable } from '@nestjs/common';
import type { Moneda, Prisma, PrismaClient } from '@nv/db';
import {
  MONEDAS_CON_TASA,
  type MonedaConTasa,
  type RegistrarTasaEntrada,
  type TasaVigente,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D, type Dec, type MapaTasas } from './dinero.js';

type Lector = Pick<PrismaClient, 'tasaCambio'> | Prisma.TransactionClient;

@Injectable()
export class TasasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Tasas vigentes (la más reciente de cada moneda que ya entró en vigor). */
  async mapa(tx: Lector = this.prisma): Promise<MapaTasas> {
    const filas = await tx.tasaCambio.findMany({
      where: { vigenteDesde: { lte: new Date() } },
      distinct: ['moneda'],
      orderBy: [{ moneda: 'asc' }, { vigenteDesde: 'desc' }],
      select: { moneda: true, valor: true },
    });
    const mapa: MapaTasas = new Map([['USD', D(1)]]);
    for (const f of filas) mapa.set(f.moneda, f.valor);
    return mapa;
  }

  async tasaDe(moneda: Moneda, tx: Lector = this.prisma): Promise<Dec> {
    const t = (await this.mapa(tx)).get(moneda);
    if (!t) throw sinTasa(moneda);
    return t;
  }

  async vigentes(): Promise<TasaVigente[]> {
    const filas = await this.prisma.tasaCambio.findMany({
      where: { vigenteDesde: { lte: new Date() } },
      distinct: ['moneda'],
      orderBy: [{ moneda: 'asc' }, { vigenteDesde: 'desc' }],
      include: { autor: { select: { id: true, nombre: true } } },
    });
    return filas.map((f) => ({
      moneda: f.moneda as MonedaConTasa,
      valor: f.valor.toFixed(6),
      vigenteDesde: iso(f.vigenteDesde)!,
      autor: f.autor,
      origen: f.origen === 'automatica' ? 'automatica' : 'manual',
      fuente: f.fuente,
    }));
  }

  async historial(moneda: MonedaConTasa): Promise<TasaVigente[]> {
    const filas = await this.prisma.tasaCambio.findMany({
      where: { moneda },
      orderBy: { vigenteDesde: 'desc' },
      take: 30,
      include: { autor: { select: { id: true, nombre: true } } },
    });
    return filas.map((f) => ({
      moneda,
      valor: f.valor.toFixed(6),
      vigenteDesde: iso(f.vigenteDesde)!,
      autor: f.autor,
      origen: f.origen === 'automatica' ? 'automatica' : 'manual',
      fuente: f.fuente,
    }));
  }

  async faltantes(): Promise<MonedaConTasa[]> {
    const mapa = await this.mapa();
    return MONEDAS_CON_TASA.filter((m) => !mapa.has(m));
  }

  async registrar(
    auth: ContextoAuth,
    entrada: RegistrarTasaEntrada,
    cliente: InfoCliente,
  ): Promise<TasaVigente> {
    return this.prisma.$transaction(async (tx) => {
      const anterior = (await this.mapa(tx)).get(entrada.moneda);
      const fila = await tx.tasaCambio.create({
        data: { moneda: entrada.moneda, valor: D(entrada.valor), autorId: auth.usuario.id },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'tasa.registrada',
          entidad: 'tasa_cambio',
          entidadId: fila.id,
          antes: anterior ? { moneda: entrada.moneda, valor: anterior.toFixed(6) } : undefined,
          despues: { moneda: entrada.moneda, valor: fila.valor.toFixed(6) },
          cliente,
        },
        tx,
      );
      return {
        moneda: entrada.moneda,
        valor: fila.valor.toFixed(6),
        vigenteDesde: iso(fila.vigenteDesde)!,
        autor: { id: auth.usuario.id, nombre: auth.usuario.nombre },
        origen: 'manual',
        fuente: null,
      };
    });
  }
}

export const sinTasa = (moneda: Moneda) =>
  new ErrorApp(
    409,
    'TASA_NO_DISPONIBLE',
    `Todavía no hay una tasa de cambio para ${moneda}. Elige otra moneda o avisa al equipo.`,
  );
