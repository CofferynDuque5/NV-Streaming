/** Tipos de respuesta del programa de revendedores (fase 2). */
import type { CategoriaServicio } from './categorias.js';
import type { UnidadDuracion } from './esquemas/catalogo.js';
import type {
  EstadoCompra,
  EstadoRecarga,
  EstadoRevendedor,
  FiltroCartera,
  FiltroRenovaciones,
  FiltroVentas,
  PeriodoVentas,
  TipoCompra,
  TipoMovimientoSaldo,
} from './esquemas/revendedores.js';
import type { Moneda } from './monedas.js';
import type { Decimal, Referencia, SuscripcionPublica } from './tipos-negocio.js';
import type { Pagina } from './tipos.js';

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
  compra: { id: string; tipo: TipoCompra; plan: string; cliente: string } | null;
  autor: Referencia | null;
  creadoEn: string;
}

export interface CompraPublica {
  id: string;
  tipo: TipoCompra;
  estado: EstadoCompra;
  revendedor: Referencia;
  plan: {
    id: string;
    nombre: string;
    servicio: string;
    /** Slug y universo del servicio: eligen su imagen o su orbe. */
    servicioSlug: string;
    categoria: CategoriaServicio | null;
  };
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
  /** Slug y universo del servicio: eligen su imagen, su orbe y su filtro. */
  servicio: { id: string; nombre: string; slug: string; categoria: CategoriaServicio | null };
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
  /** Accesos ya entregados a sus clientes que todavía no ha mostrado. */
  accesosSinVer: number;
  /** Servicios renovables vencidos, en gracia o que vencen en 7 días o menos. */
  renovacionesUrgentes: number;
  proximosVencimientos: SuscripcionPublica[];
}

/** Saldo del revendedor con las cifras de la pantalla «Saldo y recargas». */
export interface SaldoRevendedor {
  saldoUsd: Decimal;
  /** Cuántas recargas hay en cada estado (para los filtros de la lista). */
  recargasPorEstado: Record<EstadoRecarga, number>;
  /** Movimientos del libro mayor desde que se abrió la cuenta. */
  totalMovimientos: number;
  /** Lo que entró y salió del saldo en los últimos 30 días, en USD (salidas en positivo). */
  ultimos30Dias: { entradasUsd: Decimal; salidasUsd: Decimal };
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

// ── Ventas, cartera y renovaciones del panel ────────────────────────────────

/**
 * Una venta del revendedor (una compra con su saldo) con el precio al público
 * del plan y la ganancia estimada: precio al público de hoy menos lo que pagó.
 */
export interface VentaRevendedor extends CompraPublica {
  precioPublicoUsd: Decimal;
  /** null si se reembolsó. */
  gananciaUsd: Decimal | null;
}

/** Cifras de un conjunto de ventas. Solo las completadas suman en ventas e importes. */
export interface TotalesVentas {
  ventas: number;
  pagadoUsd: Decimal;
  publicoUsd: Decimal;
  /** Estimada: precio al público menos lo pagado. */
  gananciaUsd: Decimal;
  reembolsadas: number;
  /** Lo que volvió al saldo por las reembolsadas. */
  reembolsadoUsd: Decimal;
}

/** Un día de la serie (fecha de Venezuela, AAAA-MM-DD), solo con ventas completadas. */
export interface DiaVentas {
  fecha: string;
  ventas: number;
  pagadoUsd: Decimal;
  gananciaUsd: Decimal;
}

export interface PlanMasVendido {
  plan: CompraPublica['plan'];
  ventas: number;
  pagadoUsd: Decimal;
  gananciaUsd: Decimal;
}

export interface ResumenVentas {
  periodo: PeriodoVentas;
  /** Inicio del periodo (medianoche de Venezuela). */
  desde: string;
  /** Un elemento por día del periodo, del más antiguo a hoy (también los días sin ventas). */
  dias: DiaVentas[];
  totales: TotalesVentas;
  /** Los 5 planes con más ventas completadas del periodo. */
  masVendidos: PlanMasVendido[];
}

/** Ventas del periodo con el filtro elegido, sus cifras y cuántas hay de cada tipo. */
export interface PaginaVentas extends Pagina<VentaRevendedor> {
  totales: TotalesVentas;
  conteos: Record<FiltroVentas, number>;
}

/** Un cliente de la cartera con sus cifras (tabla «Clientes»). */
export interface ClienteCarteraFila extends ClienteCartera {
  /** Ventas completadas al cliente y lo que pagó el revendedor por ellas. */
  ventas: number;
  totalCompradoUsd: Decimal;
  ultimaVentaEn: string | null;
  /** El servicio activo, en gracia, vencido o suspendido que vence primero. */
  proximoVencimiento: SuscripcionPublica | null;
  /** Servicios activos o en gracia. */
  serviciosActivos: number;
}

export interface PaginaCartera extends Pagina<ClienteCarteraFila> {
  /** Clientes de cada filtro (con la búsqueda aplicada). */
  conteos: Record<'todos' | FiltroCartera, number>;
}

/** Un servicio de un cliente con el precio de renovarlo en el nivel, o por qué no se puede. */
export interface ServicioRenovable {
  suscripcion: SuscripcionPublica;
  /** Precio mayorista de la renovación; null si no se puede renovar. */
  precioUsd: Decimal | null;
  /** Por qué no se renueva (null si se puede o si no aplica, como una cancelada). */
  noRenovable: string | null;
}

/** Ficha del cliente: contacto, cifras, servicios con «Renovar» e historial. */
export interface ClienteCarteraDetalle extends ClienteCarteraFila {
  servicios: ServicioRenovable[];
  /** Las ventas más recientes al cliente (hasta 20). */
  historial: VentaRevendedor[];
}

/** Servicios que se pueden renovar con el filtro elegido y las cifras de cada filtro. */
export interface ListaRenovaciones {
  filtro: FiltroRenovaciones;
  /** Todos con `precioUsd`, del que vence primero al último. */
  elementos: ServicioRenovable[];
  totales: Record<FiltroRenovaciones, { cantidad: number; totalUsd: Decimal }>;
}

export interface ResultadoRenovacionLote {
  /** Saldo después de renovar. */
  saldoUsd: Decimal;
  totalUsd: Decimal;
  /** La clave ya se había usado: se devuelve el lote original sin cobrar otra vez. */
  repetida: boolean;
  renovadas: { suscripcionId: string; compra: CompraPublica }[];
}
