import type {
  CobroAutomatico,
  EventoPasarela,
  IntentoPago,
  MetodoPagoAutorizado,
  Reembolso,
} from '@nv/db';
import type {
  CobroAutomaticoResumen,
  EventoPasarelaResumen,
  IntentoPagoPublico,
  MetodoAutorizadoPublico,
  Pasarela,
  ReembolsoResumen,
} from '@nv/shared';
import { dec2, iso, numeroFactura } from '../comun/formato.js';

const pasarela = (p: string) => p as Pasarela;

export const ABIERTOS = ['creado', 'pendiente'] as const;

export function intentoPublico(i: IntentoPago): IntentoPagoPublico {
  const abierto = (ABIERTOS as readonly string[]).includes(i.estado);
  return {
    id: i.id,
    referencia: i.referencia,
    facturaId: i.facturaId,
    pasarela: pasarela(i.pasarela),
    moneda: i.moneda,
    monto: dec2(i.monto),
    estado: i.estado,
    urlPago: abierto ? i.urlPago : null,
    guardarMetodo: i.guardarMetodo,
    error: i.error,
    pagoId: i.pagoId,
    expiraEn: iso(i.expiraEn)!,
    creadoEn: iso(i.creadoEn)!,
  };
}

export const INCLUIR_METODO = {
  suscripciones: {
    where: { estado: { not: 'cancelada' } },
    select: {
      id: true,
      venceEn: true,
      plan: { select: { nombre: true, servicio: { select: { nombre: true } } } },
    },
    orderBy: { creadoEn: 'asc' },
  },
} as const;

type MetodoBase = MetodoPagoAutorizado & {
  suscripciones: {
    id: string;
    venceEn: Date | null;
    plan: { nombre: string; servicio: { nombre: string } };
  }[];
};

export function metodoAutorizadoPublico(m: MetodoBase): MetodoAutorizadoPublico {
  return {
    id: m.id,
    pasarela: pasarela(m.pasarela),
    descripcion: m.descripcion,
    moneda: m.moneda,
    estado: m.estado,
    autorizadoEn: iso(m.autorizadoEn)!,
    versionTexto: m.versionTexto,
    textoAceptado: m.textoAceptado,
    revocadoEn: iso(m.revocadoEn),
    motivoEstado: m.motivoEstado,
    suscripciones: m.suscripciones.map((s) => ({
      id: s.id,
      plan: `${s.plan.servicio.nombre} · ${s.plan.nombre}`,
      venceEn: iso(s.venceEn),
    })),
  };
}

export const INCLUIR_COBRO = {
  factura: { select: { id: true, numero: true, total: true, moneda: true } },
  suscripcion: { select: { cliente: { select: { id: true, nombre: true } } } },
  metodo: { select: { id: true, descripcion: true, pasarela: true } },
} as const;

type CobroBase = CobroAutomatico & {
  factura: {
    id: string;
    numero: number;
    total: { toFixed(n: number): string };
    moneda: IntentoPago['moneda'];
  };
  suscripcion: { cliente: { id: string; nombre: string } };
  metodo: { id: string; descripcion: string; pasarela: string };
};

export function cobroResumen(c: CobroBase): CobroAutomaticoResumen {
  return {
    id: c.id,
    factura: {
      id: c.factura.id,
      numero: numeroFactura(c.factura.numero),
      total: c.factura.total.toFixed(2),
      moneda: c.factura.moneda,
    },
    cliente: c.suscripcion.cliente,
    suscripcionId: c.suscripcionId,
    metodo: {
      id: c.metodo.id,
      descripcion: c.metodo.descripcion,
      pasarela: pasarela(c.metodo.pasarela),
    },
    intento: c.intento,
    estado: c.estado,
    programadoPara: iso(c.programadoPara)!,
    ejecutadoEn: iso(c.ejecutadoEn),
    error: c.error,
    pagoId: c.pagoId,
  };
}

export function eventoResumen(e: EventoPasarela): EventoPasarelaResumen {
  return {
    id: e.id,
    pasarela: pasarela(e.pasarela),
    idEvento: e.idEvento,
    tipo: e.tipo,
    idRecurso: e.idRecurso,
    firmaValida: e.firmaValida,
    estado: e.estado,
    error: e.error,
    recibidoEn: iso(e.recibidoEn)!,
    procesadoEn: iso(e.procesadoEn),
  };
}

export const INCLUIR_REEMBOLSO = {
  solicitadoPor: { select: { id: true, nombre: true } },
} as const;

export function reembolsoResumen(
  r: Reembolso & { solicitadoPor: { id: string; nombre: string } },
): ReembolsoResumen {
  return {
    id: r.id,
    pagoId: r.pagoId,
    monto: dec2(r.monto),
    moneda: r.moneda,
    motivo: r.motivo,
    estado: r.estado,
    error: r.error,
    solicitadoPor: r.solicitadoPor,
    creadoEn: iso(r.creadoEn)!,
    completadoEn: iso(r.completadoEn),
  };
}
