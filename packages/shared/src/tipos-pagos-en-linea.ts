import type { Moneda } from './monedas.js';
import type {
  EstadoCobroAutomatico,
  EstadoEventoPasarela,
  EstadoIntentoPago,
  Pasarela,
} from './pagos-en-linea.js';
import type { Decimal, Referencia } from './tipos-negocio.js';

/** Respuestas de la API de pagos en línea (fase 4). Fechas en ISO 8601. */

export interface EstadoPasarela {
  pasarela: Pasarela;
  nombre: string;
  /** Tiene las credenciales que necesita. */
  configurada: boolean;
  /** "pruebas" usa el entorno de pruebas de la pasarela; "produccion" cobra de verdad. */
  modo: 'pruebas' | 'produccion';
  monedas: Moneda[];
  admiteCobroRecurrente: boolean;
  /** URL que hay que registrar en la pasarela para recibir sus avisos. */
  urlWebhook: string;
}

/** Método en línea que el cliente puede elegir para pagar una factura. */
export interface OpcionPagoEnLinea {
  metodoCobroId: string;
  nombre: string;
  pasarela: Pasarela;
  moneda: Moneda;
  /** Se puede guardar para cobros automáticos. */
  admiteGuardar: boolean;
}

export interface OpcionesPagoEnLinea {
  factura: { id: string; numero: string; total: Decimal; moneda: Moneda };
  opciones: OpcionPagoEnLinea[];
  /** Texto de autorización ya personalizado por pasarela, y su versión. */
  textosAutorizacion: Partial<Record<Pasarela, string>>;
  versionTexto: string;
}

export interface IntentoPagoPublico {
  id: string;
  referencia: string;
  facturaId: string;
  pasarela: Pasarela;
  moneda: Moneda;
  monto: Decimal;
  estado: EstadoIntentoPago;
  /** A dónde mandar al cliente para pagar; null si ya terminó. */
  urlPago: string | null;
  guardarMetodo: boolean;
  /** Mensaje para el cliente si falló. */
  error: string | null;
  pagoId: string | null;
  expiraEn: string;
  creadoEn: string;
}

export interface MetodoAutorizadoPublico {
  id: string;
  pasarela: Pasarela;
  descripcion: string;
  moneda: Moneda;
  estado: 'activo' | 'revocado' | 'invalido';
  autorizadoEn: string;
  versionTexto: string;
  /** Solo para el equipo y el propio cliente. */
  textoAceptado: string;
  revocadoEn: string | null;
  motivoEstado: string | null;
  /** Suscripciones que se cobran solas con este método. */
  suscripciones: { id: string; plan: string; venceEn: string | null }[];
}

export interface CobroAutomaticoResumen {
  id: string;
  factura: { id: string; numero: string; total: Decimal; moneda: Moneda };
  cliente: Referencia;
  suscripcionId: string;
  metodo: { id: string; descripcion: string; pasarela: Pasarela };
  intento: number;
  estado: EstadoCobroAutomatico;
  programadoPara: string;
  ejecutadoEn: string | null;
  error: string | null;
  pagoId: string | null;
}

export interface EventoPasarelaResumen {
  id: string;
  pasarela: Pasarela;
  idEvento: string;
  tipo: string;
  idRecurso: string | null;
  firmaValida: boolean;
  estado: EstadoEventoPasarela;
  error: string | null;
  recibidoEn: string;
  procesadoEn: string | null;
}

export interface ReembolsoResumen {
  id: string;
  pagoId: string;
  monto: Decimal;
  moneda: Moneda;
  motivo: string;
  estado: 'solicitado' | 'completado' | 'fallido';
  error: string | null;
  solicitadoPor: Referencia;
  creadoEn: string;
  completadoEn: string | null;
}

/** Lo que muestra la página de la pasarela de pruebas (sandbox). */
export interface IntentoSandboxPublico {
  referencia: string;
  monto: Decimal;
  moneda: Moneda;
  descripcion: string;
  guardarMetodo: boolean;
  estado: EstadoIntentoPago;
}

/** Respuesta al simular un resultado en la pasarela de pruebas: a dónde volver. */
export interface ResultadoSimulacionSandbox {
  urlRetorno: string;
}

/** Respuesta al activar o desactivar el cobro automático de una suscripción. */
export interface CobroAutomaticoSuscripcion {
  metodoAutorizadoId: string | null;
}
