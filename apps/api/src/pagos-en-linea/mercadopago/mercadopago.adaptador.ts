import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Moneda, MONEDAS } from '@nv/shared';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { D } from '../../dinero/dinero.js';
import {
  type AdaptadorPasarela,
  type DatosCrearPago,
  type EventoWebhook,
  redactarCarga,
  type ResultadoPago,
  type ResultadoReembolso,
  type VerificacionWebhook,
} from '../adaptador.js';

/** API REST oficial de Mercado Pago (la misma para credenciales de prueba y de producción). */
export const URL_API_MERCADOPAGO = 'https://api.mercadopago.com';
/** Cabeceras de la firma de los webhooks. */
export const CABECERA_FIRMA_MP = 'x-signature';
export const CABECERA_PETICION_MP = 'x-request-id';
/** Un aviso firmado hace más de esto se rechaza (repetición). */
const TOLERANCIA_FIRMA_S = 600;
/** Tiempo máximo de cada llamada a la API. */
const TIEMPO_LIMITE_MS = 15_000;
/** La preferencia vence con el intento de NV (MINUTOS_INTENTO en intentos.service). */
const MINUTOS_PREFERENCIA = 120;

/** Pago de Mercado Pago (`GET /v1/payments/{id}`): solo los campos que usamos. */
export interface PagoMercadoPago {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  currency_id?: string;
  date_created?: string;
  date_approved?: string | null;
  refunds?: { id: number | string; status?: string; amount?: number; date_created?: string }[];
}

type Respuesta = { estado: number; cuerpo: unknown };

/** Aprobado: el dinero llegó (en mediación = aprobado con un reclamo abierto). */
const APROBADOS = new Set(['approved', 'in_mediation']);
/** Todavía puede aprobarse (revisión, pago en efectivo, autorizado sin capturar). */
const PENDIENTES = new Set(['pending', 'in_process', 'authorized']);

/** Motivos de rechazo de tarjeta (status_detail) en palabras del cliente. */
const MOTIVOS_RECHAZO: Record<string, string> = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene fondos suficientes.',
  cc_rejected_bad_filled_card_number: 'Revisa el número de la tarjeta.',
  cc_rejected_bad_filled_date: 'Revisa la fecha de vencimiento de la tarjeta.',
  cc_rejected_bad_filled_security_code: 'Revisa el código de seguridad de la tarjeta.',
  cc_rejected_bad_filled_other: 'Revisa los datos de la tarjeta.',
  cc_rejected_call_for_authorize: 'Tu banco debe autorizar el pago. Llámalo y vuelve a intentarlo.',
  cc_rejected_card_disabled: 'La tarjeta no está activa. Llama a tu banco o usa otra.',
  cc_rejected_duplicated_payment: 'Ya hiciste un pago por el mismo importe. Usa otro medio.',
  cc_rejected_high_risk: 'Mercado Pago no aprobó el pago. Usa otro medio de pago.',
  cc_rejected_max_attempts: 'Superaste los intentos permitidos. Usa otra tarjeta.',
  cc_rejected_blacklist: 'Mercado Pago no aprobó el pago. Usa otro medio de pago.',
  cc_rejected_other_reason: 'Tu banco rechazó el pago. Usa otro medio de pago.',
};

const esIdPago = (v: string | undefined): v is string =>
  typeof v === 'string' && /^\d{1,20}$/.test(v);
const esMoneda = (v: unknown): v is Moneda =>
  typeof v === 'string' && (MONEDAS as readonly string[]).includes(v);
const comoObjeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const fecha = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0);

/** Clave de idempotencia aceptable como cabecera (la misma entrada da siempre la misma clave). */
function claveCabecera(clave: string): string {
  if (/^[\w:.-]{1,64}$/.test(clave)) return clave;
  return `nv-${createHmac('sha256', 'nv:mp:idempotencia').update(clave).digest('hex').slice(0, 48)}`;
}

/** Resumen seguro de una respuesta de error: estado y códigos, nunca el cuerpo (puede traer datos). */
function describirError(r: Respuesta): string {
  const c = comoObjeto(r.cuerpo);
  const codigos = [texto(c['error'])];
  if (Array.isArray(c['cause'])) {
    for (const x of c['cause'].slice(0, 3)) codigos.push(texto(comoObjeto(x)['code']));
  }
  const detalle = codigos
    .filter((v): v is string => v !== null)
    .map((v) => v.replace(/[^\w.-]/g, '').slice(0, 60))
    .filter(Boolean)
    .join(', ');
  return detalle ? `${r.estado}: ${detalle}` : String(r.estado);
}

/**
 * Mercado Pago con Checkout Pro (pago único alojado por Mercado Pago).
 *
 * - `crearPago` crea una preferencia (`POST /checkout/preferences`) con nuestra
 *   referencia como `external_reference` y manda al cliente a su `init_point`.
 *   El `idExterno` del intento es esa referencia: el pago que llega por webhook
 *   la trae y así se encuentra el intento sin llamadas extra.
 * - El retorno y las consultas nunca confían en los parámetros de la URL: se
 *   lee el pago (`GET /v1/payments/{id}`) y se buscan los pagos de la referencia
 *   (`GET /v1/payments/search?external_reference=`).
 * - Sin cobros automáticos (ver INFO_PASARELA): `guardarMetodo` se ignora y
 *   `cobrarConMetodo` siempre rechaza e invalida el método.
 * - Una cuenta opera en un solo país: solo se cobra en `MERCADOPAGO_MONEDA`.
 */
@Injectable()
export class AdaptadorMercadoPago implements AdaptadorPasarela {
  readonly pasarela = 'mercadopago' as const;
  readonly modo: 'pruebas' | 'produccion';
  /** Tiempo máximo por llamada (las pruebas lo acortan). */
  tiempoLimiteMs = TIEMPO_LIMITE_MS;
  private readonly logger = new Logger('MercadoPago');
  private readonly base: string;

  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {
    this.modo = entorno.MERCADOPAGO_MODO;
    this.base = (entorno.MERCADOPAGO_API_URL || URL_API_MERCADOPAGO).replace(/\/+$/, '');
    if (entorno.MERCADOPAGO_TOKEN_ACCESO && !entorno.MERCADOPAGO_MONEDA) {
      this.logger.warn(
        'Mercado Pago tiene token pero falta MERCADOPAGO_MONEDA (ARS, COP o PEN): no se ofrecerá.',
      );
    }
  }

  /** Moneda de la cuenta (un solo país por cuenta). */
  get moneda(): Moneda | null {
    return this.entorno.MERCADOPAGO_MONEDA ?? null;
  }

  /** Una cuenta cobra solo en la moneda de su país. */
  monedasCuenta(): readonly Moneda[] {
    return this.moneda ? [this.moneda] : [];
  }

  configurada(): boolean {
    return Boolean(
      this.entorno.MERCADOPAGO_TOKEN_ACCESO &&
      this.entorno.MERCADOPAGO_SECRETO_WEBHOOK &&
      this.entorno.MERCADOPAGO_MONEDA,
    );
  }

  async crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }> {
    if (e.moneda !== this.moneda) {
      throw new Error(
        `La cuenta de Mercado Pago cobra en ${this.moneda ?? '(sin configurar)'}; no puede crear un pago en ${e.moneda}.`,
      );
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(e.monto) || !D(e.monto).gt(0)) {
      throw new Error('Importe no válido para Mercado Pago.');
    }
    const ahora = new Date();
    const vence = new Date(ahora.getTime() + MINUTOS_PREFERENCIA * 60_000);
    // guardarMetodo se ignora: Mercado Pago no admite cobros automáticos aquí.
    const preferencia = {
      items: [
        {
          id: e.referencia,
          title: e.descripcion.slice(0, 250),
          quantity: 1,
          unit_price: D(e.monto).toNumber(),
          currency_id: e.moneda,
        },
      ],
      external_reference: e.referencia,
      back_urls: {
        success: e.urlRetorno,
        pending: e.urlRetorno,
        // El núcleo consulta el pago antes de dar el intento por cancelado.
        failure: e.urlCancelacion,
      },
      auto_return: 'approved',
      // Efectivo y cajeros quedan pendientes días: no caben en la vida de un intento.
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
      expires: true,
      expiration_date_from: ahora.toISOString(),
      expiration_date_to: vence.toISOString(),
      metadata: { intento: e.idInterno },
    };
    const r = await this.llamar('POST', '/checkout/preferences', {
      cuerpo: preferencia,
      idempotencia: `nv-pref-${e.idInterno}`,
    });
    if (r.estado >= 400) {
      throw new Error(`Mercado Pago no creó la preferencia (${describirError(r)}).`);
    }
    const c = comoObjeto(r.cuerpo);
    const produccion = texto(c['init_point']);
    const pruebas = texto(c['sandbox_init_point']);
    const url = this.modo === 'pruebas' ? (pruebas ?? produccion) : produccion;
    if (!texto(c['id']) || !url || !/^https:\/\//i.test(url)) {
      throw new Error('Mercado Pago creó la preferencia sin un enlace de pago válido.');
    }
    return { idExterno: e.referencia, urlPago: url };
  }

  /**
   * El cliente vuelve con `payment_id`, `status`, `external_reference`… Los
   * parámetros solo sirven para leer ese pago en la API (la búsqueda puede tardar
   * unos segundos en incluirlo); el estado siempre sale de Mercado Pago.
   */
  async confirmarRetorno(
    idExterno: string,
    parametros: Record<string, string>,
  ): Promise<ResultadoPago> {
    const idPago = parametros['payment_id'] ?? parametros['collection_id'];
    let delRetorno: PagoMercadoPago | null = null;
    if (esIdPago(idPago)) {
      const p = await this.obtenerPago(idPago);
      // Un payment_id de otra referencia (manipulado o de otro intento) se ignora.
      if (p && p.external_reference === idExterno) delRetorno = p;
    }
    const pagos = await this.buscarPagos(idExterno);
    if (delRetorno && !pagos.some((p) => String(p.id) === String(delRetorno.id))) {
      pagos.push(delRetorno);
    }
    return this.resultadoDePagos(pagos);
  }

  async consultarPago(idExterno: string): Promise<ResultadoPago> {
    return this.resultadoDePagos(await this.buscarPagos(idExterno));
  }

  /** Sin cobros automáticos con Mercado Pago: un método guardado nunca sirve. */
  async cobrarConMetodo(): Promise<ResultadoPago> {
    return {
      ...this.sinResultado(
        'rechazado',
        'Mercado Pago no admite cobros automáticos. Paga la factura en línea.',
      ),
      metodoInvalido: true,
    };
  }

  async reembolsar(
    idCobro: string,
    monto: string,
    moneda: Moneda,
    claveIdempotencia: string,
  ): Promise<ResultadoReembolso> {
    const fallido = (mensaje: string): ResultadoReembolso => ({
      estado: 'fallido',
      idReembolso: null,
      mensaje,
    });
    if (!esIdPago(idCobro)) return fallido('Mercado Pago no conoce ese cobro.');
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(monto) || !D(monto).gt(0)) {
      return fallido('El importe de la devolución no es válido.');
    }
    const pago = await this.obtenerPago(idCobro);
    if (!pago) return fallido('Mercado Pago no encuentra ese cobro.');
    if (pago.currency_id !== moneda) return fallido('La moneda no coincide con la del cobro.');
    // Total = el importe completo del cobro: se pide sin cuerpo. Depende solo del cobro
    // original, así un reintento con la misma clave manda exactamente la misma petición.
    const total =
      typeof pago.transaction_amount === 'number' &&
      D(monto).eq(D(String(pago.transaction_amount)));
    const r = await this.llamar('POST', `/v1/payments/${idCobro}/refunds`, {
      cuerpo: total ? {} : { amount: D(monto).toNumber() },
      idempotencia: claveIdempotencia,
    });
    if (r.estado >= 400) {
      return fallido(`Mercado Pago rechazó la devolución (${describirError(r)}).`);
    }
    const c = comoObjeto(r.cuerpo);
    const id = texto(c['id']);
    const estado = texto(c['status']);
    if (estado === 'approved') return { estado: 'completado', idReembolso: id };
    if (estado === 'rejected' || estado === 'cancelled') {
      return {
        estado: 'fallido',
        idReembolso: id,
        mensaje: 'Mercado Pago rechazó la devolución.',
      };
    }
    // in_process, authorized, pending: llegará un aviso cuando se complete.
    return { estado: 'pendiente', idReembolso: id };
  }

  /**
   * Firma de Mercado Pago: `x-signature: ts=<marca>,v1=<hmac hex>` con
   * HMAC-SHA256(secreto, `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
   * Solo los avisos de pagos se normalizan, leyendo el pago en la API.
   */
  async verificarWebhook(
    cabeceras: Record<string, string | string[] | undefined>,
    cuerpoCrudo: Buffer,
  ): Promise<VerificacionWebhook> {
    const secreto = this.entorno.MERCADOPAGO_SECRETO_WEBHOOK;
    const firma = cabecera(cabeceras, CABECERA_FIRMA_MP);
    if (!secreto || !firma) return { valido: false };
    const partes = new Map(
      firma.split(',').map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
      }),
    );
    const ts = partes.get('ts') ?? '';
    const v1 = partes.get('v1') ?? '';
    if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return { valido: false };
    // Mercado Pago documenta la marca en segundos; algunos ejemplos la dan en milisegundos.
    const segundos = Number(ts) > 1e11 ? Number(ts) / 1000 : Number(ts);
    if (Math.abs(Date.now() / 1000 - segundos) > TOLERANCIA_FIRMA_S) return { valido: false };

    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = comoObjeto(JSON.parse(cuerpoCrudo.toString('utf8')));
    } catch {
      return { valido: false };
    }
    const idDato = texto(comoObjeto(cuerpo['data'])['id']);
    const idPeticion = cabecera(cabeceras, CABECERA_PETICION_MP);
    // Lo que falte en el aviso se quita del manifiesto (así lo documenta Mercado Pago).
    let manifiesto = '';
    if (idDato) manifiesto += `id:${/^[a-z0-9]+$/i.test(idDato) ? idDato.toLowerCase() : idDato};`;
    if (idPeticion) manifiesto += `request-id:${idPeticion};`;
    manifiesto += `ts:${ts};`;
    const esperada = createHmac('sha256', secreto).update(manifiesto).digest();
    const recibida = Buffer.from(v1, 'hex');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      return { valido: false };
    }

    const tipoMp = texto(cuerpo['type']) ?? texto(cuerpo['topic']) ?? 'desconocido';
    const accion = texto(cuerpo['action']);
    const idEvento =
      texto(cuerpo['id']) ??
      `${tipoMp}:${accion ?? '-'}:${idDato ?? '-'}:${texto(cuerpo['date_created']) ?? ts}`;
    let normalizado: EventoWebhook['normalizado'] = { tipo: 'otro' };
    let resumenPago: Record<string, unknown> | null = null;
    if (tipoMp === 'payment' && esIdPago(idDato ?? undefined)) {
      // Sin respuesta de la API se lanza: el núcleo responde 500 y Mercado Pago reintenta.
      const pago = await this.obtenerPago(idDato!);
      if (pago) {
        normalizado = this.normalizarPago(pago);
        resumenPago = { status: pago.status ?? null, status_detail: pago.status_detail ?? null };
      }
    }
    return {
      valido: true,
      evento: {
        idEvento: idEvento.slice(0, 160),
        tipo: (accion ?? tipoMp).slice(0, 120),
        idRecurso: idDato,
        normalizado,
        carga: redactarCarga({
          ...cuerpo,
          ...(resumenPago ? { _pago: resumenPago } : {}),
        }) as Record<string, unknown>,
      },
    };
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  /** Qué significa un pago para el núcleo (el núcleo vuelve a consultar antes de aplicar). */
  private normalizarPago(p: PagoMercadoPago): EventoWebhook['normalizado'] {
    const base = { idExterno: p.external_reference ?? null, idCobro: String(p.id) };
    const devoluciones = (p.refunds ?? [])
      .filter((r) => r.status === 'approved')
      .sort((a, b) => fecha(b.date_created) - fecha(a.date_created));
    if (devoluciones[0] && (p.status === 'refunded' || p.status_detail === 'partially_refunded')) {
      return { tipo: 'reembolso_completado', ...base, idReembolso: String(devoluciones[0].id) };
    }
    if (p.status && APROBADOS.has(p.status)) return { tipo: 'pago_aprobado', ...base };
    if (p.status === 'rejected' || p.status === 'cancelled') {
      return { tipo: 'pago_rechazado', ...base };
    }
    return { tipo: 'otro', ...base };
  }

  /**
   * Varios pagos de una misma preferencia (p. ej. un rechazo y luego un reintento
   * aprobado): gana el primero aprobado; si no hay, sigue pendiente mientras alguno
   * pueda aprobarse o no haya ninguno; si no, vale el último.
   */
  private resultadoDePagos(pagos: PagoMercadoPago[]): ResultadoPago {
    const aprobados = pagos
      .filter((p) => p.status && APROBADOS.has(p.status))
      .sort(
        (a, b) =>
          fecha(a.date_approved ?? a.date_created) - fecha(b.date_approved ?? b.date_created),
      );
    if (aprobados[0]) return this.resultadoPago(aprobados[0]);
    if (pagos.length === 0 || pagos.some((p) => p.status && PENDIENTES.has(p.status))) {
      return this.sinResultado('pendiente');
    }
    const ultimo = [...pagos].sort((a, b) => fecha(b.date_created) - fecha(a.date_created))[0]!;
    return this.resultadoPago(ultimo);
  }

  private resultadoPago(p: PagoMercadoPago): ResultadoPago {
    const estado = p.status ?? '';
    if (APROBADOS.has(estado)) {
      if (typeof p.transaction_amount !== 'number' || !Number.isFinite(p.transaction_amount)) {
        throw new Error(`Mercado Pago informó el pago ${p.id} aprobado sin importe.`);
      }
      if (!esMoneda(p.currency_id)) {
        throw new Error(`Mercado Pago informó el pago ${p.id} en una moneda desconocida.`);
      }
      return {
        estado: 'aprobado',
        idCobro: String(p.id),
        montoRecibido: D(String(p.transaction_amount)).toFixed(2),
        moneda: p.currency_id,
      };
    }
    if (estado === 'rejected') {
      return this.sinResultado(
        'rechazado',
        MOTIVOS_RECHAZO[p.status_detail ?? ''] ?? 'Mercado Pago rechazó el pago.',
      );
    }
    if (estado === 'cancelled') {
      return this.sinResultado('cancelado', 'El pago se canceló en Mercado Pago.');
    }
    if (estado === 'refunded' || estado === 'charged_back') {
      return this.sinResultado('cancelado', 'Mercado Pago devolvió este pago.');
    }
    return this.sinResultado('pendiente');
  }

  /** Un pago por id; null si Mercado Pago no lo conoce. */
  private async obtenerPago(id: string): Promise<PagoMercadoPago | null> {
    const r = await this.llamar('GET', `/v1/payments/${id}`);
    if (r.estado === 404 || r.estado === 400) return null;
    if (r.estado >= 400)
      throw new Error(`Mercado Pago no devolvió el pago (${describirError(r)}).`);
    const p = comoObjeto(r.cuerpo) as unknown as PagoMercadoPago;
    return texto(p.id) ? p : null;
  }

  /** Pagos cuya external_reference es exactamente la referencia del intento. */
  private async buscarPagos(referencia: string): Promise<PagoMercadoPago[]> {
    const q = new URLSearchParams({
      external_reference: referencia,
      sort: 'date_created',
      criteria: 'desc',
      limit: '50',
    });
    const r = await this.llamar('GET', `/v1/payments/search?${q.toString()}`);
    if (r.estado >= 400) {
      throw new Error(`Mercado Pago no pudo buscar los pagos (${describirError(r)}).`);
    }
    const resultados = comoObjeto(r.cuerpo)['results'];
    if (!Array.isArray(resultados)) return [];
    return resultados
      .map((x) => comoObjeto(x) as unknown as PagoMercadoPago)
      .filter((p) => texto(p.id) && p.external_reference === referencia);
  }

  /**
   * Llama a la API. Lanza (el núcleo reintenta con la misma clave) ante red, tiempo
   * agotado, 5xx, 429 o token rechazado; devuelve el resto para que cada operación
   * decida. Los errores nunca incluyen el token ni el cuerpo de la respuesta.
   */
  private async llamar(
    metodo: 'GET' | 'POST',
    ruta: string,
    o: { cuerpo?: unknown; idempotencia?: string } = {},
  ): Promise<Respuesta> {
    const donde = `${metodo} ${ruta.split('?')[0]}`;
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${this.entorno.MERCADOPAGO_TOKEN_ACCESO}`,
      Accept: 'application/json',
    };
    if (o.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (o.idempotencia) cabeceras['X-Idempotency-Key'] = claveCabecera(o.idempotencia);
    let estado: number;
    let crudo: string;
    try {
      const res = await fetch(`${this.base}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        ...(o.cuerpo !== undefined ? { body: JSON.stringify(o.cuerpo) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(this.tiempoLimiteMs),
      });
      estado = res.status;
      crudo = await res.text();
    } catch (err) {
      const nombre = err instanceof Error ? err.name : '';
      throw new Error(
        nombre === 'TimeoutError' || nombre === 'AbortError'
          ? `Mercado Pago no respondió a tiempo (${donde}).`
          : `No se pudo conectar con Mercado Pago (${donde}).`,
      );
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = crudo ? JSON.parse(crudo) : null;
    } catch {
      cuerpo = null;
    }
    if (estado === 401) {
      throw new Error(
        `Mercado Pago rechazó el token de acceso (${donde}). Revisa MERCADOPAGO_TOKEN_ACCESO.`,
      );
    }
    if (estado >= 500 || estado === 429) {
      throw new Error(`Mercado Pago respondió ${estado} (${donde}); se reintentará.`);
    }
    return { estado, cuerpo };
  }

  private sinResultado(estado: ResultadoPago['estado'], mensaje?: string): ResultadoPago {
    return {
      estado,
      idCobro: null,
      montoRecibido: null,
      moneda: null,
      ...(mensaje ? { mensaje } : {}),
    };
  }
}

function cabecera(
  cabeceras: Record<string, string | string[] | undefined>,
  nombre: string,
): string | null {
  const v = cabeceras[nombre] ?? cabeceras[nombre.toLowerCase()];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}
