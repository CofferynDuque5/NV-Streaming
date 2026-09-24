import type {
  EstadoFactura,
  EstadoPago,
  EstadoSuscripcion,
  EstadoTicket,
  PrioridadTicket,
} from '@nv/shared';
import {
  ESTADO_FACTURA,
  ESTADO_PAGO,
  ESTADO_SUSCRIPCION,
  ESTADO_TICKET,
  PRIORIDAD_TICKET,
} from '@/lib/estados';
import { Insignia } from './insignia';

export const EstadoSuscripcionInsignia = ({ estado }: { estado: EstadoSuscripcion }) => (
  <Insignia tono={ESTADO_SUSCRIPCION[estado].tono}>{ESTADO_SUSCRIPCION[estado].texto}</Insignia>
);

export const EstadoFacturaInsignia = ({
  estado,
  vencida,
}: {
  estado: EstadoFactura;
  vencida?: boolean;
}) => {
  const e = ESTADO_FACTURA[vencida && estado === 'emitida' ? 'vencida' : estado];
  return <Insignia tono={e.tono}>{e.texto}</Insignia>;
};

export const EstadoPagoInsignia = ({ estado }: { estado: EstadoPago }) => (
  <Insignia tono={ESTADO_PAGO[estado].tono}>{ESTADO_PAGO[estado].texto}</Insignia>
);

export const EstadoTicketInsignia = ({ estado }: { estado: EstadoTicket }) => (
  <Insignia tono={ESTADO_TICKET[estado].tono}>{ESTADO_TICKET[estado].texto}</Insignia>
);

export const PrioridadInsignia = ({ prioridad }: { prioridad: PrioridadTicket }) => (
  <Insignia tono={PRIORIDAD_TICKET[prioridad].tono}>{PRIORIDAD_TICKET[prioridad].texto}</Insignia>
);
