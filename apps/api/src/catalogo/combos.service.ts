import { Inject, Injectable } from '@nestjs/common';
import type { Moneda, Prisma, PrismaClient } from '@nv/db';
import {
  type ActualizarComboEntrada,
  type ComboEntrada,
  type ComboPublico,
  MONEDAS,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO, D, type Dec, type MapaTasas, precioEn, redondear } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { INCLUIR_PLAN, type PlanCompleto, planVendible } from './catalogo.service.js';

type Tx = Prisma.TransactionClient;

export const INCLUIR_COMBO = {
  planes: { include: { plan: { include: INCLUIR_PLAN } } },
} as const;

export type ComboCompleto = Prisma.ComboGetPayload<{ include: typeof INCLUIR_COMBO }>;

/** Precio del combo en una moneda con la tasa vigente (null si falta la tasa). */
export function precioCombo(precioUsd: Dec, moneda: Moneda, tasas: MapaTasas): Dec | null {
  if (moneda === 'USD') return precioUsd;
  const tasa = tasas.get(moneda);
  return tasa ? redondear(precioUsd.mul(tasa), moneda) : null;
}

/**
 * Reparte el descuento de un combo entre sus líneas en proporción a su
 * subtotal; la última se queda con el resto del redondeo. Nunca deja una línea
 * por debajo de cero.
 */
export function repartirDescuento(subtotales: Dec[], descuento: Dec, moneda: Moneda): Dec[] {
  const suma = subtotales.reduce((a, s) => a.add(s), CERO);
  if (suma.lte(0) || descuento.lte(0)) return subtotales.map(() => CERO);
  const partes: Dec[] = [];
  let resto = descuento;
  subtotales.forEach((s, i) => {
    const parte =
      i === subtotales.length - 1 ? resto : redondear(descuento.mul(s).div(suma), moneda);
    const tope = parte.gt(s) ? s : parte;
    partes.push(tope);
    resto = resto.sub(tope);
  });
  return partes;
}

/**
 * Combos aplicables a un carrito: cada combo activo cuyos planes están todos
 * en el carrito y libres (un plan cuenta en un solo combo). Se prueban del
 * que más ahorra al que menos.
 */
export function combosDelCarrito(
  combos: ComboCompleto[],
  planes: string[],
  moneda: Moneda,
  tasas: MapaTasas,
): { combo: ComboCompleto; precio: Dec; sinCombo: Dec }[] {
  const libres = new Set(planes);
  const candidatos = combos
    .flatMap((c) => {
      const precio = precioCombo(c.precioUsd, moneda, tasas);
      if (!precio || c.planes.length < 2) return [];
      let sinCombo = CERO;
      for (const { plan } of c.planes) {
        const p = precioEn(plan, moneda, tasas);
        if (!p) return [];
        sinCombo = sinCombo.add(p.precio);
      }
      return sinCombo.gt(precio) ? [{ combo: c, precio, sinCombo }] : [];
    })
    .sort((a, b) => b.sinCombo.sub(b.precio).cmp(a.sinCombo.sub(a.precio)));
  const elegidos: typeof candidatos = [];
  for (const c of candidatos) {
    const ids = c.combo.planes.map((p) => p.planId);
    if (ids.every((id) => libres.has(id))) {
      for (const id of ids) libres.delete(id);
      elegidos.push(c);
    }
  }
  return elegidos;
}

function comboPublico(c: ComboCompleto, tasas: MapaTasas): ComboPublico {
  const precios = {} as ComboPublico['precios'];
  const sinCombo = {} as ComboPublico['sinCombo'];
  for (const m of MONEDAS) {
    precios[m] = precioCombo(c.precioUsd, m, tasas)?.toFixed(2) ?? null;
    let suma: Dec | null = CERO;
    for (const { plan } of c.planes) {
      const p = precioEn(plan, m, tasas);
      suma = p && suma ? suma.add(p.precio) : null;
    }
    sinCombo[m] = suma?.toFixed(2) ?? null;
  }
  return {
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    precioUsd: c.precioUsd.toFixed(2),
    precios,
    sinCombo,
    planes: c.planes.map(({ plan }) => ({
      id: plan.id,
      nombre: plan.nombre,
      servicio: { id: plan.servicio.id, nombre: plan.servicio.nombre, slug: plan.servicio.slug },
    })),
    activo: c.activo,
    orden: c.orden,
  };
}

/** Un plan entra en la tienda si se puede contratar y es visible. */
function enVenta(p: PlanCompleto): boolean {
  return p.activo && p.visible && p.servicio.activo && p.servicio.proveedor.activo;
}

@Injectable()
export class CombosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Combos activos que se pueden comprar ahora (todos sus planes a la venta). */
  async publicos(tasas?: MapaTasas): Promise<ComboPublico[]> {
    const [filas, mapa] = await Promise.all([
      this.activos(this.prisma),
      tasas ? Promise.resolve(tasas) : this.tasas.mapa(),
    ]);
    return filas
      .filter((c) => c.planes.length >= 2 && c.planes.every(({ plan }) => enVenta(plan)))
      .map((c) => comboPublico(c, mapa));
  }

  /** Combos activos con sus planes (para el carrito). */
  activos(db: Tx | PrismaClient): Promise<ComboCompleto[]> {
    return db.combo.findMany({
      where: { activo: true, planes: { every: { plan: planVendible } } },
      include: INCLUIR_COMBO,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async listar(): Promise<ComboPublico[]> {
    const [filas, tasas] = await Promise.all([
      this.prisma.combo.findMany({
        include: INCLUIR_COMBO,
        orderBy: [{ activo: 'desc' }, { orden: 'asc' }, { nombre: 'asc' }],
      }),
      this.tasas.mapa(),
    ]);
    return filas.map((c) => comboPublico(c, tasas));
  }

  async crear(auth: ContextoAuth, e: ComboEntrada, cliente: InfoCliente) {
    return this.guardar(auth, cliente, null, async (tx) => {
      await this.exigirPrecio(tx, e.planes, D(e.precioUsd));
      const c = await tx.combo.create({
        data: {
          nombre: e.nombre,
          descripcion: e.descripcion ?? null,
          precioUsd: D(e.precioUsd),
          activo: e.activo,
          orden: e.orden,
          planes: { create: e.planes.map((planId) => ({ planId })) },
        },
        include: INCLUIR_COMBO,
      });
      return { c, antes: undefined };
    });
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    e: ActualizarComboEntrada,
    cliente: InfoCliente,
  ) {
    return this.guardar(auth, cliente, id, async (tx) => {
      const antes = await tx.combo.findUnique({ where: { id }, include: { planes: true } });
      if (!antes) throw Errores.noEncontrado('El combo');
      const planes = e.planes ?? antes.planes.map((p) => p.planId);
      const precio = e.precioUsd !== undefined ? D(e.precioUsd) : antes.precioUsd;
      if (e.planes !== undefined || e.precioUsd !== undefined) {
        await this.exigirPrecio(tx, planes, precio);
      }
      if (e.planes) await tx.comboPlan.deleteMany({ where: { comboId: id } });
      const c = await tx.combo.update({
        where: { id },
        data: {
          ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
          ...(e.descripcion !== undefined ? { descripcion: e.descripcion ?? null } : {}),
          ...(e.precioUsd !== undefined ? { precioUsd: precio } : {}),
          ...(e.activo !== undefined ? { activo: e.activo } : {}),
          ...(e.orden !== undefined ? { orden: e.orden } : {}),
          ...(e.planes ? { planes: { create: e.planes.map((planId) => ({ planId })) } } : {}),
        },
        include: INCLUIR_COMBO,
      });
      return {
        c,
        antes: { ...antes, planes: antes.planes.map((p) => p.planId) },
      };
    });
  }

  async eliminar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.combo.findUnique({ where: { id }, include: { planes: true } });
      if (!antes) throw Errores.noEncontrado('El combo');
      await tx.combo.delete({ where: { id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'combo.eliminado',
          entidad: 'combo',
          entidadId: id,
          antes: JSON.parse(
            JSON.stringify({ ...antes, planes: antes.planes.map((p) => p.planId) }),
          ),
          cliente,
        },
        tx,
      );
    });
  }

  /** Los planes existen, son de servicios distintos y el combo cuesta menos que por separado. */
  private async exigirPrecio(tx: Tx, planIds: string[], precio: Dec): Promise<void> {
    const planes = await tx.plan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, precioUsd: true, servicioId: true },
    });
    if (planes.length !== planIds.length) {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'Uno de los planes ya no existe.', {
        planes: ['Elige los planes otra vez.'],
      });
    }
    if (new Set(planes.map((p) => p.servicioId)).size !== planes.length) {
      throw new ErrorApp(
        409,
        'COMBO_NO_VALIDO',
        'Cada plan tiene que ser de un servicio distinto.',
        {
          planes: ['Cada plan tiene que ser de un servicio distinto.'],
        },
      );
    }
    const suma = planes.reduce((a, p) => a.add(p.precioUsd), CERO);
    if (precio.gte(suma)) {
      const m = `Tiene que costar menos que sus planes por separado (${suma.toFixed(2)} USD).`;
      throw new ErrorApp(409, 'COMBO_NO_VALIDO', m, { precioUsd: [m] });
    }
  }

  private async guardar(
    auth: ContextoAuth,
    cliente: InfoCliente,
    id: string | null,
    fn: (tx: Tx) => Promise<{ c: ComboCompleto; antes: unknown }>,
  ): Promise<ComboPublico> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { c, antes } = await fn(tx);
        const tasas = await this.tasas.mapa(tx);
        const resultado = comboPublico(c, tasas);
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: id ? 'combo.actualizado' : 'combo.creado',
            entidad: 'combo',
            entidadId: c.id,
            ...(antes !== undefined ? { antes: JSON.parse(JSON.stringify(antes)) } : {}),
            despues: JSON.parse(
              JSON.stringify({
                nombre: c.nombre,
                precioUsd: resultado.precioUsd,
                planes: resultado.planes.map((p) => p.id),
                activo: c.activo,
                orden: c.orden,
              }),
            ),
            cliente,
          },
          tx,
        );
        return resultado;
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(409, 'DUPLICADO', 'Ya existe un combo con ese nombre.', {
          nombre: ['Ya existe un combo con ese nombre.'],
        });
      }
      throw err;
    }
  }
}
