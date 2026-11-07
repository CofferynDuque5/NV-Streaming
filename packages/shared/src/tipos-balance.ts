/**
 * Balance del período en USD. Ventas: facturas con pago confirmado (como en
 * Métricas) y compras de revendedores; las recargas de saldo no cuentan hasta
 * que se gastan.
 */
export interface BalancePeriodo {
  desde: string;
  hasta: string;
  ventasClientesUsd: string;
  pagosClientes: number;
  ventasRevendedoresUsd: string;
  comprasRevendedores: number;
  reembolsosUsd: string;
  /** Ventas − reembolsos. */
  netoUsd: string;
  /** Hoy: lo que los clientes deben (facturas emitidas sin pagar). */
  porCobrar: { facturas: number; vencidas: number; totalUsd: string };
}
