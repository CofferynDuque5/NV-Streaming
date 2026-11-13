import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type { CaidaCuenta, GrupoCaidas, ReporteCaidas } from '@nv/shared';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;
const MAX_CAIDAS = 1000;

/**
 * Reporte de caídas (el «reporte de caídas» del Gestor): cada vez que una
 * cuenta se marcó caída en el período, cuánto tardó en volver y los totales
 * por plataforma y por proveedor. Sale de la auditoría, que guarda cada
 * cambio de estado de las cuentas.
 */
@Injectable()
export class ReporteCaidasService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async ver(dias: number, ahora = new Date()): Promise<ReporteCaidas> {
    const desde = new Date(ahora.getTime() - dias * DIA_MS);
    // Los cambios de estado del período (y los que siguen abiertos de antes) ordenados por cuenta.
    const filas = await this.prisma.auditoria.findMany({
      where: {
        entidad: 'cuenta_servicio',
        fecha: { gte: desde },
        accion: 'cuenta_servicio.editada',
      },
      select: { entidadId: true, fecha: true, despues: true },
      orderBy: [{ entidadId: 'asc' }, { fecha: 'asc' }],
      take: 20_000,
    });

    const tramos: { cuentaId: string; caidaEn: Date; resueltaEn: Date | null }[] = [];
    const abiertas = new Map<string, Date>();
    for (const f of filas) {
      if (!f.entidadId) continue;
      const estado = (f.despues as { estado?: unknown } | null)?.estado;
      if (typeof estado !== 'string') continue;
      const abierta = abiertas.get(f.entidadId);
      if (estado === 'caida') {
        if (!abierta) abiertas.set(f.entidadId, f.fecha);
      } else if (abierta) {
        tramos.push({ cuentaId: f.entidadId, caidaEn: abierta, resueltaEn: f.fecha });
        abiertas.delete(f.entidadId);
      }
    }

    // Caídas que siguen abiertas: también las que empezaron antes del período.
    const caidasHoy = await this.prisma.cuentaServicio.findMany({
      where: { estado: 'caida' },
      select: { id: true, caidaEn: true },
    });
    for (const c of caidasHoy) {
      abiertas.delete(c.id);
      tramos.push({ cuentaId: c.id, caidaEn: c.caidaEn ?? ahora, resueltaEn: null });
    }
    // Las que el registro deja abiertas pero la cuenta ya no está caída (retirada, borrada…) se cierran ahí.
    for (const [cuentaId, caidaEn] of abiertas)
      tramos.push({ cuentaId, caidaEn, resueltaEn: caidaEn });

    const ids = [...new Set(tramos.map((t) => t.cuentaId))];
    const cuentas = await this.prisma.cuentaServicio.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        pista: true,
        proveedor: true,
        servicio: { select: { id: true, nombre: true } },
        _count: { select: { perfiles: { where: { estado: 'asignado' } } } },
      },
    });
    const porId = new Map(cuentas.map((c) => [c.id, c]));

    const caidas: CaidaCuenta[] = [];
    for (const t of tramos) {
      const c = porId.get(t.cuentaId);
      if (!c) continue;
      const fin = t.resueltaEn ?? ahora;
      caidas.push({
        cuenta: { id: c.id, pista: c.pista, servicio: c.servicio, proveedor: c.proveedor },
        caidaEn: iso(t.caidaEn)!,
        resueltaEn: iso(t.resueltaEn),
        horas: Math.max(0, Math.round((fin.getTime() - t.caidaEn.getTime()) / HORA_MS)),
        clientes: c._count.perfiles,
      });
    }
    caidas.sort((a, b) => b.caidaEn.localeCompare(a.caidaEn));

    return {
      desde: desde.toISOString(),
      hasta: ahora.toISOString(),
      caidas: caidas.slice(0, MAX_CAIDAS),
      porServicio: agrupar(caidas, (c) => c.cuenta.servicio.nombre),
      porProveedor: agrupar(caidas, (c) => c.cuenta.proveedor?.trim() || 'Sin proveedor'),
      sinResolver: caidas.filter((c) => c.resueltaEn === null).length,
    };
  }
}

function agrupar(caidas: CaidaCuenta[], clave: (c: CaidaCuenta) => string): GrupoCaidas[] {
  const mapa = new Map<string, GrupoCaidas>();
  for (const c of caidas) {
    const nombre = clave(c);
    const g = mapa.get(nombre) ?? { nombre, caidas: 0, horas: 0 };
    g.caidas += 1;
    g.horas += c.horas;
    mapa.set(nombre, g);
  }
  return [...mapa.values()].sort((a, b) => b.caidas - a.caidas || b.horas - a.horas);
}
