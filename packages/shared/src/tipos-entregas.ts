import type {
  AdaptadorEntrega,
  EstadoCodigo,
  EstadoEntrega,
  LineaInvalida,
  MotivoEntrega,
} from './entregas.js';
import type { TipoProveedor } from './esquemas/catalogo.js';
import type { EstadoSuscripcion } from './esquemas/suscripciones.js';
import type { Referencia } from './tipos-negocio.js';
import type { Pagina } from './tipos.js';

/** Respuestas de la API de entregas (fase 6). Fechas en ISO 8601. Nunca incluyen códigos ni enlaces. */

export interface EntregaResumen {
  id: string;
  estado: EstadoEntrega;
  motivo: MotivoEntrega;
  adaptador: AdaptadorEntrega;
  proveedor: Referencia;
  plan: { id: string; nombre: string; servicio: string };
  cliente: Referencia;
  revendedor: { id: string; nombreComercial: string } | null;
  suscripcionId: string | null;
  compraRevendedorId: string | null;
  factura: { id: string; numero: string } | null;
  intentos: number;
  proximoIntentoEn: string | null;
  error: string | null;
  referenciaExterna: string | null;
  /** Hay un código o un enlace guardado (cifrado); el equipo no lo ve. */
  tieneCodigo: boolean;
  tieneEnlace: boolean;
  entregadaEn: string | null;
  vistaEn: string | null;
  revocadaEn: string | null;
  anuladaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface EventoEntrega {
  accion: string;
  fecha: string;
  actor: Referencia | null;
  actorTipo: 'usuario' | 'ia' | 'sistema';
}

export interface EntregaDetalle extends EntregaResumen {
  instrucciones: string | null;
  motivoAnulacion: string | null;
  completadaPor: Referencia | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  /** Código de inventario asignado: solo el inicio de su huella y su lote, nunca el código. */
  codigoInventario: { id: string; huella: string; lote: Referencia } | null;
  historial: EventoEntrega[];
}

export interface PaginaEntregas extends Pagina<EntregaResumen> {
  /** Entregas por estado (con los demás filtros aplicados). */
  contadores: Record<EstadoEntrega, number>;
}

/** Un acceso en «Mis accesos» del cliente o en el panel del revendedor. */
export interface AccesoServicio {
  id: string;
  estado: EstadoEntrega;
  motivo: MotivoEntrega;
  servicio: string;
  plan: string;
  /** Cliente final (solo en la vista del revendedor). */
  cliente: Referencia | null;
  suscripcion: { id: string; estado: EstadoSuscripcion; venceEn: string | null } | null;
  instrucciones: string | null;
  tieneCodigo: boolean;
  tieneEnlace: boolean;
  entregadaEn: string | null;
  vistaEn: string | null;
  creadoEn: string;
}

/** Respuesta de «Mostrar código»: se descifra en el momento y no se guarda en caché. */
export interface AccesoRevelado {
  id: string;
  codigo: string | null;
  enlace: string | null;
  instrucciones: string | null;
  vistaEn: string;
}

export interface InventarioPlan {
  plan: { id: string; nombre: string; servicio: string; activo: boolean };
  proveedor: { id: string; nombre: string; adaptador: AdaptadorEntrega };
  disponibles: number;
  /** Disponibles pero ya vencidos: no se entregan. */
  vencidos: number;
  entregados: number;
  anulados: number;
  /** Entregas esperando porque no había códigos. */
  pendientes: number;
}

export interface LoteResumen {
  id: string;
  nombre: string;
  cantidad: number;
  repetidos: number;
  disponibles: number;
  venceEn: string | null;
  subidoPor: Referencia;
  creadoEn: string;
}

export interface CodigoResumen {
  id: string;
  /** Inicio de la huella (HMAC), para identificarlo sin mostrar el código. */
  huella: string;
  estado: EstadoCodigo;
  lote: Referencia;
  venceEn: string | null;
  entregadoEn: string | null;
  entregaId: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  creadoEn: string;
}

export interface InventarioDetalle extends InventarioPlan {
  lotes: LoteResumen[];
  codigos: Pagina<CodigoResumen>;
}

/** Resultado de subir un lote. Nunca repite los códigos. */
export interface ResultadoLote {
  lote: LoteResumen;
  anadidos: number;
  /** Repetidos dentro del mismo archivo. */
  repetidosEnArchivo: number;
  /** Ya estaban en el inventario (de este u otro plan). */
  yaExistentes: number;
  invalidos: LineaInvalida[];
  /** Entregas sin stock que se volvieron a intentar. */
  entregasReintentadas: number;
}

export interface ConfigEntregaProveedor {
  proveedor: Referencia & { tipo: TipoProveedor; activo: boolean };
  adaptador: AdaptadorEntrega;
  webhookUrl: string | null;
  tiempoLimiteSegundos: number;
  incluirCorreo: boolean;
  entregarRenovaciones: boolean;
  instrucciones: string | null;
  tieneSecreto: boolean;
  secretoRotadoEn: string | null;
  /** Planes del proveedor con su referencia (SKU) en el sistema del proveedor. */
  planes: { id: string; nombre: string; servicio: string; skuProveedor: string | null }[];
  contadores: Record<EstadoEntrega, number>;
}

/** La clave de firma se muestra una sola vez, al rotarla. */
export interface SecretoRotado {
  secreto: string;
  rotadoEn: string;
}

export interface PruebaWebhook {
  ok: boolean;
  estadoHttp: number | null;
  mensaje: string;
  duracionMs: number;
}
