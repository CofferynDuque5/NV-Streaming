/** Tipos de respuesta del programa de revendedores (fase 2). */
import type { UnidadDuracion } from './esquemas/catalogo.js';
import type {
  EstadoCompra,
  EstadoRecarga,
  EstadoRevendedor,
  TipoCompra,
  TipoMovimientoSaldo,
} from './esquemas/revendedores.js';
import type { Moneda } from './monedas.js';
import type { Decimal, Referencia, SuscripcionPublica } from './tipos-negocio.js';

export interface NivelPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  /** Revendedores que tienen asignado el nivel. */
  revendedores: number;
}

/** Lo que ve quien pidió ser revendedor sobre su propia solicitud. */
export interface MiSolicitudRevendedor {
  id: string;
  estado: EstadoRevendedor;
  nombreComercial: string;
  documento: string | null;
  telefono: string | null;
  pais: string | null;
  mensaje: string | null;
  /** Motivo del rechazo o de la suspensión. */
  motivoEstado: string | null;
  creadoEn: string;
  revisadoEn: string | null;
}

export interface RevendedorResumen {
  id: string;
  usuario: { id: string; nombre: string; correo: string };
  estado: EstadoRevendedor;
  nombreComercial: string;
  pais: string | null;
  nivel: Referencia | null;
  saldoUsd: Decimal;
  limiteDiarioCompras: number | null;
  creadoEn: string;
  revisadoEn: string | null;
}

export interface RevendedorDetalle extends RevendedorResumen {
  documento: string | null;
  telefono: string | null;
  mensaje: string | null;
  motivoEstado: string | null;
  revisadoPor: Referencia | null;
  clientes: number;
  suscripcionesActivas: number;
  compras: number;
  recargasEnRevision: number;
}

export interface RecargaPublica {
  id: string;
  referencia: string;
  revendedor: Referencia;
  metodo: Referencia;
  moneda: Moneda;
  montoDeclarado: Decimal;
  montoRecibido: Decimal | null;
  /** Unidades de `moneda` por 1 USD, fijada al reportar. */
  tasa: Decimal;
  /** Saldo acreditado al confirmar. */
  montoUsd: Decimal | null;
  /** Lo que se acreditaría si llega lo declarado. */
  montoUsdEstimado: Decimal;
  referenciaExterna: string | null;
  fechaPago: string;
  estado: EstadoRecarga;
  motivoRechazo: string | null;
  tieneComprobante: boolean;
  creadoEn: string;
  revisadoEn: string | null;
  /** Solo para el equipo. */
  notas?: string | null;
  revisadoPor?: Referencia | null;
}

export interface MovimientoSaldoPublico {
  id: string;
  tipo: TipoMovimientoSaldo;
  /** Positivo suma, negativo resta. */
  montoUsd: Decimal;
  saldoResultanteUsd: Decimal;
  motivo: string | null;
  recarga: { id: string; referencia: string } | null;
  compra: { id: string; plan: string; cliente: string } | null;
  autor: Referencia | null;
  creadoEn: string;
}

export interface CompraPublica {
  id: string;
  tipo: TipoCompra;
  estado: EstadoCompra;
  revendedor: Referencia;
  plan: { id: string; nombre: string; servicio: string };
  cliente: Referencia;
  suscripcion: { id: string; estado: SuscripcionPublica['estado']; venceEn: string | null };
  precioUsd: Decimal;
  motivoReembolso: string | null;
  reembolsadaEn: string | null;
  creadoEn: string;
}

export interface ResultadoCompra {
  compra: CompraPublica;
  saldoUsd: Decimal;
  /** La clave ya se había usado: se devuelve la compra original sin cobrar otra vez. */
  repetida: boolean;
}

export interface PlanMayorista {
  id: string;
  nombre: string;
  descripcion: string | null;
  servicio: { id: string; nombre: string };
  duracionCantidad: number;
  duracionUnidad: UnidadDuracion;
  beneficios: string[];
  renovable: boolean;
  /** Precio de venta al público de NV (referencia para el revendedor). */
  precioPublicoUsd: Decimal;
  /** Lo que paga el revendedor con su saldo. */
  precioUsd: Decimal;
  /** Equivalente en bolívares con la tasa vigente; null si no hay tasa. */
  precioVes: Decimal | null;
}

export interface CatalogoMayorista {
  nivel: Referencia | null;
  planes: PlanMayorista[];
  tasaVes: Decimal | null;
}

export interface ResumenRevendedor {
  revendedor: RevendedorDetalle;
  saldoVes: Decimal | null;
  tasaVes: Decimal | null;
  comprasMes: number;
  gastoMesUsd: Decimal;
  comprasHoy: number;
  proximosVencimientos: SuscripcionPublica[];
}

export interface ClienteCartera {
  id: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  documento: string | null;
  pais: string | null;
  creadoEn: string;
  suscripciones: SuscripcionPublica[];
}

/** Tabla de precios mayoristas: una fila por plan revendible y una columna por nivel. */
export interface TablaPreciosMayoristas {
  niveles: NivelPublico[];
  planes: {
    id: string;
    nombre: string;
    servicio: string;
    precioUsd: Decimal;
    costoUsd: Decimal | null;
    activo: boolean;
    /** Por id de nivel; null si ese nivel no tiene precio. */
    precios: Record<string, Decimal | null>;
  }[];
  /** Planes marcados como revendibles cuyo proveedor no permite la reventa. */
  bloqueadosPorProveedor: { id: string; nombre: string; servicio: string; proveedor: string }[];
}

export interface ResumenProgramaRevendedores {
  solicitudes: number;
  aprobados: number;
  suspendidos: number;
  recargasEnRevision: number;
  /** Recargas confirmadas este mes (lo que el programa ingresa), en USD. */
  recargasMesUsd: Decimal;
  saldoTotalUsd: Decimal;
  comprasMes: number;
}
