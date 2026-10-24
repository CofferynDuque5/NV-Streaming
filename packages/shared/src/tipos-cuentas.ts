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
  costoUsd: string;
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
