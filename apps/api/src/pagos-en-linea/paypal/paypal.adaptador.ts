import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Moneda, MONEDAS } from '@nv/shared';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { D } from '../../dinero/dinero.js';
import {
  type AdaptadorPasarela,
  type DatosCobro,
  type DatosCrearPago,
  type EventoWebhook,
  redactarCarga,
  type ResultadoPago,
  type ResultadoReembolso,
  type TipoEventoNormalizado,
  type VerificacionWebhook,
} from '../adaptador.js';

/** Solo para pruebas: otra URL base (servidor falso) y otro tiempo máximo por llamada. */
export const OPCIONES_PAYPAL = Symbol('OPCIONES_PAYPAL');
export interface OpcionesPaypal {
  urlBase?: string;
  tiempoLimiteMs?: number;
}

const URL_BASE = {
  pruebas: 'https://api-m.sandbox.paypal.com',
  produccion: 'https://api-m.paypal.com',
} as const;
const TIEMPO_LIMITE_MS = 15_000;
/** El token de acceso se renueva este margen antes de que venza. */
const MARGEN_TOKEN_S = 300;
/**
 * Modelo de cobro declarado al guardar la cuenta (y en cada cobro sin el cliente):
 * NV cobra la factura de renovación antes de empezar el periodo → suscripción prepagada.
 */
const PATRON_USO = 'SUBSCRIPTION_PREPAID';
/** Español de Latinoamérica en las páginas de PayPal (si PayPal no lo acepta, se omite). */
const IDIOMA = 'es-XC';
const MARCA = 'NV Streaming';

/** Cabeceras con las que PayPal firma cada webhook. */
const CABECERAS_WEBHOOK = {
  auth_algo: 'paypal-auth-algo',
  cert_url: 'paypal-cert-url',
  transmission_id: 'paypal-transmission-id',
  transmission_sig: 'paypal-transmission-sig',
  transmission_time: 'paypal-transmission-time',
} as const;

const EVENTOS: Record<string, TipoEventoNormalizado> = {
  'PAYMENT.CAPTURE.COMPLETED': 'pago_aprobado',
  // El cliente aprobó pero no volvió a la web: el núcleo consulta y la orden se captura.
  'CHECKOUT.ORDER.APPROVED': 'pago_aprobado',
  'PAYMENT.CAPTURE.DENIED': 'pago_rechazado',
  'PAYMENT.CAPTURE.DECLINED': 'pago_rechazado',
  'PAYMENT.CAPTURE.REFUNDED': 'reembolso_completado',
  'VAULT.PAYMENT-TOKEN.DELETED': 'metodo_revocado',
};

/** El token guardado ya no sirve: el cliente lo quitó en PayPal o la cuenta cambió. */
const PROBLEMAS_TOKEN_INVALIDO = new Set([
  'INVALID_RESOURCE_ID',
  'RESOURCE_NOT_FOUND',
  'PAYMENT_TOKEN_NOT_FOUND',
  'AGREEMENT_ALREADY_CANCELLED',
  'BILLING_AGREEMENT_NOT_FOUND',
  'PAYER_ACCOUNT_LOCKED_OR_CLOSED',
]);

// ── Formas (parciales) de las respuestas de PayPal ──────────────────────────

interface DineroPP {
  currency_code?: string;
  value?: string;
}
interface CapturaPP {
  id?: string;
  status?: string;
  amount?: DineroPP;
  status_details?: { reason?: string };
}
interface OrdenPP {
  id?: string;
  status?: string;
  links?: { href?: string; rel?: string }[];
  purchase_units?: { payments?: { captures?: CapturaPP[] } }[];
  payment_source?: {
    paypal?: {
      email_address?: string;
      attributes?: { vault?: { id?: string; status?: string } };
    };
  };
}
interface ReembolsoPP {
  id?: string;
  status?: string;
  status_details?: { reason?: string };
}
interface ErrorPP {
  name?: string;
  debug_id?: string;
  details?: { issue?: string; field?: string }[];
}
interface EventoPP {
  id?: unknown;
  event_type?: unknown;
  resource_type?: unknown;
  resource?: Record<string, unknown> & {
    id?: unknown;
    status?: unknown;
    supplementary_data?: { related_ids?: { order_id?: unknown } };
  };
}

interface Respuesta<T> {
  estado: number;
  datos: T | null;
}

const ok = (r: Respuesta<unknown>) => r.estado >= 200 && r.estado < 300;
const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * PayPal con la API REST oficial: Orders v2 (pago único y guardado de la cuenta
 * con Vault v3) y cobros sin el cliente con el `vault_id`. Sin SDK: `fetch` con
 * tiempo máximo, token OAuth2 en memoria y `PayPal-Request-Id` en cada escritura.
 *
 * Nunca se registran ni se incluyen en errores el secreto, el token de acceso,
 * el correo del pagador ni el id guardado (vault id).
 *
 * Decisión: `consultarPago` captura una orden APROBADA. El cliente ya pulsó
 * "Pagar ahora" en PayPal (user_action PAY_NOW), así que capturar es completar
 * lo que pidió; la captura usa un `PayPal-Request-Id` fijo por orden, así que el
 * retorno, un webhook y la consulta periódica nunca cobran dos veces. Sin capturar,
 * la aprobación caduca a las pocas horas y el pago se perdería.
 */
@Injectable()
export class AdaptadorPaypal implements AdaptadorPasarela {
  readonly pasarela = 'paypal' as const;
  readonly modo: 'pruebas' | 'produccion';
  private readonly logger = new Logger('PayPal');
  private readonly urlBase: string;
  private readonly tiempoLimiteMs: number;
  private token: { valor: string; venceEn: number } | null = null;
  private pidiendoToken: Promise<string> | null = null;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Optional() @Inject(OPCIONES_PAYPAL) opciones?: OpcionesPaypal,
  ) {
    this.modo = entorno.PAYPAL_MODO;
    this.urlBase = (opciones?.urlBase ?? URL_BASE[this.modo]).replace(/\/+$/, '');
    this.tiempoLimiteMs = opciones?.tiempoLimiteMs ?? TIEMPO_LIMITE_MS;
  }

  configurada(): boolean {
    const e = this.entorno;
    return Boolean(e.PAYPAL_CLIENTE_ID && e.PAYPAL_SECRETO && e.PAYPAL_WEBHOOK_ID);
  }

  async crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }> {
    const cuerpo = (conIdioma: boolean) => ({
      intent: 'CAPTURE',
      purchase_units: [unidadDeCompra(e.referencia, e.descripcion, e.monto, e.moneda)],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: MARCA,
            ...(conIdioma ? { locale: IDIOMA } : {}),
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            return_url: e.urlRetorno,
            cancel_url: e.urlCancelacion,
          },
          ...(e.guardarMetodo
            ? {
                attributes: {
                  vault: {
                    store_in_vault: 'ON_SUCCESS',
                    usage_type: 'MERCHANT',
                    customer_type: 'CONSUMER',
                    usage_pattern: PATRON_USO,
                    permit_multiple_payment_tokens: true,
                    description: 'Cobro automático de tus renovaciones en NV Streaming',
                  },
                },
              }
            : {}),
        },
      },
    });
    const r = await this.crearOrden(
      'crear la orden',
      cuerpo,
      idPeticion(`orden-${e.idInterno}`),
      'locale',
    );
    if (!ok(r)) throw this.fallo('crear la orden', r);
    const orden = r.datos as OrdenPP | null;
    const enlace =
      orden?.links?.find((l) => l.rel === 'payer-action') ??
      orden?.links?.find((l) => l.rel === 'approve');
    if (!orden?.id || !enlace?.href) {
      throw new Error('PayPal creó la orden sin id o sin enlace de pago.');
    }
    return { idExterno: orden.id, urlPago: enlace.href };
  }

  /**
   * Al volver, PayPal añade `token` (= id de la orden) y `PayerID`: se usa siempre
   * nuestro id. Se lee la orden antes de capturar: solo se captura una APROBADA, así
   * la clave fija de la captura nunca queda asociada a un "aún no aprobada".
   */
  confirmarRetorno(
    idExterno: string,
    _parametros?: Record<string, string>,
  ): Promise<ResultadoPago> {
    return this.consultarPago(idExterno);
  }

  async consultarPago(idExterno: string): Promise<ResultadoPago> {
    const r = await this.pedir<OrdenPP>(
      'consultar la orden',
      'GET',
      `/v2/checkout/orders/${encodeURIComponent(idExterno)}`,
    );
    if (r.estado === 404) return sinResultado('rechazado', 'PayPal no encuentra este pago.');
    if (!ok(r) || !r.datos) throw this.fallo('consultar la orden', r);
    if (r.datos.status === 'APPROVED') return this.capturar(idExterno);
    return resultadoOrden(r.datos, true);
  }

  async cobrarConMetodo(token: string, e: DatosCobro): Promise<ResultadoPago> {
    const cuerpo = (conCredencial: boolean) => ({
      intent: 'CAPTURE',
      purchase_units: [unidadDeCompra(e.referencia, e.descripcion, e.monto, e.moneda)],
      payment_source: {
        paypal: {
          vault_id: token,
          ...(conCredencial
            ? {
                stored_credential: {
                  payment_initiator: 'MERCHANT',
                  charge_pattern: PATRON_USO,
                  usage_pattern: PATRON_USO,
                  usage: 'SUBSEQUENT',
                },
              }
            : {}),
        },
      },
    });
    const r = await this.crearOrden(
      'cobrar con el método guardado',
      cuerpo,
      idPeticion(e.claveIdempotencia),
      'stored_credential',
    );
    if (ok(r) && r.datos) {
      let orden = r.datos as OrdenPP;
      // Con la misma clave PayPal puede devolver la respuesta original: si seguía
      // pendiente, se lee el estado actual.
      const captura = primeraCaptura(orden);
      if (orden.id && (orden.status !== 'COMPLETED' || captura?.status === 'PENDING')) {
        orden = (await this.leerOrden(orden.id)) ?? orden;
      }
      if (orden.status === 'APPROVED' && orden.id) return this.capturar(orden.id);
      if (orden.status === 'PAYER_ACTION_REQUIRED') {
        return sinResultado(
          'rechazado',
          'PayPal pide que el cliente confirme este pago: no se puede cobrar de forma automática.',
        );
      }
      return resultadoOrden(orden, false);
    }
    const problemas = problemasDe(r);
    if (problemas.includes('DUPLICATE_INVOICE_ID')) {
      // Puede que un cobro anterior con esta referencia sí se hiciera: nunca se reintenta a ciegas.
      throw new Error(
        `PayPal indica que la referencia ${e.referencia} ya se usó: revisa en PayPal si ese cobro ya se hizo.`,
      );
    }
    if (tokenInvalido(r)) {
      return {
        ...sinResultado(
          'rechazado',
          'PayPal ya no acepta la cuenta guardada (se quitó o cambió). Hay que autorizarla de nuevo.',
        ),
        metodoInvalido: true,
      };
    }
    if (esRechazoConocido(r)) return sinResultado('rechazado', mensajeRechazo(problemas));
    throw this.fallo('cobrar con el método guardado', r);
  }

  async reembolsar(
    idCobro: string,
    monto: string,
    moneda: Moneda,
    claveIdempotencia: string,
  ): Promise<ResultadoReembolso> {
    const r = await this.pedir<ReembolsoPP>(
      'devolver el cobro',
      'POST',
      `/v2/payments/captures/${encodeURIComponent(idCobro)}/refund`,
      {
        cuerpo: JSON.stringify({
          amount: { value: D(monto).toFixed(2), currency_code: moneda },
          note_to_payer: 'Devolución de NV Streaming',
        }),
        idPeticion: idPeticion(claveIdempotencia),
      },
    );
    if (ok(r) && r.datos) {
      const id = texto(r.datos.id);
      switch (r.datos.status) {
        case 'COMPLETED':
          return { estado: 'completado', idReembolso: id };
        case 'PENDING':
          return { estado: 'pendiente', idReembolso: id };
        default:
          return {
            estado: 'fallido',
            idReembolso: id,
            mensaje: `PayPal no completó la devolución (${codigo(r.datos.status_details?.reason ?? r.datos.status) || 'sin motivo'}).`,
          };
      }
    }
    if (r.estado === 404) {
      return { estado: 'fallido', idReembolso: null, mensaje: 'PayPal no encuentra ese cobro.' };
    }
    if (esRechazoConocido(r)) {
      return { estado: 'fallido', idReembolso: null, mensaje: mensajeReembolso(problemasDe(r)) };
    }
    throw this.fallo('devolver el cobro', r);
  }

  /**
   * Verifica con PayPal (`verify-webhook-signature`) usando las cabeceras de la
   * transmisión y `PAYPAL_WEBHOOK_ID`. El evento viaja tal como llegó (sin volver a
   * serializarlo), porque la firma cubre los bytes exactos.
   */
  async verificarWebhook(
    cabeceras: Record<string, string | string[] | undefined>,
    cuerpoCrudo: Buffer,
  ): Promise<VerificacionWebhook> {
    if (!this.configurada()) return { valido: false };
    const valores: Record<string, string> = {};
    for (const [campo, cabecera] of Object.entries(CABECERAS_WEBHOOK)) {
      const v = cabeceras[cabecera];
      const valor = Array.isArray(v) ? v[0] : v;
      if (!valor) return { valido: false };
      valores[campo] = valor;
    }
    const crudo = cuerpoCrudo.toString('utf8');
    let evento: EventoPP;
    try {
      evento = JSON.parse(crudo) as EventoPP;
    } catch {
      return { valido: false };
    }
    if (!evento || typeof evento !== 'object' || !texto(evento.id)) return { valido: false };
    const cabeza = JSON.stringify({ ...valores, webhook_id: this.entorno.PAYPAL_WEBHOOK_ID });
    const r = await this.pedir<{ verification_status?: string }>(
      'verificar el webhook',
      'POST',
      '/v1/notifications/verify-webhook-signature',
      { cuerpo: `${cabeza.slice(0, -1)},"webhook_event":${crudo}}` },
    );
    if (r.estado === 400 || r.estado === 422) return { valido: false };
    if (!ok(r)) throw this.fallo('verificar el webhook', r);
    if (r.datos?.verification_status !== 'SUCCESS') return { valido: false };
    return { valido: true, evento: normalizarEventoPaypal(evento) };
  }

  async revocarMetodo(token: string): Promise<void> {
    const r = await this.pedir(
      'borrar la cuenta guardada',
      'DELETE',
      `/v3/vault/payment-tokens/${encodeURIComponent(token)}`,
    );
    // 404: ya no existe en PayPal, que es lo que se quería.
    if (!ok(r) && r.estado !== 404) throw this.fallo('borrar la cuenta guardada', r);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  /** Captura una orden aprobada. El `PayPal-Request-Id` es fijo por orden: nunca cobra dos veces. */
  private async capturar(idOrden: string): Promise<ResultadoPago> {
    const r = await this.pedir<OrdenPP>(
      'capturar la orden',
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(idOrden)}/capture`,
      { cuerpo: '{}', idPeticion: idPeticion(`captura-${idOrden}`) },
    );
    if (ok(r) && r.datos) return resultadoOrden(r.datos, true);
    const problemas = problemasDe(r);
    if (problemas.includes('ORDER_ALREADY_CAPTURED')) {
      const orden = await this.leerOrden(idOrden);
      if (orden) return resultadoOrden(orden, true);
    }
    if (r.estado === 404) return sinResultado('rechazado', 'PayPal no encuentra este pago.');
    if (problemas.includes('ORDER_NOT_APPROVED') || problemas.includes('PAYER_ACTION_REQUIRED')) {
      return sinResultado('pendiente');
    }
    if (esRechazoConocido(r)) return sinResultado('rechazado', mensajeRechazo(problemas));
    throw this.fallo('capturar la orden', r);
  }

  private async leerOrden(idOrden: string): Promise<OrdenPP | null> {
    const r = await this.pedir<OrdenPP>(
      'consultar la orden',
      'GET',
      `/v2/checkout/orders/${encodeURIComponent(idOrden)}`,
    );
    if (r.estado === 404) return null;
    if (!ok(r)) throw this.fallo('consultar la orden', r);
    return r.datos;
  }

  /**
   * Crea una orden. Si PayPal rechaza un campo opcional cuyo formato no pudimos
   * confirmar (idioma, credencial guardada), repite una vez sin él con otra clave
   * fija: el primer intento no creó nada.
   */
  private async crearOrden(
    operacion: string,
    cuerpo: (completo: boolean) => unknown,
    id: string,
    campoOpcional: string,
  ): Promise<Respuesta<unknown>> {
    const ruta = '/v2/checkout/orders';
    const r = await this.pedir(operacion, 'POST', ruta, {
      cuerpo: JSON.stringify(cuerpo(true)),
      idPeticion: id,
    });
    const campoRechazado =
      (r.estado === 400 || r.estado === 422) &&
      ((r.datos as ErrorPP | null)?.details ?? []).some((d) => d.field?.includes(campoOpcional));
    if (!campoRechazado) return r;
    this.logger.warn(`PayPal no aceptó "${campoOpcional}" al ${operacion}: se repite sin él.`);
    return this.pedir(operacion, 'POST', ruta, {
      cuerpo: JSON.stringify(cuerpo(false)),
      idPeticion: `${id}-b`.slice(0, 108),
    });
  }

  /** Llamada autenticada. Con 401 renueva el token una vez (misma clave: es seguro repetir). */
  private async pedir<T>(
    operacion: string,
    metodo: 'GET' | 'POST' | 'DELETE',
    ruta: string,
    o: { cuerpo?: string; idPeticion?: string } = {},
  ): Promise<Respuesta<T>> {
    for (let intento = 0; ; intento++) {
      const token = await this.tokenAcceso();
      const cabeceras: Record<string, string> = {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      };
      if (o.cuerpo !== undefined) {
        cabeceras['content-type'] = 'application/json';
        cabeceras['prefer'] = 'return=representation';
      }
      if (o.idPeticion) cabeceras['paypal-request-id'] = o.idPeticion;
      const r = await this.fetchSeguro(operacion, `${this.urlBase}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        ...(o.cuerpo !== undefined ? { body: o.cuerpo } : {}),
      });
      if (r.status === 401 && intento === 0) {
        await r.body?.cancel().catch(() => undefined);
        this.token = null;
        continue;
      }
      return { estado: r.status, datos: await leerJson<T>(r) };
    }
  }

  /** Token OAuth2 (client credentials), en memoria hasta poco antes de vencer. */
  private async tokenAcceso(): Promise<string> {
    if (this.token && this.token.venceEn > Date.now()) return this.token.valor;
    this.pidiendoToken ??= this.pedirToken().finally(() => {
      this.pidiendoToken = null;
    });
    return this.pidiendoToken;
  }

  private async pedirToken(): Promise<string> {
    if (!this.configurada()) {
      throw new Error(
        'PayPal no está configurado: faltan PAYPAL_CLIENTE_ID, PAYPAL_SECRETO o PAYPAL_WEBHOOK_ID.',
      );
    }
    const credenciales = Buffer.from(
      `${this.entorno.PAYPAL_CLIENTE_ID}:${this.entorno.PAYPAL_SECRETO}`,
    ).toString('base64');
    const r = await this.fetchSeguro(
      'pedir el token de acceso',
      `${this.urlBase}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${credenciales}`,
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
    );
    const datos = await leerJson<{ access_token?: unknown; expires_in?: unknown }>(r);
    if (r.status === 401 || r.status === 400) {
      throw new Error(
        'PayPal rechazó las credenciales: revisa PAYPAL_CLIENTE_ID, PAYPAL_SECRETO y PAYPAL_MODO.',
      );
    }
    const valor = texto(datos?.access_token);
    if (!r.ok || !valor) {
      throw new Error(`PayPal respondió ${r.status} al pedir el token de acceso.`);
    }
    const vida = Number(datos?.expires_in) > 0 ? Number(datos?.expires_in) : 600;
    this.token = {
      valor,
      venceEn: Date.now() + Math.max(vida - MARGEN_TOKEN_S, vida / 2) * 1000,
    };
    return valor;
  }

  private async fetchSeguro(operacion: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(this.tiempoLimiteMs),
      });
    } catch (e) {
      const tiempo = e instanceof Error && e.name === 'TimeoutError';
      throw new Error(
        tiempo
          ? `PayPal no respondió a tiempo al ${operacion} (${Math.round(this.tiempoLimiteMs / 1000)} s).`
          : `No se pudo conectar con PayPal al ${operacion}.`,
      );
    }
  }

  /** Error técnico (para registros y reintentos): solo códigos de PayPal, nunca datos. */
  private fallo(operacion: string, r: Respuesta<unknown>): Error {
    const e = r.datos as ErrorPP | null;
    const codigos = [codigo(e?.name), ...problemasDe(r)].filter(Boolean);
    const debug = codigo(e?.debug_id);
    return new Error(
      `PayPal respondió ${r.estado} al ${operacion}${codigos.length ? ` (${[...new Set(codigos)].join(', ')})` : ''}${debug ? ` · debug_id ${debug}` : ''}.`.slice(
        0,
        500,
      ),
    );
  }
}

// ── Funciones puras ─────────────────────────────────────────────────────────

/** La compra: la referencia de NV va como reference_id, custom_id e invoice_id. */
function unidadDeCompra(referencia: string, descripcion: string, monto: string, moneda: Moneda) {
  return {
    reference_id: referencia,
    custom_id: referencia,
    invoice_id: referencia,
    description: descripcion.slice(0, 127),
    amount: { currency_code: moneda, value: D(monto).toFixed(2) },
  };
}

/** `PayPal-Request-Id` estable a partir de una clave de NV (máx. 108 caracteres). */
function idPeticion(clave: string): string {
  const limpia = `nv-${clave}`.replace(/[^A-Za-z0-9_-]/g, '-');
  return limpia.length <= 100 ? limpia : `nv-${createHash('sha256').update(clave).digest('hex')}`;
}

/** Solo códigos en mayúsculas de PayPal (INSTRUMENT_DECLINED…), nunca texto libre. */
function codigo(v: unknown): string {
  return typeof v === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(v) ? v : '';
}

function problemasDe(r: Respuesta<unknown>): string[] {
  const detalles = (r.datos as ErrorPP | null)?.details;
  return Array.isArray(detalles) ? detalles.map((d) => codigo(d?.issue)).filter(Boolean) : [];
}

/** 4xx con respuesta: PayPal no hizo nada y no lo hará. 401/408/409/429 y 5xx: desconocido. */
function esRechazoConocido(r: Respuesta<unknown>): boolean {
  return r.estado >= 400 && r.estado < 500 && ![401, 408, 409, 429].includes(r.estado);
}

function tokenInvalido(r: Respuesta<unknown>): boolean {
  if (r.estado === 404) return true;
  if (!esRechazoConocido(r)) return false;
  const detalles = (r.datos as ErrorPP | null)?.details ?? [];
  return detalles.some(
    (d) =>
      PROBLEMAS_TOKEN_INVALIDO.has(codigo(d?.issue)) ||
      (typeof d?.field === 'string' && d.field.includes('vault_id')),
  );
}

function mensajeRechazo(problemas: string[]): string {
  if (problemas.includes('ORDER_EXPIRED') || problemas.includes('ORDER_CANNOT_BE_SAVED')) {
    return 'El pago en PayPal venció. Inícialo de nuevo.';
  }
  if (problemas.includes('MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED')) {
    return 'PayPal bloqueó más intentos con esta cuenta. Prueba más tarde o paga de otra forma.';
  }
  if (problemas.includes('INSTRUMENT_DECLINED')) {
    return 'PayPal rechazó el medio de pago elegido. Inicia el pago de nuevo y elige otro en PayPal.';
  }
  return 'PayPal rechazó el pago. Prueba con otro medio de pago en PayPal o paga de otra forma.';
}

function mensajeReembolso(problemas: string[]): string {
  if (problemas.includes('CAPTURE_FULLY_REFUNDED')) return 'PayPal indica que ya se devolvió todo.';
  if (problemas.includes('REFUND_AMOUNT_EXCEEDED')) return 'La devolución supera lo cobrado.';
  if (problemas.includes('REFUND_TIME_LIMIT_EXCEEDED')) {
    return 'Pasó el plazo de PayPal para devolver este cobro.';
  }
  const cod = problemas[0];
  return `PayPal rechazó la devolución${cod ? ` (${cod})` : ''}.`;
}

function primeraCaptura(orden: OrdenPP): CapturaPP | undefined {
  return orden.purchase_units?.[0]?.payments?.captures?.[0];
}

function monedaDe(v: unknown): Moneda {
  if (typeof v === 'string' && (MONEDAS as readonly string[]).includes(v)) return v as Moneda;
  throw new Error('PayPal informó una moneda desconocida.');
}

/** "ma***@gmail.com": se ve qué cuenta es sin mostrar el correo entero. */
export function enmascararCorreo(correo: string | undefined): string {
  const [local, dominio] = (correo ?? '').split('@');
  if (!local || !dominio) return 'PayPal';
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `PayPal · ${visible}***@${dominio}`;
}

/** Resultado normalizado de una orden (y de su captura). */
function resultadoOrden(orden: OrdenPP, conMetodo: boolean): ResultadoPago {
  if (orden.status === 'VOIDED') return sinResultado('cancelado', 'El pago en PayPal se anuló.');
  const captura = primeraCaptura(orden);
  if (!captura) return sinResultado('pendiente');
  const idCobro = texto(captura.id);
  switch (captura.status) {
    case 'COMPLETED':
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED': {
      if (!idCobro || !captura.amount?.value) {
        throw new Error('PayPal completó la captura sin id o sin importe.');
      }
      const vault = orden.payment_source?.paypal?.attributes?.vault;
      const token = conMetodo && vault?.status === 'VAULTED' ? texto(vault.id) : null;
      return {
        estado: 'aprobado',
        idCobro,
        montoRecibido: D(captura.amount.value).toFixed(2),
        moneda: monedaDe(captura.amount.currency_code),
        ...(token
          ? {
              metodoGuardado: {
                token,
                descripcion: enmascararCorreo(orden.payment_source?.paypal?.email_address),
              },
            }
          : {}),
      };
    }
    case 'DECLINED':
    case 'FAILED':
      return {
        ...sinResultado('rechazado', 'PayPal rechazó el pago.'),
        idCobro,
      };
    default:
      // PENDING (revisión de PayPal, eCheck…): llegará PAYMENT.CAPTURE.COMPLETED.
      return { ...sinResultado('pendiente'), idCobro };
  }
}

function sinResultado(estado: ResultadoPago['estado'], mensaje?: string): ResultadoPago {
  return {
    estado,
    idCobro: null,
    montoRecibido: null,
    moneda: null,
    ...(mensaje ? { mensaje } : {}),
  };
}

async function leerJson<T>(r: Response): Promise<T | null> {
  if (r.status === 204) return null;
  return (await r.json().catch(() => null)) as T | null;
}

/** Quita lo que identifica la cuenta o el token (payment_source, vault, customer…). */
function limpiarRecurso(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 8) return '[…]';
  if (Array.isArray(valor)) return valor.map((v) => limpiarRecurso(v, profundidad + 1));
  if (valor && typeof valor === 'object') {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      r[k] = /^(payment_source|vault|customer|account_id|payer_id)$/i.test(k)
        ? '[redactado]'
        : limpiarRecurso(v, profundidad + 1);
    }
    return r;
  }
  return valor;
}

/** Evento de PayPal → evento normalizado para el núcleo (con la carga sin datos personales). */
export function normalizarEventoPaypal(evento: EventoPP): EventoWebhook {
  const tipo = texto(evento.event_type) ?? 'desconocido';
  const recurso = evento.resource ?? {};
  const idRecurso = texto(recurso.id);
  const esToken = tipo.startsWith('VAULT.') || evento.resource_type === 'payment_token';
  let normal: TipoEventoNormalizado = EVENTOS[tipo] ?? 'otro';
  // Una devolución que aún no terminó no se da por completada.
  if (normal === 'reembolso_completado' && recurso.status && recurso.status !== 'COMPLETED') {
    normal = 'otro';
  }
  const idOrden = texto(recurso.supplementary_data?.related_ids?.order_id);
  const esCaptura = tipo.startsWith('PAYMENT.CAPTURE.') && tipo !== 'PAYMENT.CAPTURE.REFUNDED';
  const limpio = limpiarRecurso(evento) as Record<string, unknown>;
  if (esToken) {
    // El token nunca se guarda en claro: ni como recurso ni en la carga (tampoco en enlaces).
    limpio['resource'] = { id: '[token]' };
  }
  return {
    idEvento: String(evento.id).slice(0, 160),
    tipo: tipo.slice(0, 120),
    idRecurso: esToken ? null : idRecurso,
    normalizado: {
      tipo: normal,
      idExterno: tipo.startsWith('CHECKOUT.ORDER.') ? idRecurso : esCaptura ? idOrden : null,
      idCobro: esCaptura ? idRecurso : null,
      idReembolso: tipo === 'PAYMENT.CAPTURE.REFUNDED' ? idRecurso : null,
      token: normal === 'metodo_revocado' ? idRecurso : null,
    },
    carga: redactarCarga(limpio) as Record<string, unknown>,
  };
}
