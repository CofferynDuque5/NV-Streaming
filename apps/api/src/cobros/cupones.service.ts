import { Inject, Injectable } from '@nestjs/common';
import type { Cupon, PrismaClient } from '@nv/db';
import {
  type CuponEntrada,
  type CuponPublico,
  DESCUENTO_MAXIMO_VENTAS,
  limitadoACartera,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { D } from '../dinero/dinero.js';

type CuponCompleto = Cupon & {
  planes: { plan: { id: string; nombre: string } }[];
  creadoPor: { id: string; nombre: string };
};

const INCLUIR = {
  planes: { select: { plan: { select: { id: true, nombre: true } } } },
  creadoPor: { select: { id: true, nombre: true } },
} as const;

const cuponPublico = (c: CuponCompleto): CuponPublico => ({
  id: c.id,
  codigo: c.codigo,
  tipo: c.tipo,
  valor: c.valor.toFixed(2),
  validoDesde: iso(c.validoDesde),
  validoHasta: iso(c.validoHasta),
  usosMaximos: c.usosMaximos,
  usos: c.usos,
  soloAltas: c.soloAltas,
  activo: c.activo,
  planes: c.planes.map((p) => p.plan),
  creadoPor: c.creadoPor,
  creadoEn: iso(c.creadoEn)!,
});

@Injectable()
export class CuponesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<CuponPublico[]> {
    const filas = await this.prisma.cupon.findMany({
      include: INCLUIR,
      orderBy: [{ activo: 'desc' }, { creadoEn: 'desc' }],
      take: 200,
    });
    return filas.map(cuponPublico);
  }

  async crear(auth: ContextoAuth, e: CuponEntrada, cliente: InfoCliente): Promise<CuponPublico> {
    if (limitadoACartera(auth.usuario.rol)) {
      if (e.tipo !== 'porcentaje' || Number(e.valor) > DESCUENTO_MAXIMO_VENTAS) {
        throw new ErrorApp(
          403,
          'CUPON_FUERA_DE_LIMITE',
          `Ventas puede crear cupones de hasta ${DESCUENTO_MAXIMO_VENTAS} % de descuento.`,
          { valor: [`Máximo ${DESCUENTO_MAXIMO_VENTAS} %.`] },
        );
      }
      if (!e.usosMaximos) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Indica cuántas veces se puede usar el cupón.', {
          usosMaximos: ['Indica un máximo de usos.'],
        });
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (e.planIds.length > 0) {
          const n = await tx.plan.count({ where: { id: { in: e.planIds } } });
          if (n !== new Set(e.planIds).size) throw Errores.noEncontrado('Alguno de los planes');
        }
        const c = await tx.cupon.create({
          data: {
            codigo: e.codigo,
            tipo: e.tipo,
            valor: D(e.valor),
            validoDesde: e.validoDesde ?? null,
            validoHasta: e.validoHasta ?? null,
            usosMaximos: e.usosMaximos ?? null,
            soloAltas: e.soloAltas,
            creadoPorId: auth.usuario.id,
            planes: { create: [...new Set(e.planIds)].map((planId) => ({ planId })) },
          },
          include: INCLUIR,
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'cupon.creado',
            entidad: 'cupon',
            entidadId: c.id,
            despues: JSON.parse(JSON.stringify(cuponPublico(c))),
            cliente,
          },
          tx,
        );
        return cuponPublico(c);
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(409, 'DUPLICADO', 'Ya existe un cupón con ese código.', {
          codigo: ['Ya existe un cupón con ese código.'],
        });
      }
      throw err;
    }
  }

  async cambiarActivo(auth: ContextoAuth, id: string, activo: boolean, cliente: InfoCliente) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.cupon.findUnique({ where: { id } });
      if (!c) throw Errores.noEncontrado('El cupón');
      if (limitadoACartera(auth.usuario.rol) && c.creadoPorId !== auth.usuario.id) {
        throw new ErrorApp(403, 'SIN_PERMISO', 'Solo puedes cambiar los cupones que creaste.');
      }
      const r = await tx.cupon.update({ where: { id }, data: { activo }, include: INCLUIR });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: activo ? 'cupon.activado' : 'cupon.desactivado',
          entidad: 'cupon',
          entidadId: id,
          antes: { activo: c.activo },
          despues: { activo },
          cliente,
        },
        tx,
      );
      return cuponPublico(r);
    });
  }
}
