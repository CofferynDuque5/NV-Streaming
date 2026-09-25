import type { EventoSuscripcion, Plan, Suscripcion } from '@nv/db';
import type { SuscripcionDetalle, SuscripcionPublica } from '@nv/shared';
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
      servicio: { select: { nombre: true } },
    },
  },
  facturas: { where: { estado: 'emitida' }, select: { id: true, numero: true }, take: 1 },
  metodoAutorizado: { select: { id: true, descripcion: true, estado: true } },
} as const;

export type SuscripcionBase = Suscripcion & {
  cliente: { id: string; nombre: string };
  plan: Pick<Plan, 'id' | 'nombre' | 'duracionCantidad' | 'duracionUnidad' | 'renovable'> & {
    servicio: { nombre: string };
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
      duracionCantidad: s.plan.duracionCantidad,
      duracionUnidad: s.plan.duracionUnidad,
      renovable: s.plan.renovable,
    },
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
