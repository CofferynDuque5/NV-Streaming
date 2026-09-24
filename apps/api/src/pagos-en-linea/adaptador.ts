import type { Moneda, Pasarela } from '@nv/shared';

/**
 * Contrato de una pasarela de pago (PayPal, Mercado Pago, pruebas…).
 *
 * Guía para quien implemente una pasarela nueva:
 * - El núcleo (intentos, cobros automáticos, webhooks, devoluciones) solo habla con
 *   esta interfaz; nunca con el SDK o la API HTTP de la pasarela.
 * - Nunca recibas ni guardes datos de tarjeta: la pasarela aloja el pago y devuelve
 *   un token (vault id, acuerdo, customer+card id). El núcleo lo guarda cifrado.
 * - Los importes viajan como texto decimal con 2 decimales ("12.50"), nunca como
 *   número de coma flotante. Convierte a la unidad de la pasarela en el adaptador.
 * - Todas las operaciones deben ser idempotentes: el núcleo puede repetir una
 *   llamada (reintentos, un webhook y el retorno del cliente a la vez). Pasa
 *   `claveIdempotencia` a la pasarela (PayPal-Request-Id, X-Idempotency-Key…).
 * - Lanza un `Error` solo cuando no sabes el resultado (red, 5xx): el núcleo lo
 *   reintentará con la misma clave. Un rechazo conocido NO es un error: devuélvelo
 *   como `{ estado: 'rechazado', mensaje }`.
 * - `mensaje` se muestra al cliente: en español, sin detalles técnicos.
 * - No confíes en el cuerpo de un webhook para aprobar: el núcleo vuelve a consultar
 *   con `consultarPago` o `confirmarRetorno` antes de registrar el dinero.
 * - VES nunca se cobra en línea: el núcleo no te lo pedirá (ver INFO_PASARELA).
 */
export interface AdaptadorPasarela {
  readonly pasarela: Pasarela;
  /** "pruebas" usa el entorno de pruebas de la pasarela; "produccion" cobra de verdad. */
  readonly modo: 'pruebas' | 'produccion';
  /** Tiene las credenciales necesarias. Si no, el núcleo no la ofrece. */
  configurada(): boolean;

  /**
   * Crea la orden/preferencia y devuelve a dónde mandar al cliente. Con
   * `guardarMetodo`, pide a la pasarela guardar el método para cobros futuros
   * (vault / customer) y devolver el token al aprobarse.
   */
  crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }>;

  /**
   * El cliente volvió de la pasarela con estos parámetros (token, PayerID,
   * payment_id…). Completa lo que falte (p. ej. capturar la orden aprobada) y
   * devuelve el resultado normalizado.
   */
  confirmarRetorno(idExterno: string, parametros: Record<string, string>): Promise<ResultadoPago>;

  /** Consulta el estado actual de una orden (y la captura si ya está aprobada y falta capturar). */
  consultarPago(idExterno: string): Promise<ResultadoPago>;

  /**
   * Cobra sin el cliente presente con un token guardado. Con la misma
   * `claveIdempotencia` debe devolver el mismo cobro, nunca cobrar dos veces.
   * Si el token ya no sirve (tarjeta vencida, acuerdo cancelado), devuelve
   * `{ estado: 'rechazado', metodoInvalido: true }`.
   */
  cobrarConMetodo(token: string, e: DatosCobro): Promise<ResultadoPago>;

  /** Devuelve (total o parcialmente) un cobro. Idempotente por `claveIdempotencia`. */
  reembolsar(
    idCobro: string,
    monto: string,
    moneda: Moneda,
    claveIdempotencia: string,
  ): Promise<ResultadoReembolso>;

  /**
   * Verifica la firma de un webhook con el cuerpo crudo (exactamente los bytes
   * recibidos). Si no es válido, el núcleo responde 400 y no guarda nada.
   */
  verificarWebhook(
    cabeceras: Record<string, string | string[] | undefined>,
    cuerpoCrudo: Buffer,
  ): Promise<VerificacionWebhook>;

  /** Opcional: borra el token en la pasarela cuando el cliente revoca la autorización. */
  revocarMetodo?(token: string): Promise<void>;

  /**
   * Opcional: monedas en las que cobra la cuenta configurada, si son menos que las
   * de la pasarela (p. ej. una cuenta de Mercado Pago opera en un solo país).
   */
  monedasCuenta?(): readonly Moneda[];
}

export interface DatosCrearPago {
  /** Referencia de NV (P-XXXXXXXX): va como invoice_id / external_reference. */
  referencia: string;
  /** Id del intento de pago en NV. */
  idInterno: string;
  monto: string;
  moneda: Moneda;
  descripcion: string;
  urlRetorno: string;
  urlCancelacion: string;
  guardarMetodo: boolean;
  pagador: { nombre: string; correo: string | null };
}

export interface DatosCobro {
  referencia: string;
  monto: string;
  moneda: Moneda;
  descripcion: string;
  claveIdempotencia: string;
}

/** Resultado normalizado de una orden o un cobro. */
export interface ResultadoPago {
  estado: 'aprobado' | 'pendiente' | 'rechazado' | 'cancelado';
  /** Id del cobro/captura (lo que se devuelve en un reembolso). Obligatorio si aprobado. */
  idCobro: string | null;
  /** Lo que la pasarela dice que cobró ("12.50"). Obligatorio si aprobado. */
  montoRecibido: string | null;
  moneda: Moneda | null;
  /** Token y texto para mostrar ("Visa ···· 4242") cuando se pidió guardar el método. */
  metodoGuardado?: { token: string; descripcion: string };
  /** El token ya no sirve: el núcleo marca el método como inválido. */
  metodoInvalido?: boolean;
  /** Motivo legible para el cliente si no se aprobó. */
  mensaje?: string;
}

export interface ResultadoReembolso {
  estado: 'completado' | 'pendiente' | 'fallido';
  idReembolso: string | null;
  mensaje?: string;
}

/** Qué significa un evento para el núcleo. */
export type TipoEventoNormalizado =
  'pago_aprobado' | 'pago_rechazado' | 'reembolso_completado' | 'metodo_revocado' | 'otro';

export interface EventoWebhook {
  /** Id único del evento en la pasarela (para no procesarlo dos veces). */
  idEvento: string;
  /** Tipo tal como lo nombra la pasarela ("PAYMENT.CAPTURE.COMPLETED"). */
  tipo: string;
  /** Recurso afectado: orden, cobro o reembolso. Nunca un token (se guarda en claro). */
  idRecurso: string | null;
  normalizado: {
    tipo: TipoEventoNormalizado;
    /** Id de la orden (intento) o del cobro, según el evento. */
    idExterno?: string | null;
    idCobro?: string | null;
    idReembolso?: string | null;
    token?: string | null;
  };
  /** Cuerpo sin datos personales (correo, nombre, dirección, tarjeta) ni tokens: es lo que se guarda. */
  carga: Record<string, unknown>;
}

export interface VerificacionWebhook {
  valido: boolean;
  evento?: EventoWebhook;
}

/** Quita datos personales de un cuerpo de webhook antes de guardarlo. */
export function redactarCarga(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 8) return '[…]';
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => redactarCarga(v, profundidad + 1));
  if (valor && typeof valor === 'object') {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      r[k] = esCampoPersonal(k) ? '[redactado]' : redactarCarga(v, profundidad + 1);
    }
    return r;
  }
  if (typeof valor === 'string' && /@/.test(valor) && /\.[a-z]{2,}$/i.test(valor)) {
    return '[redactado]';
  }
  return valor;
}

const CAMPOS_PERSONALES =
  /(email|correo|name|nombre|payer|pagador|address|direcci|phone|tel[eé]fono|document|identification|card|tarjeta|token|birth|nacimiento)/i;

function esCampoPersonal(clave: string): boolean {
  return CAMPOS_PERSONALES.test(clave) || /(^|[_-])ip($|[_-])|^ip[A-Z]|Ip$/.test(clave);
}

/** Pasarela sin adaptador todavía (o sin credenciales): no se ofrece y cualquier llamada falla. */
export class AdaptadorNoDisponible implements AdaptadorPasarela {
  constructor(
    readonly pasarela: Pasarela,
    readonly modo: 'pruebas' | 'produccion' = 'pruebas',
  ) {}

  configurada(): boolean {
    return false;
  }

  private falla(): never {
    throw new Error(`La pasarela ${this.pasarela} no está disponible.`);
  }

  crearPago(): Promise<{ idExterno: string; urlPago: string }> {
    this.falla();
  }
  confirmarRetorno(): Promise<ResultadoPago> {
    this.falla();
  }
  consultarPago(): Promise<ResultadoPago> {
    this.falla();
  }
  cobrarConMetodo(): Promise<ResultadoPago> {
    this.falla();
  }
  reembolsar(): Promise<ResultadoReembolso> {
    this.falla();
  }
  async verificarWebhook(): Promise<VerificacionWebhook> {
    return { valido: false };
  }
}
