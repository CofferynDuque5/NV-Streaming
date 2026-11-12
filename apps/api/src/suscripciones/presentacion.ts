import type { CategoriaServicio, EventoSuscripcion, Plan, Suscripcion } from '@nv/db';
import { type SuscripcionDetalle, type SuscripcionPublica, urlMedio } from '@nv/shared';
import { datosDeServicio } from '../catalogo/catalogo.service.js';
import { iso, numeroFactura } from '../comun/formato.js';

export const INCLUIR_SUSCRIPCION = {
  cliente: { select: { id: true, nombre: true } },
  plan: {
    select: {
      id: true,
      nombre: true,
      duracionCantidad: true,
      duracionUnidad: true,
      renovable: true,
      tipo: true,
      servicio: {
        select: {
          nombre: true,
          slug: true,
          categoria: true,
          imagenId: true,
          datosRequeridos: true,
        },
      },
    },
  },
  facturas: { where: { estado: 'emitida' }, select: { id: true, numero: true }, take: 1 },
  metodoAutorizado: { select: { id: true, descripcion: true, estado: true } },
} as const;

export type SuscripcionBase = Suscripcion & {
  cliente: { id: string; nombre: string };
  plan: Pick<
    Plan,
    'id' | 'nombre' | 'duracionCantidad' | 'duracionUnidad' | 'renovable' | 'tipo'
  > & {
    servicio: {
      nombre: string;
      slug: string;
      categoria: CategoriaServicio | null;
      imagenId: string | null;
      datosRequeridos: unknown;
    };
  };
  facturas: { id: string; numero: number }[];
  metodoAutorizado?: { id: string; descripcion: string; estado: string } | null;
};

export function suscripcionPublica(s: SuscripcionBase): SuscripcionPublica {
  const abierta = s.facturas[0];
  return {
    id: s.id,
    cliente: s.cliente,
    plan: {
      id: s.plan.id,
      nombre: s.plan.nombre,
      servicio: s.plan.servicio.nombre,
      servicioSlug: s.plan.servicio.slug,
      categoria: s.plan.servicio.categoria,
      servicioImagen: s.plan.servicio.imagenId ? urlMedio(s.plan.servicio.imagenId) : null,
      tipo: s.plan.tipo,
      duracionCantidad: s.plan.duracionCantidad,
      duracionUnidad: s.plan.duracionUnidad,
      renovable: s.plan.renovable,
    },
    datosCliente: datosConEtiqueta(s.plan.servicio.datosRequeridos, s.datosCliente),
    estado: s.estado,
    moneda: s.moneda,
    inicioEn: iso(s.inicioEn),
    venceEn: iso(s.venceEn),
    pausadaEn: iso(s.pausadaEn),
    cancelarAlVencer: s.cancelarAlVencer,
    canceladaEn: iso(s.canceladaEn),
    creadoEn: iso(s.creadoEn)!,
    facturaAbierta: abierta ? { id: abierta.id, numero: numeroFactura(abierta.numero) } : null,
    cobroAutomatico:
      s.metodoAutorizado?.estado === 'activo'
        ? { metodoId: s.metodoAutorizado.id, descripcion: s.metodoAutorizado.descripcion }
        : null,
    gestionadaPorRevendedor: s.revendedorId !== null,
  };
}

export function suscripcionDetalle(
  s: SuscripcionBase & {
    eventos: (EventoSuscripcion & { actor: { id: string; nombre: string } | null })[];
  },
): SuscripcionDetalle {
  return {
    ...suscripcionPublica(s),
    eventos: s.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      actor: e.actor,
      motivo: e.motivo,
      creadoEn: iso(e.creadoEn)!,
    })),
  };
}

/** Valores que escribió el cliente, con el nombre de cada dato (los que ya no pide el servicio, con su clave). */
export function datosConEtiqueta(
  pedidos: unknown,
  valores: unknown,
): { etiqueta: string; valor: string }[] {
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) return [];
  const nombres = new Map(datosDeServicio(pedidos).map((d) => [d.clave, d.etiqueta]));
  return Object.entries(valores as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')
    .map(([clave, valor]) => ({ etiqueta: nombres.get(clave) ?? clave, valor }));
}
