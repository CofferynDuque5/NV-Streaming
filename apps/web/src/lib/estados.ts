import type {
  CategoriaTicket,
  EstadoFactura,
  EstadoPago,
  EstadoSuscripcion,
  EstadoTicket,
  PrioridadTicket,
} from '@nv/shared';

export type TonoInsignia = 'neutro' | 'marca' | 'acento' | 'exito' | 'aviso' | 'peligro';
type Etiquetas<K extends string> = Record<K, { texto: string; tono: TonoInsignia }>;

export const ESTADO_SUSCRIPCION: Etiquetas<EstadoSuscripcion> = {
  pendiente_pago: { texto: 'Pendiente de pago', tono: 'aviso' },
  activa: { texto: 'Activa', tono: 'exito' },
  en_gracia: { texto: 'En gracia', tono: 'aviso' },
  pausada: { texto: 'Pausada', tono: 'neutro' },
  suspendida: { texto: 'Suspendida', tono: 'peligro' },
  vencida: { texto: 'Vencida', tono: 'peligro' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
};

export const ESTADO_FACTURA: Etiquetas<EstadoFactura | 'vencida'> = {
  emitida: { texto: 'Pendiente', tono: 'aviso' },
  vencida: { texto: 'Vencida', tono: 'peligro' },
  pagada: { texto: 'Pagada', tono: 'exito' },
  anulada: { texto: 'Anulada', tono: 'neutro' },
};

export const ESTADO_PAGO: Etiquetas<EstadoPago> = {
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  confirmado: { texto: 'Confirmado', tono: 'exito' },
  rechazado: { texto: 'Rechazado', tono: 'peligro' },
  reembolsado: { texto: 'Devuelto', tono: 'neutro' },
};

export const ESTADO_TICKET: Etiquetas<EstadoTicket> = {
  abierto: { texto: 'Abierto', tono: 'marca' },
  en_progreso: { texto: 'En progreso', tono: 'acento' },
  esperando_cliente: { texto: 'Esperando respuesta', tono: 'aviso' },
  resuelto: { texto: 'Resuelto', tono: 'exito' },
  cerrado: { texto: 'Cerrado', tono: 'neutro' },
};

export const PRIORIDAD_TICKET: Etiquetas<PrioridadTicket> = {
  baja: { texto: 'Baja', tono: 'neutro' },
  normal: { texto: 'Normal', tono: 'marca' },
  alta: { texto: 'Alta', tono: 'aviso' },
  urgente: { texto: 'Urgente', tono: 'peligro' },
};

export const CATEGORIA_TICKET: Record<CategoriaTicket, string> = {
  pagos: 'Pagos y facturas',
  acceso: 'Acceso al servicio',
  suscripcion: 'Mi suscripción',
  cuenta: 'Mi cuenta',
  otro: 'Otro tema',
};

export const EVENTO_SUSCRIPCION: Record<string, string> = {
  alta: 'Alta',
  activacion: 'Activación',
  renovacion: 'Renovación',
  pausa: 'Pausa',
  reanudacion: 'Reanudación',
  cancelacion: 'Cancelación',
  cancelacion_programada: 'Cancelación programada',
  cancelacion_revertida: 'Cancelación revertida',
  vencimiento: 'Vencimiento',
  suspension: 'Suspensión',
  recuperacion: 'Recuperación',
};
