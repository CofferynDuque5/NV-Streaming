import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type CuentaInventario,
  type EstadoSuscripcion,
  type Inventario,
  type ServicioInventario,
  urlMedio,
} from '@nv/shared';
import { fechaCaracas } from '../automatizaciones/horario.js';
import { dec2, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { dia } from './cuentas.service.js';

const TERMINADAS: readonly EstadoSuscripcion[] = ['vencida', 'cancelada'];
const DIA_MS = 86_400_000;
/** Un perfil «por vencer» vence en los próximos N días. */
export const DIAS_POR_VENCER = 3;

/**
 * Inventario como el del Gestor: todas las cuentas (menos las retiradas) con
 * sus perfiles, el cliente que usa cada uno y cuándo vence. Sin secretos.
 */
@Injectable()
export class InventarioCuentasService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async ver(incluirRetiradas = false, ahora = new Date()): Promise<Inventario> {
    const filas = await this.prisma.cuentaServicio.findMany({
      where: incluirRetiradas ? {} : { estado: { not: 'retirada' } },
      include: {
        servicio: { select: { id: true, nombre: true, imagenId: true } },
        perfiles: {
          orderBy: { numero: 'asc' },
          include: {
            suscripcion: {
              select: {
                id: true,
                estado: true,
                venceEn: true,
                cliente: { select: { id: true, nombre: true } },
              },
            },
          },
        },
      },
      orderBy: [{ estado: 'asc' }, { facturaEn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    const limite = ahora.getTime() + DIAS_POR_VENCER * DIA_MS;
    const porServicio = new Map<string, ServicioInventario>();
    for (const c of filas) {
      let grupo = porServicio.get(c.servicio.id);
      if (!grupo) {
        grupo = {
          servicio: {
            id: c.servicio.id,
            nombre: c.servicio.nombre,
            logoUrl: c.servicio.imagenId ? urlMedio(c.servicio.imagenId) : null,
          },
          cuentas: [],
          conteo: {
            cuentas: 0,
            caidas: 0,
            perfiles: 0,
            libres: 0,
            ocupados: 0,
            bloqueados: 0,
            respaldos: 0,
            porVencer: 0,
            vencidos: 0,
          },
        };
        porServicio.set(c.servicio.id, grupo);
      }
      const k = grupo.conteo;
      k.cuentas++;
      if (c.estado === 'caida') k.caidas++;
      const cuenta: CuentaInventario = {
        id: c.id,
        pista: c.pista,
        modo: c.modo,
        estado: c.estado,
        plan: c.plan,
        pais: c.pais,
        facturaEn: dia(c.facturaEn),
        costoUsd: dec2(c.costoUsd),
        proveedor: c.proveedor,
        perfiles: c.perfiles.map((p) => {
          const s = p.suscripcion;
          k.perfiles++;
          if (p.estado === 'libre') k.libres++;
          else if (p.estado === 'bloqueado') k.bloqueados++;
          else if (p.estado === 'respaldo') k.respaldos++;
          else {
            k.ocupados++;
            if (s && TERMINADAS.includes(s.estado)) k.vencidos++;
            else if (s?.venceEn && s.venceEn.getTime() <= limite) k.porVencer++;
          }
          return {
            id: p.id,
            numero: p.numero,
            nombre: p.nombre,
            estado: p.estado,
            tienePin: Boolean(p.pinCifrado),
            nota: p.nota,
            cliente: s?.cliente ?? null,
            suscripcionId: s?.id ?? null,
            estadoSuscripcion: s?.estado ?? null,
            venceEn: s ? iso(s.venceEn) : null,
          };
        }),
      };
      grupo.cuentas.push(cuenta);
    }
    return {
      servicios: [...porServicio.values()].sort((a, b) =>
        a.servicio.nombre.localeCompare(b.servicio.nombre, 'es'),
      ),
      hoy: fechaCaracas(ahora),
    };
  }
}
