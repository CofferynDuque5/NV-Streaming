import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type { ElementoPapelera, Referencia } from '@nv/shared';
import { PRISMA } from '../comun/tokens.js';

const MAX_POR_TIPO = 200;

/**
 * Papelera como la del Gestor, sin borrar nada de verdad: en el panel un cliente
 * se archiva, una cuenta se retira y una plataforma se apaga, y todo conserva su
 * historial. Aquí se juntan para restaurarlos, con quién y cuándo los quitó
 * según el registro de eventos.
 */
@Injectable()
export class PapeleraService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Último registro que coincide para cada entidad: quién y cuándo la quitó. */
  private async quienes(
    entidad: string,
    ids: string[],
    condicion: Prisma.AuditoriaWhereInput,
  ): Promise<Map<string, { fecha: Date; actor: Referencia | null }>> {
    const mapa = new Map<string, { fecha: Date; actor: Referencia | null }>();
    if (!ids.length) return mapa;
    const filas = await this.prisma.auditoria.findMany({
      where: { entidad, entidadId: { in: ids }, ...condicion },
      select: { entidadId: true, fecha: true, actor: { select: { id: true, nombre: true } } },
      orderBy: { fecha: 'desc' },
    });
    for (const f of filas) {
      if (f.entidadId && !mapa.has(f.entidadId))
        mapa.set(f.entidadId, { fecha: f.fecha, actor: f.actor });
    }
    return mapa;
  }

  async listar(): Promise<ElementoPapelera[]> {
    const [clientes, cuentas, servicios] = await Promise.all([
      this.prisma.cliente.findMany({
        where: { estado: 'archivado' },
        select: { id: true, nombre: true, correo: true, actualizadoEn: true },
        orderBy: { actualizadoEn: 'desc' },
        take: MAX_POR_TIPO,
      }),
      this.prisma.cuentaServicio.findMany({
        where: { estado: 'retirada' },
        select: {
          id: true,
          pista: true,
          actualizadoEn: true,
          servicio: { select: { nombre: true } },
        },
        orderBy: { actualizadoEn: 'desc' },
        take: MAX_POR_TIPO,
      }),
      this.prisma.servicio.findMany({
        where: { activo: false },
        select: {
          id: true,
          nombre: true,
          actualizadoEn: true,
          _count: { select: { cuentas: true } },
        },
        orderBy: { actualizadoEn: 'desc' },
        take: MAX_POR_TIPO,
      }),
    ]);
    const [qClientes, qCuentas, qServicios] = await Promise.all([
      this.quienes(
        'cliente',
        clientes.map((c) => c.id),
        { accion: 'cliente.archivado' },
      ),
      this.quienes(
        'cuenta_servicio',
        cuentas.map((c) => c.id),
        { despues: { path: ['estado'], equals: 'retirada' } },
      ),
      this.quienes(
        'servicio',
        servicios.map((s) => s.id),
        { despues: { path: ['activo'], equals: false } },
      ),
    ]);
    const quitado = (
      q: Map<string, { fecha: Date; actor: Referencia | null }>,
      id: string,
      respaldo: Date,
    ) => {
      const r = q.get(id);
      return { quitadoEn: (r?.fecha ?? respaldo).toISOString(), quitadoPor: r?.actor ?? null };
    };
    const elementos: ElementoPapelera[] = [
      ...clientes.map((c) => ({
        tipo: 'cliente' as const,
        id: c.id,
        nombre: c.nombre,
        detalle: c.correo,
        ...quitado(qClientes, c.id, c.actualizadoEn),
      })),
      ...cuentas.map((c) => ({
        tipo: 'cuenta' as const,
        id: c.id,
        nombre: c.pista,
        detalle: c.servicio.nombre,
        ...quitado(qCuentas, c.id, c.actualizadoEn),
      })),
      ...servicios.map((s) => ({
        tipo: 'plataforma' as const,
        id: s.id,
        nombre: s.nombre,
        detalle: s._count.cuentas === 1 ? '1 cuenta' : `${s._count.cuentas} cuentas`,
        ...quitado(qServicios, s.id, s.actualizadoEn),
      })),
    ];
    return elementos.sort((a, b) => b.quitadoEn.localeCompare(a.quitadoEn));
  }
}
