import type { Prisma } from '@nv/db';
import type {
  AccesoServicio,
  AdaptadorEntrega,
  CodigoResumen,
  EntregaDetalle,
  EntregaResumen,
  EventoEntrega,
} from '@nv/shared';
import { iso, numeroFactura } from '../comun/formato.js';

/** Largo del inicio de la huella que se muestra (suficiente para distinguir, inútil para adivinar). */
export const LARGO_HUELLA_VISIBLE = 10;
export const huellaVisible = (h: string) => h.slice(0, LARGO_HUELLA_VISIBLE);

export const INCLUIR_ENTREGA = {
  proveedor: { select: { id: true, nombre: true } },
  plan: { select: { id: true, nombre: true, servicio: { select: { nombre: true } } } },
  cliente: { select: { id: true, nombre: true } },
  revendedor: { select: { id: true, nombreComercial: true } },
  factura: { select: { id: true, numero: true } },
} as const satisfies Prisma.EntregaInclude;

export type EntregaConRelaciones = Prisma.EntregaGetPayload<{ include: typeof INCLUIR_ENTREGA }>;

/** Qué hay guardado (cifrado) sin descifrarlo: el JSON cifrado no se lee aquí. */
export interface ContenidoGuardado {
  tieneCodigo: boolean;
  tieneEnlace: boolean;
}

/**
 * La presencia de código o enlace se guarda en claro en la auditoría de la
 * entrega; aquí se deduce del prefijo que añade `guardarDatos` al cifrar.
 */
export function contenidoGuardado(datosCifrados: string | null): ContenidoGuardado {
  if (!datosCifrados) return { tieneCodigo: false, tieneEnlace: false };
  const [marca] = datosCifrados.split('|', 1);
  return {
    tieneCodigo: Boolean(marca?.includes('c')),
    tieneEnlace: Boolean(marca?.includes('e')),
  };
}

export function entregaResumen(e: EntregaConRelaciones): EntregaResumen {
  return {
    id: e.id,
    estado: e.estado,
    motivo: e.motivo,
    adaptador: e.adaptador as AdaptadorEntrega,
    proveedor: e.proveedor,
    plan: { id: e.plan.id, nombre: e.plan.nombre, servicio: e.plan.servicio.nombre },
    cliente: e.cliente,
    revendedor: e.revendedor,
    suscripcionId: e.suscripcionId,
    compraRevendedorId: e.compraRevendedorId,
    factura: e.factura ? { id: e.factura.id, numero: numeroFactura(e.factura.numero) } : null,
    intentos: e.intentos,
    proximoIntentoEn: iso(e.proximoIntentoEn),
    error: e.error,
    referenciaExterna: e.referenciaExterna,
    ...contenidoGuardado(e.datosCifrados),
    entregadaEn: iso(e.entregadaEn),
    vistaEn: iso(e.vistaEn),
    revocadaEn: iso(e.revocadaEn),
    anuladaEn: iso(e.anuladaEn),
    creadoEn: iso(e.creadoEn)!,
    actualizadoEn: iso(e.actualizadoEn)!,
  };
}

export function entregaDetalle(
  e: EntregaConRelaciones & {
    completadaPor: { id: string; nombre: string } | null;
    codigo: { id: string; huella: string; lote: { id: string; nombre: string } } | null;
  },
  historial: EventoEntrega[],
): EntregaDetalle {
  return {
    ...entregaResumen(e),
    instrucciones: e.instrucciones,
    motivoAnulacion: e.motivoAnulacion,
    completadaPor: e.completadaPor,
    periodoInicio: iso(e.periodoInicio),
    periodoFin: iso(e.periodoFin),
    codigoInventario: e.codigo
      ? { id: e.codigo.id, huella: huellaVisible(e.codigo.huella), lote: e.codigo.lote }
      : null,
    historial,
  };
}

export const INCLUIR_ACCESO = {
  plan: { select: { nombre: true, servicio: { select: { nombre: true } } } },
  cliente: { select: { id: true, nombre: true } },
  suscripcion: { select: { id: true, estado: true, venceEn: true } },
  compraRevendedor: {
    select: { suscripcion: { select: { id: true, estado: true, venceEn: true } } },
  },
} as const satisfies Prisma.EntregaInclude;

type EntregaAcceso = Prisma.EntregaGetPayload<{ include: typeof INCLUIR_ACCESO }>;

/** Vista del cliente o del revendedor: sin errores internos, intentos ni referencias. */
export function accesoServicio(e: EntregaAcceso, conCliente: boolean): AccesoServicio {
  const s = e.suscripcion ?? e.compraRevendedor?.suscripcion ?? null;
  const entregada = e.estado === 'entregada';
  return {
    id: e.id,
    estado: e.estado,
    motivo: e.motivo,
    servicio: e.plan.servicio.nombre,
    plan: e.plan.nombre,
    cliente: conCliente ? e.cliente : null,
    suscripcion: s ? { id: s.id, estado: s.estado, venceEn: iso(s.venceEn) } : null,
    instrucciones: entregada ? e.instrucciones : null,
    ...(entregada
      ? contenidoGuardado(e.datosCifrados)
      : { tieneCodigo: false, tieneEnlace: false }),
    entregadaEn: iso(e.entregadaEn),
    vistaEn: iso(e.vistaEn),
    creadoEn: iso(e.creadoEn)!,
  };
}

export function codigoResumen(
  c: Prisma.CodigoInventarioGetPayload<{
    include: { lote: { select: { id: true; nombre: true } } };
  }>,
): CodigoResumen {
  return {
    id: c.id,
    huella: huellaVisible(c.huella),
    estado: c.estado,
    lote: c.lote,
    venceEn: iso(c.venceEn),
    entregadoEn: iso(c.entregadoEn),
    entregaId: c.entregaId,
    anuladoEn: iso(c.anuladoEn),
    motivoAnulacion: c.motivoAnulacion,
    creadoEn: iso(c.creadoEn)!,
  };
}
