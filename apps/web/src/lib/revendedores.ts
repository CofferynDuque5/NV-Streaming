import type {
  EstadoCompra,
  EstadoRecarga,
  EstadoRevendedor,
  TipoCompra,
  TipoMovimientoSaldo,
} from '@nv/shared';
import { formatearMonto } from '@nv/shared';
import type { TonoInsignia } from './estados';

type Etiquetas<K extends string> = Record<K, { texto: string; tono: TonoInsignia }>;

export const ESTADO_REVENDEDOR: Etiquetas<EstadoRevendedor> = {
  solicitud: { texto: 'En revisión', tono: 'aviso' },
  aprobado: { texto: 'Aprobado', tono: 'exito' },
  rechazado: { texto: 'Rechazado', tono: 'peligro' },
  suspendido: { texto: 'Suspendido', tono: 'peligro' },
};

export const ESTADO_RECARGA: Etiquetas<EstadoRecarga> = {
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  confirmada: { texto: 'Confirmada', tono: 'exito' },
  rechazada: { texto: 'Rechazada', tono: 'peligro' },
};

export const ESTADO_COMPRA: Etiquetas<EstadoCompra> = {
  completada: { texto: 'Completada', tono: 'exito' },
  reembolsada: { texto: 'Reembolsada', tono: 'neutro' },
};

export const TIPO_MOVIMIENTO: Record<TipoMovimientoSaldo, string> = {
  recarga: 'Recarga',
  compra: 'Compra',
  reembolso: 'Reembolso',
  ajuste: 'Ajuste',
};

export const TIPO_COMPRA: Record<TipoCompra, string> = {
  alta: 'Activación',
  renovacion: 'Renovación',
};

/** "US$ 4,00" y, si hay tasa, "≈ Bs. 600,00". Solo para mostrar. */
export function usdYVes(usd: string, tasaVes: string | null): { usd: string; ves: string | null } {
  return {
    usd: formatearMonto(usd, 'USD'),
    ves: tasaVes ? formatearMonto((Number(usd) * Number(tasaVes)).toFixed(2), 'VES') : null,
  };
}

/** Importe con signo para el libro mayor: "+US$ 10,00" o "−US$ 4,00". */
export function montoConSigno(valor: string): string {
  const n = Number(valor);
  return `${n < 0 ? '−' : '+'}${formatearMonto(Math.abs(n).toFixed(2), 'USD')}`;
}
