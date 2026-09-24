import type {
  CompraRevendedor,
  MetodoCobro,
  MovimientoSaldo,
  NivelRevendedor,
  RecargaSaldo,
  Revendedor,
  Usuario,
} from '@nv/db';
import type {
  CompraPublica,
  MiSolicitudRevendedor,
  MovimientoSaldoPublico,
  NivelPublico,
  RecargaPublica,
  RevendedorResumen,
} from '@nv/shared';
import { dec, dec2, iso } from '../comun/formato.js';
import { aUsd } from '../dinero/dinero.js';

type Ref = { id: string; nombre: string };

export const INCLUIR_REVENDEDOR = {
  usuario: { select: { id: true, nombre: true, correo: true } },
  nivel: { select: { id: true, nombre: true } },
} as const;

type RevendedorBase = Revendedor & {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'correo'>;
  nivel: Ref | null;
};

export function revendedorResumen(r: RevendedorBase): RevendedorResumen {
  return {
    id: r.id,
    usuario: r.usuario,
    estado: r.estado,
    nombreComercial: r.nombreComercial,
    pais: r.pais,
    nivel: r.nivel,
    saldoUsd: dec2(r.saldoUsd),
    limiteDiarioCompras: r.limiteDiarioCompras,
    creadoEn: iso(r.creadoEn)!,
    revisadoEn: iso(r.revisadoEn),
  };
}

export function miSolicitud(r: Revendedor): MiSolicitudRevendedor {
  return {
    id: r.id,
    estado: r.estado,
    nombreComercial: r.nombreComercial,
    documento: r.documento,
    telefono: r.telefono,
    pais: r.pais,
    mensaje: r.mensaje,
    motivoEstado: r.motivoEstado,
    creadoEn: iso(r.creadoEn)!,
    revisadoEn: iso(r.revisadoEn),
  };
}

export function nivelPublico(
  n: NivelRevendedor & { _count?: { revendedores: number } },
): NivelPublico {
  return {
    id: n.id,
    nombre: n.nombre,
    descripcion: n.descripcion,
    orden: n.orden,
    activo: n.activo,
    revendedores: n._count?.revendedores ?? 0,
  };
}

export const INCLUIR_RECARGA = {
  revendedor: { select: { id: true, nombreComercial: true } },
  metodoCobro: { select: { id: true, nombre: true } },
  revisadoPor: { select: { id: true, nombre: true } },
} as const;

type RecargaBase = RecargaSaldo & {
  revendedor: { id: string; nombreComercial: string };
  metodoCobro: Pick<MetodoCobro, 'id' | 'nombre'>;
  revisadoPor: Ref | null;
};

/** `equipo` añade las notas de conciliación y quién la revisó. */
export function recargaPublica(r: RecargaBase, equipo: boolean): RecargaPublica {
  return {
    id: r.id,
    referencia: r.referencia,
    revendedor: { id: r.revendedor.id, nombre: r.revendedor.nombreComercial },
    metodo: { id: r.metodoCobro.id, nombre: r.metodoCobro.nombre },
    moneda: r.moneda,
    montoDeclarado: dec2(r.montoDeclarado),
    montoRecibido: dec(r.montoRecibido),
    tasa: dec2(r.tasa, 6),
    montoUsd: dec(r.montoUsd),
    montoUsdEstimado: dec2(aUsd(r.montoDeclarado, r.tasa)),
    referenciaExterna: r.referenciaExterna,
    fechaPago: iso(r.fechaPago)!,
    estado: r.estado,
    motivoRechazo: r.motivoRechazo,
    tieneComprobante: r.comprobanteId !== null,
    creadoEn: iso(r.creadoEn)!,
    revisadoEn: iso(r.revisadoEn),
    ...(equipo ? { notas: r.notas, revisadoPor: r.revisadoPor } : {}),
  };
}

export const INCLUIR_MOVIMIENTO = {
  recarga: { select: { id: true, referencia: true } },
  compra: {
    select: {
      id: true,
      plan: { select: { nombre: true, servicio: { select: { nombre: true } } } },
      cliente: { select: { nombre: true } },
    },
  },
  autor: { select: { id: true, nombre: true } },
} as const;

type MovimientoBase = MovimientoSaldo & {
  recarga: { id: string; referencia: string } | null;
  compra: {
    id: string;
    plan: { nombre: string; servicio: { nombre: string } };
    cliente: { nombre: string };
  } | null;
  autor: Ref | null;
};

/** `equipo` muestra quién hizo cada movimiento (el revendedor no ve nombres del equipo). */
export function movimientoPublico(m: MovimientoBase, equipo: boolean): MovimientoSaldoPublico {
  return {
    id: m.id,
    tipo: m.tipo,
    montoUsd: dec2(m.montoUsd),
    saldoResultanteUsd: dec2(m.saldoResultanteUsd),
    motivo: m.motivo,
    recarga: m.recarga,
    compra: m.compra
      ? {
          id: m.compra.id,
          plan: `${m.compra.plan.servicio.nombre} · ${m.compra.plan.nombre}`,
          cliente: m.compra.cliente.nombre,
        }
      : null,
    autor: equipo ? m.autor : null,
    creadoEn: iso(m.creadoEn)!,
  };
}

export const INCLUIR_COMPRA = {
  revendedor: { select: { id: true, nombreComercial: true } },
  plan: { select: { id: true, nombre: true, servicio: { select: { nombre: true } } } },
  cliente: { select: { id: true, nombre: true } },
  suscripcion: { select: { id: true, estado: true, venceEn: true } },
} as const;

type CompraBase = CompraRevendedor & {
  revendedor: { id: string; nombreComercial: string };
  plan: { id: string; nombre: string; servicio: { nombre: string } };
  cliente: Ref;
  suscripcion: { id: string; estado: CompraPublica['suscripcion']['estado']; venceEn: Date | null };
};

export function compraPublica(c: CompraBase): CompraPublica {
  return {
    id: c.id,
    tipo: c.tipo,
    estado: c.estado,
    revendedor: { id: c.revendedor.id, nombre: c.revendedor.nombreComercial },
    plan: { id: c.plan.id, nombre: c.plan.nombre, servicio: c.plan.servicio.nombre },
    cliente: c.cliente,
    suscripcion: {
      id: c.suscripcion.id,
      estado: c.suscripcion.estado,
      venceEn: iso(c.suscripcion.venceEn),
    },
    precioUsd: dec2(c.precioUsd),
    motivoReembolso: c.motivoReembolso,
    reembolsadaEn: iso(c.reembolsadaEn),
    creadoEn: iso(c.creadoEn)!,
  };
}
