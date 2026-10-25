import type { EstadoCuentaServicio, EstadoPerfil, ModoCuenta } from './esquemas/cuentas.js';
import type { EstadoSuscripcion } from './esquemas/suscripciones.js';
import type { Pagina } from './tipos.js';
import type { Referencia } from './tipos-negocio.js';

/** Cuenta de un servicio sin secretos: el correo va como pista («ma•••@gmail.com»). */
export interface CuentaServicioResumen {
  id: string;
  servicio: Referencia;
  pista: string;
  modo: ModoCuenta;
  estado: EstadoCuentaServicio;
  plan: string | null;
  pais: string | null;
  /** Lo que cobra el proveedor en cada ciclo. */
  costoUsd: string;
  cicloMeses: number;
  facturaEn: string | null;
  metodoPago: string | null;
  proveedor: string | null;
  perfiles: { total: number; libres: number; asignados: number; bloqueados: number };
  creadoEn: string;
}

export interface AsignacionPerfil {
  suscripcionId: string;
  estado: EstadoSuscripcion;
  venceEn: string | null;
  cliente: Referencia;
  plan: Referencia;
  /** La suscripción ya terminó: conviene liberar el perfil. */
  terminada: boolean;
}

export interface PerfilCuentaPublico {
  id: string;
  numero: number;
  nombre: string;
  estado: EstadoPerfil;
  tienePin: boolean;
  asignacion: AsignacionPerfil | null;
}

export interface CuentaServicioDetalle extends CuentaServicioResumen {
  notas: string | null;
  creadoPor: Referencia | null;
  listaPerfiles: PerfilCuentaPublico[];
}

/** Solo con `cuentas.revelar`, y queda en la auditoría. */
export interface CredencialesCuenta {
  usuario: string;
  clave: string;
  perfiles: { numero: number; nombre: string; pin: string | null }[];
}

/** Suscripción del mismo servicio que puede recibir un perfil. */
export interface SuscripcionAsignable {
  id: string;
  estado: EstadoSuscripcion;
  venceEn: string | null;
  cliente: Referencia;
  plan: Referencia;
}

export type PaginaCuentas = Pagina<CuentaServicioResumen>;

/** Pago hecho al proveedor de una cuenta. */
export interface PagoCuentaPublico {
  id: string;
  montoUsd: string;
  pagadoEl: string;
  facturaCubierta: string | null;
  siguienteCobro: string;
  metodoPago: string | null;
  nota: string | null;
  registradoPor: Referencia;
  creadoEn: string;
  anulacion: { en: string; por: Referencia | null; motivo: string } | null;
  /** Último pago vigente y la cuenta sigue con su fecha: anularlo devuelve el cobro anterior. */
  revierteCobro: boolean;
}

/** Cuenta con un cobro del proveedor atrasado o cercano. */
export interface CuentaPorPagar {
  cuenta: { id: string; pista: string; servicio: Referencia; proveedor: string | null };
  costoUsd: string;
  facturaEn: string;
  /** Negativo: días de atraso. */
  dias: number;
  metodoPago: string | null;
}

export interface PorPagar {
  atrasadas: CuentaPorPagar[];
  proximas: CuentaPorPagar[];
  totalAtrasadoUsd: string;
  totalProximoUsd: string;
}

/**
 * Balance del período en USD. Ventas: facturas con pago confirmado (como en
 * Métricas) y compras de revendedores; las recargas de saldo no cuentan hasta
 * que se gastan. Costos: pagos al proveedor de las cuentas.
 */
export interface BalancePeriodo {
  desde: string;
  hasta: string;
  ventasClientesUsd: string;
  pagosClientes: number;
  ventasRevendedoresUsd: string;
  comprasRevendedores: number;
  reembolsosUsd: string;
  costosProveedorUsd: string;
  pagosProveedor: number;
  netoUsd: string;
  /** Costos por servicio, de mayor a menor. */
  costosPorServicio: { servicio: Referencia; montoUsd: string; pagos: number }[];
  /** Hoy: lo que los clientes deben (facturas emitidas sin pagar). */
  porCobrar: { facturas: number; vencidas: number; totalUsd: string };
  porPagar: PorPagar;
  /** Lo que cuestan al mes las cuentas activas (costo ÷ ciclo). */
  costoMensualCuentasUsd: string;
  /** Ingreso mensual recurrente de las suscripciones activas. */
  ingresoMensualRecurrenteUsd: string;
}
