import type { CategoriaServicio } from './categorias.js';
import type { TipoProveedor, UnidadDuracion } from './esquemas/catalogo.js';
import type { EstadoCliente } from './esquemas/clientes.js';
import type { EstadoFactura, EstadoPago, TipoCupon } from './esquemas/cobros.js';
import type { CategoriaTicket, EstadoTicket, PrioridadTicket } from './esquemas/soporte.js';
import type { EstadoSuscripcion } from './esquemas/suscripciones.js';
import type { Moneda, MonedaConTasa } from './monedas.js';

/** Los importes viajan como texto decimal ("12.50") para no perder precisión. */
export type Decimal = string;

export interface Referencia {
  id: string;
  nombre: string;
}

export interface TasaVigente {
  moneda: MonedaConTasa;
  valor: Decimal;
  vigenteDesde: string;
  autor: Referencia | null;
  /** "manual" (la registró una persona) o "automatica" (la trajo la automatización de tasa). */
  origen?: 'manual' | 'automatica';
  /** Fuente consultada cuando es automática (p. ej. "bcv"). */
  fuente?: string | null;
}

export interface MetodoCobroPublico {
  id: string;
  nombre: string;
  moneda: Moneda;
  instrucciones: string;
  requiereReferencia: boolean;
  /** "manual" (con comprobante) o "pasarela" (pago en línea). */
  tipo?: 'manual' | 'pasarela';
  pasarela?: 'paypal' | 'mercadopago' | 'sandbox' | null;
  activo: boolean;
  orden: number;
}

export interface ClienteResumen {
  id: string;
  nombre: string;
  correo: string | null;
  pais: string | null;
  monedaPreferida: Moneda;
  estado: EstadoCliente;
  asignadoA: Referencia | null;
  tieneAcceso: boolean;
  suscripcionesActivas: number;
  creadoEn: string;
}

export interface ContactoPublico {
  id: string;
  tipo: 'correo' | 'whatsapp' | 'telefono';
  valor: string;
  consentimientoEn: string | null;
}

export interface ClienteDetalle extends ClienteResumen {
  documento: string | null;
  origen: string;
  contactos: ContactoPublico[];
  usuario: { id: string; correo: string; ultimoAccesoEn: string | null } | null;
  actualizadoEn: string;
}

export interface NotaPublica {
  id: string;
  texto: string;
  autor: Referencia;
  creadoEn: string;
}

export interface ProveedorPublico {
  id: string;
  nombre: string;
  tipo: TipoProveedor;
  adaptador: string;
  permiteReventa: boolean;
  notasAcuerdo: string | null;
  activo: boolean;
  servicios: number;
}

export interface ServicioPublico {
  id: string;
  proveedor: Referencia & { tipo: TipoProveedor };
  nombre: string;
  slug: string;
  descripcion: string | null;
  categoria: CategoriaServicio | null;
  activo: boolean;
}

/** Precio en cada moneda. `null` si falta la tasa de esa moneda y no hay precio fijo. */
export type PreciosPorMoneda = Record<Moneda, { precio: Decimal; fijo: boolean } | null>;

export interface PlanPublico {
  id: string;
  servicio: { id: string; nombre: string; slug: string };
  nombre: string;
  descripcion: string | null;
  precioUsd: Decimal;
  duracionCantidad: number;
  duracionUnidad: UnidadDuracion;
  beneficios: string[];
  activo: boolean;
  visible: boolean;
  renovable: boolean;
  revendible: boolean;
  /** Costo para NV en USD. Solo lo recibe el equipo. */
  costoUsd?: Decimal | null;
  /** Referencia en el sistema del proveedor (fase 6). Solo la recibe el equipo. */
  skuProveedor?: string | null;
  orden: number;
  precios: PreciosPorMoneda;
}

export interface SuscripcionPublica {
  id: string;
  cliente: Referencia;
  plan: {
    id: string;
    nombre: string;
    servicio: string;
    /** Slug y universo del servicio: eligen su imagen o su orbe. */
    servicioSlug: string;
    categoria: CategoriaServicio | null;
    duracionCantidad: number;
    duracionUnidad: UnidadDuracion;
    renovable: boolean;
  };
  estado: EstadoSuscripcion;
  moneda: Moneda;
  inicioEn: string | null;
  venceEn: string | null;
  pausadaEn: string | null;
  cancelarAlVencer: boolean;
  canceladaEn: string | null;
  creadoEn: string;
  facturaAbierta: { id: string; numero: string } | null;
  /** Método autorizado con el que se cobra sola al vencer (fase 4); null = pago manual. */
  cobroAutomatico?: { metodoId: string; descripcion: string } | null;
  /**
   * La activó un revendedor con su saldo: la renueva, cancela y paga él, no el
   * cliente. Lo que el cliente compra directo en la tienda es `false`.
   */
  gestionadaPorRevendedor: boolean;
}

export interface EventoSuscripcionPublico {
  id: string;
  tipo: string;
  actor: Referencia | null;
  motivo: string | null;
  creadoEn: string;
}

export interface SuscripcionDetalle extends SuscripcionPublica {
  eventos: EventoSuscripcionPublico[];
}

export interface LineaFacturaPublica {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: Decimal;
  total: Decimal;
}

export interface FacturaPublica {
  id: string;
  numero: string;
  cliente: Referencia;
  suscripcionId: string | null;
  concepto: 'alta' | 'renovacion';
  estado: EstadoFactura;
  /** Emitida y con el vencimiento ya pasado. */
  vencida: boolean;
  moneda: Moneda;
  subtotal: Decimal;
  descuento: Decimal;
  total: Decimal;
  tasa: Decimal;
  totalUsd: Decimal;
  cupon: string | null;
  venceEn: string;
  pagadaEn: string | null;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  creadoEn: string;
  pagoEnRevision: boolean;
  /** Pedido del carrito al que pertenece (null en renovaciones y altas sueltas). */
  pedidoId: string | null;
  /** Plan facturado (el de su primera línea con plan); null si no tiene. */
  plan: PlanDeFactura | null;
  /** Es de una suscripción que gestiona un revendedor: el cliente no la paga. */
  gestionadaPorRevendedor: boolean;
}

/** Plan facturado y su servicio, para mostrarlo con su imagen. */
export interface PlanDeFactura {
  id: string;
  nombre: string;
  servicio: { nombre: string; slug: string; categoria: CategoriaServicio | null };
}

export interface FacturaDetalle extends FacturaPublica {
  lineas: LineaFacturaPublica[];
  pagos: PagoPublico[];
}

export interface PagoPublico {
  id: string;
  referencia: string;
  factura: { id: string; numero: string; total: Decimal; moneda: Moneda };
  cliente: Referencia;
  metodo: Referencia;
  moneda: Moneda;
  montoDeclarado: Decimal;
  montoRecibido: Decimal | null;
  referenciaExterna: string | null;
  fechaPago: string;
  estado: EstadoPago;
  motivoRechazo: string | null;
  tieneComprobante: boolean;
  creadoEn: string;
  /** "manual", "pasarela" (fase 4) o "billetera" (pagado con saldo). */
  origen?: 'manual' | 'pasarela' | 'billetera';
  pasarela?: 'paypal' | 'mercadopago' | 'sandbox' | null;
  montoReembolsado?: Decimal;
  /** Solo para el equipo. */
  notasConciliacion?: string | null;
  revisadoPor?: Referencia | null;
  revisadoEn?: string | null;
}

export interface CuponPublico {
  id: string;
  codigo: string;
  tipo: TipoCupon;
  valor: Decimal;
  validoDesde: string | null;
  validoHasta: string | null;
  usosMaximos: number | null;
  usos: number;
  soloAltas: boolean;
  activo: boolean;
  planes: Referencia[];
  creadoPor: Referencia;
  creadoEn: string;
}

export interface Cotizacion {
  moneda: Moneda;
  subtotal: Decimal;
  descuento: Decimal;
  total: Decimal;
  cupon: string | null;
}

export interface TicketResumen {
  id: string;
  numero: number;
  asunto: string;
  categoria: CategoriaTicket;
  prioridad: PrioridadTicket;
  estado: EstadoTicket;
  cliente: Referencia;
  asignadoA: Referencia | null;
  /** Quién lo abrió: el cliente, el equipo o el sistema (escalado automático). */
  origen?: 'cliente' | 'equipo' | 'sistema';
  slaPrimeraRespuesta: string;
  primeraRespuestaEn: string | null;
  /** Sin respuesta del equipo y con el plazo vencido. */
  slaIncumplido: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MensajeTicketPublico {
  id: string;
  texto: string;
  interno: boolean;
  autor: { id: string; nombre: string; esEquipo: boolean };
  creadoEn: string;
}

export interface TicketDetalle extends TicketResumen {
  suscripcionId: string | null;
  mensajes: MensajeTicketPublico[];
}

export interface IngresoPorMoneda {
  moneda: Moneda;
  total: Decimal;
  pagos: number;
}

export interface MetricasPanel {
  /** true si las cifras son solo de la cartera de quien consulta (ventas). */
  soloCartera: boolean;
  clientesActivos: number;
  clientesNuevosMes: number;
  suscripcionesPorEstado: Record<EstadoSuscripcion, number>;
  /** Ingreso mensual recurrente estimado de las suscripciones activas, en USD. */
  ingresoMensualRecurrenteUsd: Decimal;
  ingresosMes: IngresoPorMoneda[];
  ingresosMesUsd: Decimal;
  /** Las mismas cifras en bolívares con la tasa vigente; null si no hay tasa registrada. */
  enBolivares: {
    tasa: Decimal;
    ingresoMensualRecurrente: Decimal;
    ingresosMes: Decimal;
  } | null;
  pagosEnRevision: number;
  facturasVencidas: number;
  ticketsAbiertos: number;
  ticketsSlaIncumplido: number;
  proximosVencimientos: SuscripcionPublica[];
  tasasFaltantes: MonedaConTasa[];
}

/**
 * Lo que el menú de la cuenta del cliente muestra en todas sus páginas: quién
 * gestiona la cuenta y cuántas cosas esperan algo de él.
 */
export interface PanelCliente {
  /**
   * Revendedor del cliente; null si solo compra directo en NV. Aun con
   * revendedor, el cliente tiene billetera y carrito para comprar directo.
   */
  revendedor: { nombre: string } | null;
  pendientes: {
    /** Accesos listos con código o enlace que aún no ha mostrado. */
    accesosSinVer: number;
    /** Facturas emitidas sin un pago en revisión (sin las de servicios de su revendedor). */
    facturasPorPagar: number;
    /** Solicitudes de soporte que esperan su respuesta. */
    ticketsPorResponder: number;
  };
}

export interface ResumenCliente {
  cliente: ClienteDetalle;
  suscripciones: SuscripcionPublica[];
  facturasPendientes: FacturaPublica[];
  ticketsAbiertos: number;
}

/** Servicio con al menos un plan a la venta, tal como lo ve el público. */
export interface ServicioCatalogo {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  categoria: CategoriaServicio | null;
}

export interface CatalogoPublico {
  planes: PlanPublico[];
  /** Servicios que tienen planes en `planes`, en el orden del catálogo. */
  servicios: ServicioCatalogo[];
  /**
   * Ids de servicio ordenados por activaciones y renovaciones de los últimos
   * 30 días (solo los que tuvieron alguna). Es el orden de «Lo más pedido».
   */
  masPedidos: string[];
  monedas: Moneda[];
  tasas: TasaVigente[];
}
