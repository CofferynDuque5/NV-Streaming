import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Entorno } from '../../src/config/entorno.js';
import type { DatosCobro, DatosCrearPago } from '../../src/pagos-en-linea/adaptador.js';
import {
  AdaptadorPaypal,
  enmascararCorreo,
} from '../../src/pagos-en-linea/paypal/paypal.adaptador.js';

const CLIENTE_ID = 'cliente-id-de-prueba';
const SECRETO = 'secreto-muy-secreto-123';
const WEBHOOK_ID = 'WH-ID-123';
const CORREO = 'maria.perez@gmail.com';
const FIRMA_BUENA = 'firma-valida';

interface Peticion {
  metodo: string;
  ruta: string;
  cabeceras: IncomingMessage['headers'];
  cuerpo: string;
}
interface Captura {
  id: string;
  status: string;
  amount: { currency_code: string; value: string };
}
interface Orden {
  id: string;
  status: string;
  cuerpo: any;
  capturas: Captura[];
  vaultId: string | null;
  claveCaptura: string | null;
  respuestaCaptura: any;
}

/**
 * PayPal falso: imita las formas documentadas de OAuth2, Orders v2, Payments v2,
 * Vault v3 y verify-webhook-signature. Guarda las respuestas por PayPal-Request-Id
 * como PayPal (la misma clave devuelve la misma respuesta).
 */
class PaypalFalso {
  servidor!: Server;
  url = '';
  peticiones: Peticion[] = [];
  ordenes = new Map<string, Orden>();
  porClave = new Map<string, { estado: number; cuerpo: unknown }>();
  tokensVault = new Set<string>(['vault-vivo']);
  reembolsos = 0;
  tokensEmitidos = 0;
  vidaToken = 32400;
  /** Ganchos para forzar respuestas: la ruta devuelve [estado, cuerpo] o 'colgar'. */
  forzar: ((p: Peticion) => [number, unknown] | 'colgar' | null) | null = null;
  private n = 0;

  async iniciar() {
    this.servidor = createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c: Buffer) => (cuerpo += c.toString('utf8')));
      req.on('end', () => this.atender(req, res, cuerpo));
    });
    await new Promise<void>((r) => this.servidor.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
  }

  reiniciar() {
    this.peticiones = [];
    this.ordenes.clear();
    this.porClave.clear();
    this.tokensVault = new Set(['vault-vivo']);
    this.tokensEmitidos = 0;
    this.reembolsos = 0;
    this.vidaToken = 32400;
    this.forzar = null;
  }

  /** El cliente aprueba la orden en la página de PayPal. */
  aprobar(id: string) {
    this.ordenes.get(id)!.status = 'APPROVED';
  }

  rutas(prefijo: string) {
    return this.peticiones.filter((p) => p.ruta.startsWith(prefijo));
  }

  private id(prefijo: string) {
    this.n += 1;
    return `${prefijo}${String(this.n).padStart(6, '0')}`;
  }

  private atender(req: IncomingMessage, res: ServerResponse, cuerpo: string) {
    const p: Peticion = {
      metodo: req.method ?? '',
      ruta: req.url ?? '',
      cabeceras: req.headers,
      cuerpo,
    };
    this.peticiones.push(p);
    const enviar = (estado: number, datos?: unknown) => {
      res.writeHead(estado, { 'content-type': 'application/json' });
      res.end(datos === undefined ? '' : JSON.stringify(datos));
    };
    const forzado = this.forzar?.(p);
    if (forzado === 'colgar') return; // nunca responde
    if (forzado) return enviar(...forzado);

    if (p.ruta === '/v1/oauth2/token') {
      const esperado = `Basic ${Buffer.from(`${CLIENTE_ID}:${SECRETO}`).toString('base64')}`;
      if (p.cabeceras.authorization !== esperado || cuerpo !== 'grant_type=client_credentials') {
        return enviar(401, {
          error: 'invalid_client',
          error_description: 'Client Authentication failed',
        });
      }
      this.tokensEmitidos += 1;
      return enviar(200, {
        scope: 'https://uri.paypal.com/services/payments/payment',
        access_token: `A21AA-token-${this.tokensEmitidos}`,
        token_type: 'Bearer',
        app_id: 'APP-80W284485P519543T',
        expires_in: this.vidaToken,
        nonce: 'nonce',
      });
    }
    if (!String(p.cabeceras.authorization ?? '').startsWith('Bearer A21AA-token-')) {
      return enviar(401, { error: 'invalid_token' });
    }
    const clave = p.cabeceras['paypal-request-id'] as string | undefined;
    if (clave && this.porClave.has(clave)) {
      const previa = this.porClave.get(clave)!;
      return enviar(previa.estado, previa.cuerpo);
    }
    const [estado, datos] = this.ruta(p);
    if (clave && estado < 500) this.porClave.set(clave, { estado, cuerpo: datos });
    return enviar(estado, datos);
  }

  private error(estado: number, name: string, issue: string, field?: string): [number, unknown] {
    return [
      estado,
      {
        name,
        message: 'The requested action could not be performed.',
        debug_id: 'f0e1d2c3b4a59',
        details: [{ issue, ...(field ? { field } : {}), description: `detalle ${CORREO}` }],
      },
    ];
  }

  vistaOrden(o: Orden) {
    const vaulted = o.vaultId
      ? { attributes: { vault: { id: o.vaultId, status: 'VAULTED', customer: { id: 'cus-1' } } } }
      : {};
    return {
      id: o.id,
      status: o.status,
      payment_source: { paypal: { email_address: CORREO, account_id: 'PAYERID1', ...vaulted } },
      purchase_units: [
        {
          reference_id: o.cuerpo.purchase_units[0].reference_id,
          ...(o.capturas.length ? { payments: { captures: o.capturas } } : {}),
        },
      ],
      links: [
        {
          href: `https://api.sandbox.paypal.com/v2/checkout/orders/${o.id}`,
          rel: 'self',
          method: 'GET',
        },
        ...(o.status === 'PAYER_ACTION_REQUIRED'
          ? [
              {
                href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}`,
                rel: 'payer-action',
                method: 'GET',
              },
            ]
          : []),
      ],
    };
  }

  private capturar(o: Orden, estado = 'COMPLETED') {
    const u = o.cuerpo.purchase_units[0];
    const valor = String(u.amount.value).endsWith('.15')
      ? (Number(u.amount.value) - 1).toFixed(2)
      : u.amount.value;
    o.capturas = [
      {
        id: this.id('CAP'),
        status: estado,
        amount: { currency_code: u.amount.currency_code, value: valor },
      },
    ];
    o.status = estado === 'COMPLETED' || estado === 'PENDING' ? 'COMPLETED' : o.status;
  }

  private ruta(p: Peticion): [number, unknown] {
    const partes = p.ruta.split('/').filter(Boolean);
    // POST /v2/checkout/orders
    if (p.metodo === 'POST' && p.ruta === '/v2/checkout/orders') {
      const cuerpo = JSON.parse(p.cuerpo);
      const fuente = cuerpo.payment_source?.paypal ?? {};
      const o: Orden = {
        id: this.id('5O190127TN'),
        status: 'PAYER_ACTION_REQUIRED',
        cuerpo,
        capturas: [],
        vaultId: null,
        claveCaptura: null,
        respuestaCaptura: null,
      };
      if (fuente.vault_id) {
        if (!this.tokensVault.has(fuente.vault_id)) {
          return this.error(
            422,
            'UNPROCESSABLE_ENTITY',
            'INVALID_RESOURCE_ID',
            '/payment_source/paypal/vault_id',
          );
        }
        const valor = String(cuerpo.purchase_units[0].amount.value);
        if (valor.endsWith('.13')) {
          return this.error(422, 'UNPROCESSABLE_ENTITY', 'PAYER_CANNOT_PAY');
        }
        this.ordenes.set(o.id, o);
        this.capturar(
          o,
          valor.endsWith('.12') ? 'DECLINED' : valor.endsWith('.11') ? 'PENDING' : 'COMPLETED',
        );
        if (valor.endsWith('.12')) o.status = 'COMPLETED';
        return [201, this.vistaOrden(o)];
      }
      this.ordenes.set(o.id, o);
      return [200, this.vistaOrden(o)];
    }
    // GET /v2/checkout/orders/:id  y  POST /v2/checkout/orders/:id/capture
    if (partes[0] === 'v2' && partes[1] === 'checkout' && partes[2] === 'orders' && partes[3]) {
      const o = this.ordenes.get(partes[3]);
      if (!o) return this.error(404, 'RESOURCE_NOT_FOUND', 'INVALID_RESOURCE_ID');
      if (p.metodo === 'GET') return [200, this.vistaOrden(o)];
      if (partes[4] === 'capture') {
        if (o.status === 'COMPLETED')
          return this.error(422, 'UNPROCESSABLE_ENTITY', 'ORDER_ALREADY_CAPTURED');
        if (o.status !== 'APPROVED')
          return this.error(422, 'UNPROCESSABLE_ENTITY', 'ORDER_NOT_APPROVED');
        if (String(o.cuerpo.purchase_units[0].amount.value).endsWith('.13')) {
          return this.error(422, 'UNPROCESSABLE_ENTITY', 'INSTRUMENT_DECLINED');
        }
        if (o.cuerpo.payment_source?.paypal?.attributes?.vault) {
          o.vaultId = this.id('vault-');
          this.tokensVault.add(o.vaultId);
        }
        this.capturar(o);
        return [201, this.vistaOrden(o)];
      }
    }
    // POST /v2/payments/captures/:id/refund
    if (p.metodo === 'POST' && partes[1] === 'payments' && partes[4] === 'refund') {
      const cap = [...this.ordenes.values()]
        .flatMap((o) => o.capturas)
        .find((c) => c.id === partes[3]);
      if (!cap) return this.error(404, 'RESOURCE_NOT_FOUND', 'INVALID_RESOURCE_ID');
      const cuerpo = JSON.parse(p.cuerpo);
      if (Number(cuerpo.amount.value) > Number(cap.amount.value)) {
        return this.error(422, 'UNPROCESSABLE_ENTITY', 'REFUND_AMOUNT_EXCEEDED');
      }
      this.reembolsos += 1;
      return [
        201,
        {
          id: this.id('REF'),
          status: cuerpo.amount.value.endsWith('.11') ? 'PENDING' : 'COMPLETED',
        },
      ];
    }
    // POST /v1/notifications/verify-webhook-signature
    if (p.ruta === '/v1/notifications/verify-webhook-signature') {
      const c = JSON.parse(p.cuerpo);
      for (const campo of [
        'auth_algo',
        'cert_url',
        'transmission_id',
        'transmission_sig',
        'transmission_time',
        'webhook_id',
      ]) {
        if (!c[campo])
          return this.error(400, 'VALIDATION_ERROR', 'MISSING_REQUIRED_PARAMETER', campo);
      }
      const ok = c.transmission_sig === FIRMA_BUENA && c.webhook_id === WEBHOOK_ID;
      return [200, { verification_status: ok ? 'SUCCESS' : 'FAILURE' }];
    }
    // DELETE /v3/vault/payment-tokens/:id
    if (p.metodo === 'DELETE' && partes[0] === 'v3' && partes[2] === 'payment-tokens') {
      if (!this.tokensVault.delete(decodeURIComponent(partes[3] ?? ''))) {
        return this.error(404, 'RESOURCE_NOT_FOUND', 'INVALID_RESOURCE_ID');
      }
      return [204, undefined];
    }
    return this.error(404, 'NOT_FOUND', 'RESOURCE_NOT_FOUND');
  }
}

const falso = new PaypalFalso();

const entorno = (cambios: Partial<Entorno> = {}) =>
  ({
    PAYPAL_CLIENTE_ID: CLIENTE_ID,
    PAYPAL_SECRETO: SECRETO,
    PAYPAL_WEBHOOK_ID: WEBHOOK_ID,
    PAYPAL_MODO: 'pruebas',
    ...cambios,
  }) as Entorno;

const nuevo = (cambios: Partial<Entorno> = {}, tiempoLimiteMs = 2_000) =>
  new AdaptadorPaypal(entorno(cambios), { urlBase: falso.url, tiempoLimiteMs });

const datosPago = (cambios: Partial<DatosCrearPago> = {}): DatosCrearPago => ({
  referencia: 'P-ABCD1234',
  idInterno: '6f1c1d2e-0000-4000-8000-000000000001',
  monto: '12.50',
  moneda: 'USD',
  descripcion: 'Factura F-000123 · NV Streaming',
  urlRetorno: 'https://nv.test/cuenta/pagos/retorno?intento=1',
  urlCancelacion: 'https://nv.test/cuenta/pagos/retorno?intento=1&cancelado=1',
  guardarMetodo: false,
  pagador: { nombre: 'María Pérez', correo: CORREO },
  ...cambios,
});

const datosCobro = (cambios: Partial<DatosCobro> = {}): DatosCobro => ({
  referencia: 'F-000123-1',
  monto: '12.50',
  moneda: 'USD',
  descripcion: 'Renovación F-000123 · NV Streaming',
  claveIdempotencia: 'cobro:6f1c1d2e-0000-4000-8000-0000000000aa:1',
  ...cambios,
});

/** Todo lo que un error nunca debe contener. */
function sinSecretos(texto: string) {
  for (const prohibido of [SECRETO, CLIENTE_ID, 'A21AA-token', CORREO, 'vault-vivo', 'vault-0']) {
    expect(texto).not.toContain(prohibido);
  }
}

async function errorDe(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('Se esperaba un error.');
}

beforeAll(() => falso.iniciar());
afterAll(() => {
  falso.servidor.closeAllConnections();
  return new Promise<void>((r) => falso.servidor.close(() => r()));
});
beforeEach(() => falso.reiniciar());

describe('AdaptadorPaypal: configuración y token', () => {
  it('solo está configurada con las tres credenciales y elige la URL por modo', () => {
    expect(nuevo().configurada()).toBe(true);
    expect(nuevo({ PAYPAL_WEBHOOK_ID: '' }).configurada()).toBe(false);
    expect(nuevo({ PAYPAL_SECRETO: '' }).configurada()).toBe(false);
    expect(new AdaptadorPaypal(entorno({ PAYPAL_MODO: 'produccion' })).modo).toBe('produccion');
  });

  it('pide el token una sola vez y lo reutiliza (también con llamadas simultáneas)', async () => {
    const a = nuevo();
    const r = await a.crearPago(datosPago());
    await Promise.all([a.consultarPago(r.idExterno), a.consultarPago(r.idExterno)]);
    expect(falso.tokensEmitidos).toBe(1);
    const [token] = falso.rutas('/v1/oauth2/token');
    expect(token!.cabeceras['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('renueva el token cuando está por vencer', async () => {
    falso.vidaToken = 1; // vence casi enseguida (margen de seguridad)
    const a = nuevo();
    await a.crearPago(datosPago());
    await new Promise((r) => setTimeout(r, 600));
    await a.crearPago(datosPago({ idInterno: 'otro' }));
    expect(falso.tokensEmitidos).toBe(2);
  });

  it('con 401 en una llamada renueva el token y repite con la misma clave', async () => {
    const a = nuevo();
    const r = await a.crearPago(datosPago());
    let primera = true;
    falso.forzar = (p) => {
      if (p.metodo === 'GET' && primera) {
        primera = false;
        return [401, { error: 'invalid_token' }];
      }
      return null;
    };
    const c = await a.consultarPago(r.idExterno);
    expect(c.estado).toBe('pendiente');
    expect(falso.tokensEmitidos).toBe(2);
  });

  it('credenciales malas: error claro y sin secretos', async () => {
    const e = await errorDe(nuevo({ PAYPAL_SECRETO: 'otro-secreto-malo' }).crearPago(datosPago()));
    expect(e.message).toMatch(/PayPal rechazó las credenciales/);
    sinSecretos(e.message);
    expect(e.message).not.toContain('otro-secreto-malo');
  });

  it('sin credenciales no llama a PayPal', async () => {
    const e = await errorDe(nuevo({ PAYPAL_CLIENTE_ID: '' }).crearPago(datosPago()));
    expect(e.message).toMatch(/no está configurado/);
    expect(falso.peticiones).toHaveLength(0);
  });
});

describe('AdaptadorPaypal: pago con el cliente presente', () => {
  it('crea la orden con la referencia, el importe y la experiencia sin envío', async () => {
    const r = await nuevo().crearPago(datosPago());
    expect(r.urlPago).toBe(`https://www.sandbox.paypal.com/checkoutnow?token=${r.idExterno}`);
    const [p] = falso.rutas('/v2/checkout/orders');
    expect(p!.cabeceras['paypal-request-id']).toMatch(/^nv-orden-6f1c1d2e/);
    expect(p!.cabeceras['prefer']).toBe('return=representation');
    const c = JSON.parse(p!.cuerpo);
    expect(c.intent).toBe('CAPTURE');
    expect(c.purchase_units[0]).toMatchObject({
      reference_id: 'P-ABCD1234',
      custom_id: 'P-ABCD1234',
      invoice_id: 'P-ABCD1234',
      amount: { currency_code: 'USD', value: '12.50' },
    });
    expect(c.payment_source.paypal.experience_context).toMatchObject({
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
      return_url: datosPago().urlRetorno,
      cancel_url: datosPago().urlCancelacion,
    });
    expect(c.payment_source.paypal.attributes).toBeUndefined();
  });

  it('la misma orden si se repite la creación del mismo intento', async () => {
    const a = nuevo();
    const r1 = await a.crearPago(datosPago());
    const r2 = await a.crearPago(datosPago());
    expect(r2.idExterno).toBe(r1.idExterno);
    expect(falso.ordenes.size).toBe(1);
  });

  it('pide guardar la cuenta (vault) si el cliente lo autorizó', async () => {
    await nuevo().crearPago(datosPago({ guardarMetodo: true }));
    const c = JSON.parse(falso.rutas('/v2/checkout/orders')[0]!.cuerpo);
    expect(c.payment_source.paypal.attributes.vault).toMatchObject({
      store_in_vault: 'ON_SUCCESS',
      usage_type: 'MERCHANT',
      permit_multiple_payment_tokens: true,
    });
  });

  it('si PayPal rechaza el idioma, repite sin él con otra clave', async () => {
    falso.forzar = (p) =>
      p.ruta === '/v2/checkout/orders' && p.cuerpo.includes('"locale"')
        ? [
            400,
            {
              name: 'INVALID_REQUEST',
              details: [
                {
                  field: '/payment_source/paypal/experience_context/locale',
                  issue: 'INVALID_PARAMETER_VALUE',
                },
              ],
            },
          ]
        : null;
    const r = await nuevo().crearPago(datosPago());
    expect(r.idExterno).toBeTruthy();
    const [p1, p2] = falso.rutas('/v2/checkout/orders');
    expect(p2!.cabeceras['paypal-request-id']).toBe(`${p1!.cabeceras['paypal-request-id']}-b`);
  });

  it('sin aprobar: pendiente; aprobada: se captura al volver', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago());
    expect((await a.confirmarRetorno(idExterno, { token: idExterno })).estado).toBe('pendiente');
    falso.aprobar(idExterno);
    const r = await a.confirmarRetorno(idExterno, { token: idExterno, PayerID: 'X' });
    expect(r).toMatchObject({ estado: 'aprobado', montoRecibido: '12.50', moneda: 'USD' });
    expect(r.idCobro).toMatch(/^CAP/);
    expect(r.metodoGuardado).toBeUndefined();
    const captura = falso.rutas(`/v2/checkout/orders/${idExterno}/capture`).at(-1)!;
    expect(captura.cabeceras['paypal-request-id']).toBe(`nv-captura-${idExterno}`);
  });

  it('volver a capturar (retorno + webhook) devuelve el mismo cobro', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago());
    falso.aprobar(idExterno);
    const r1 = await a.confirmarRetorno(idExterno, {});
    const r2 = await a.consultarPago(idExterno);
    const r3 = await a.confirmarRetorno(idExterno, {});
    expect(r2.idCobro).toBe(r1.idCobro);
    expect(r3.idCobro).toBe(r1.idCobro);
    expect(falso.ordenes.get(idExterno)!.capturas).toHaveLength(1);
  });

  it('ORDER_ALREADY_CAPTURED con otra clave: lee la orden y la da por cobrada', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago());
    falso.aprobar(idExterno);
    const r1 = await a.confirmarRetorno(idExterno, {});
    falso.porClave.clear(); // PayPal ya olvidó la clave
    // La lectura aún la ve aprobada (carrera con otra captura): la captura dice ORDER_ALREADY_CAPTURED.
    let leida = false;
    falso.forzar = (p) => {
      if (p.metodo !== 'GET' || leida) return null;
      leida = true;
      return [200, { ...falso.vistaOrden(falso.ordenes.get(idExterno)!), status: 'APPROVED' }];
    };
    const r2 = await a.confirmarRetorno(idExterno, {});
    expect(r2).toMatchObject({ estado: 'aprobado', idCobro: r1.idCobro });
    expect(falso.rutas(`/v2/checkout/orders/${idExterno}/capture`)).toHaveLength(2);
  });

  it('informa el importe que dice PayPal (el núcleo revisa diferencias)', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago({ monto: '20.15' }));
    falso.aprobar(idExterno);
    expect((await a.consultarPago(idExterno)).montoRecibido).toBe('19.15');
  });

  it('devuelve la cuenta guardada con el correo enmascarado', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago({ guardarMetodo: true, moneda: 'EUR' }));
    falso.aprobar(idExterno);
    const r = await a.confirmarRetorno(idExterno, {});
    expect(r.moneda).toBe('EUR');
    expect(r.metodoGuardado?.token).toMatch(/^vault-/);
    expect(r.metodoGuardado?.descripcion).toBe('PayPal · ma***@gmail.com');
  });

  it('medio de pago rechazado al capturar → rechazado con mensaje para el cliente', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago({ monto: '10.13' }));
    falso.aprobar(idExterno);
    const r = await a.confirmarRetorno(idExterno, {});
    expect(r.estado).toBe('rechazado');
    expect(r.mensaje).toMatch(/PayPal rechazó el medio de pago/);
    sinSecretos(r.mensaje!);
  });

  it('orden desconocida → rechazado; anulada → cancelado', async () => {
    const a = nuevo();
    expect((await a.consultarPago('NO-EXISTE')).estado).toBe('rechazado');
    const { idExterno } = await a.crearPago(datosPago());
    falso.ordenes.get(idExterno)!.status = 'VOIDED';
    expect((await a.consultarPago(idExterno)).estado).toBe('cancelado');
  });

  it('un 5xx es un error (el núcleo reintenta) sin datos personales', async () => {
    const a = nuevo();
    const { idExterno } = await a.crearPago(datosPago());
    falso.forzar = (p) =>
      p.metodo === 'GET'
        ? [
            503,
            {
              name: 'SERVICE_UNAVAILABLE',
              debug_id: 'abc123',
              details: [{ issue: 'X', description: CORREO }],
            },
          ]
        : null;
    const e = await errorDe(a.consultarPago(idExterno));
    expect(e.message).toBe(
      'PayPal respondió 503 al consultar la orden (SERVICE_UNAVAILABLE, X) · debug_id abc123.',
    );
    sinSecretos(e.message);
  });

  it('sin respuesta a tiempo: error claro', async () => {
    const a = nuevo({}, 150);
    await a.crearPago(datosPago()); // token en memoria
    falso.forzar = () => 'colgar';
    const e = await errorDe(a.consultarPago('5O190127TN000001'));
    expect(e.message).toMatch(/PayPal no respondió a tiempo al consultar la orden/);
    sinSecretos(e.message);
  });
});

describe('AdaptadorPaypal: cobro sin el cliente (vault)', () => {
  it('cobra con el vault id como iniciado por el comercio', async () => {
    const r = await nuevo().cobrarConMetodo('vault-vivo', datosCobro());
    expect(r).toMatchObject({ estado: 'aprobado', montoRecibido: '12.50', moneda: 'USD' });
    const p = falso.rutas('/v2/checkout/orders')[0]!;
    expect(p.cabeceras['paypal-request-id']).toBe(
      'nv-cobro-6f1c1d2e-0000-4000-8000-0000000000aa-1',
    );
    const c = JSON.parse(p.cuerpo);
    expect(c.payment_source.paypal.vault_id).toBe('vault-vivo');
    expect(c.payment_source.paypal.stored_credential).toMatchObject({
      payment_initiator: 'MERCHANT',
      usage: 'SUBSEQUENT',
    });
    expect(c.purchase_units[0].invoice_id).toBe('F-000123-1');
  });

  it('la misma clave nunca cobra dos veces', async () => {
    const a = nuevo();
    const r1 = await a.cobrarConMetodo('vault-vivo', datosCobro());
    const r2 = await a.cobrarConMetodo('vault-vivo', datosCobro());
    expect(r2.idCobro).toBe(r1.idCobro);
    expect(falso.ordenes.size).toBe(1);
  });

  it('rechazo de PayPal → rechazado sin invalidar el método', async () => {
    const r = await nuevo().cobrarConMetodo('vault-vivo', datosCobro({ monto: '9.13' }));
    expect(r.estado).toBe('rechazado');
    expect(r.metodoInvalido).toBeUndefined();
    expect(r.mensaje).toMatch(/PayPal rechazó el pago/);
  });

  it('captura DECLINED en la respuesta → rechazado', async () => {
    const r = await nuevo().cobrarConMetodo('vault-vivo', datosCobro({ monto: '9.12' }));
    expect(r.estado).toBe('rechazado');
    expect(r.idCobro).toMatch(/^CAP/);
  });

  it('captura PENDING → pendiente con el id del cobro; luego se lee el estado nuevo', async () => {
    const a = nuevo();
    const r = await a.cobrarConMetodo('vault-vivo', datosCobro({ monto: '9.11' }));
    expect(r.estado).toBe('pendiente');
    expect(r.idCobro).toMatch(/^CAP/);
    // PayPal completa la captura: repetir con la misma clave da el resultado final.
    const orden = [...falso.ordenes.values()][0]!;
    orden.capturas[0]!.status = 'COMPLETED';
    const r2 = await a.cobrarConMetodo('vault-vivo', datosCobro({ monto: '9.11' }));
    expect(r2).toMatchObject({ estado: 'aprobado', idCobro: r.idCobro });
  });

  it('token que ya no existe → rechazado con metodoInvalido', async () => {
    const r = await nuevo().cobrarConMetodo('vault-borrado', datosCobro());
    expect(r).toMatchObject({ estado: 'rechazado', metodoInvalido: true });
    sinSecretos(r.mensaje!);
    expect(r.mensaje).not.toContain('vault-borrado');
  });

  it('referencia repetida: error (nunca se da por rechazado a ciegas)', async () => {
    falso.forzar = (p) =>
      p.ruta === '/v2/checkout/orders'
        ? [422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'DUPLICATE_INVOICE_ID' }] }]
        : null;
    const e = await errorDe(nuevo().cobrarConMetodo('vault-vivo', datosCobro()));
    expect(e.message).toMatch(/ya se usó/);
  });

  it('429 o 5xx: error para reintentar con la misma clave', async () => {
    falso.forzar = (p) =>
      p.ruta === '/v2/checkout/orders' ? [429, { name: 'RATE_LIMIT_REACHED' }] : null;
    const e = await errorDe(nuevo().cobrarConMetodo('vault-vivo', datosCobro()));
    expect(e.message).toMatch(/PayPal respondió 429/);
    sinSecretos(e.message);
    expect(e.message).not.toContain('vault-vivo');
  });

  it('si PayPal rechaza stored_credential, repite sin él', async () => {
    falso.forzar = (p) =>
      p.ruta === '/v2/checkout/orders' && p.cuerpo.includes('stored_credential')
        ? [
            400,
            {
              name: 'INVALID_REQUEST',
              details: [
                { field: '/payment_source/paypal/stored_credential', issue: 'UNKNOWN_FIELD' },
              ],
            },
          ]
        : null;
    const r = await nuevo().cobrarConMetodo('vault-vivo', datosCobro());
    expect(r.estado).toBe('aprobado');
  });

  it('revocar borra el token en PayPal (y un token ya borrado no es error)', async () => {
    const a = nuevo();
    await a.revocarMetodo('vault-vivo');
    expect(falso.tokensVault.has('vault-vivo')).toBe(false);
    await expect(a.revocarMetodo('vault-vivo')).resolves.toBeUndefined();
    expect(falso.rutas('/v3/vault/payment-tokens/')[0]!.metodo).toBe('DELETE');
  });
});

describe('AdaptadorPaypal: devoluciones', () => {
  async function cobro(a: AdaptadorPaypal) {
    return (await a.cobrarConMetodo('vault-vivo', datosCobro({ monto: '30.00' }))).idCobro!;
  }

  it('completada, idempotente por clave', async () => {
    const a = nuevo();
    const id = await cobro(a);
    const r1 = await a.reembolsar(id, '10.00', 'USD', 'reembolso:1');
    const r2 = await a.reembolsar(id, '10.00', 'USD', 'reembolso:1');
    expect(r1).toMatchObject({ estado: 'completado' });
    expect(r2.idReembolso).toBe(r1.idReembolso);
    expect(falso.reembolsos).toBe(1);
    const p = falso.rutas(`/v2/payments/captures/${id}/refund`)[0]!;
    expect(JSON.parse(p.cuerpo).amount).toEqual({ value: '10.00', currency_code: 'USD' });
    expect(p.cabeceras['paypal-request-id']).toBe('nv-reembolso-1');
  });

  it('pendiente y fallida', async () => {
    const a = nuevo();
    const id = await cobro(a);
    expect((await a.reembolsar(id, '5.11', 'USD', 'r:2')).estado).toBe('pendiente');
    const f = await a.reembolsar(id, '99.00', 'USD', 'r:3');
    expect(f).toMatchObject({ estado: 'fallido', mensaje: 'La devolución supera lo cobrado.' });
    expect((await a.reembolsar('CAP-NO', '1.00', 'USD', 'r:4')).estado).toBe('fallido');
  });
});

describe('AdaptadorPaypal: webhooks', () => {
  const cabeceras = (firma = FIRMA_BUENA) => ({
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42',
    'paypal-transmission-id': '69cd13f0-d67a-11e5-baa3-778b53f4ae55',
    'paypal-transmission-sig': firma,
    'paypal-transmission-time': '2026-09-24T12:00:00Z',
  });
  const evento = (
    event_type: string,
    resource: Record<string, unknown>,
    resource_type = 'capture',
  ) => ({
    id: 'WH-2WR32451HC0233532-67976317FL4543714',
    event_version: '1.0',
    create_time: '2026-09-24T12:00:00.000Z',
    resource_type,
    event_type,
    summary: 'Payment completed',
    resource,
  });

  it('verifica con PayPal mandando el cuerpo exacto', async () => {
    // Espacios y orden de claves raros: la verificación debe recibir los bytes tal cual.
    const crudo = `{"id":"WH-1",  "event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"CAP1","amount":{"value":"1.50"}}}`;
    const v = await nuevo().verificarWebhook(cabeceras(), Buffer.from(crudo));
    expect(v.valido).toBe(true);
    const p = falso.rutas('/v1/notifications/verify-webhook-signature')[0]!;
    expect(p.cuerpo.endsWith(`"webhook_event":${crudo}}`)).toBe(true);
    expect(JSON.parse(p.cuerpo)).toMatchObject({
      auth_algo: 'SHA256withRSA',
      transmission_id: '69cd13f0-d67a-11e5-baa3-778b53f4ae55',
      webhook_id: WEBHOOK_ID,
    });
  });

  it('FAILURE, cabeceras que faltan o cuerpo que no es JSON → no válido', async () => {
    const a = nuevo();
    const cuerpo = Buffer.from(JSON.stringify(evento('PAYMENT.CAPTURE.COMPLETED', { id: 'C' })));
    expect((await a.verificarWebhook(cabeceras('firma-falsa'), cuerpo)).valido).toBe(false);
    const { 'paypal-transmission-sig': _, ...incompletas } = cabeceras();
    expect((await a.verificarWebhook(incompletas, cuerpo)).valido).toBe(false);
    expect((await a.verificarWebhook(cabeceras(), Buffer.from('no json'))).valido).toBe(false);
    expect(falso.rutas('/v1/notifications')).toHaveLength(1);
  });

  it('captura completada → pago_aprobado con la orden y el cobro', async () => {
    const cuerpo = evento('PAYMENT.CAPTURE.COMPLETED', {
      id: '2GG279541U471931P',
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '12.50' },
      supplementary_data: { related_ids: { order_id: '5O190127TN364715T' } },
      payee: { email_address: 'comercio@nv.test', merchant_id: 'M1' },
    });
    const v = await nuevo().verificarWebhook(cabeceras(), Buffer.from(JSON.stringify(cuerpo)));
    expect(v.evento).toMatchObject({
      idEvento: cuerpo.id,
      tipo: 'PAYMENT.CAPTURE.COMPLETED',
      idRecurso: '2GG279541U471931P',
      normalizado: {
        tipo: 'pago_aprobado',
        idExterno: '5O190127TN364715T',
        idCobro: '2GG279541U471931P',
      },
    });
    expect(JSON.stringify(v.evento!.carga)).not.toContain('comercio@nv.test');
  });

  it('normaliza rechazos, devoluciones, órdenes aprobadas y otros', async () => {
    const a = nuevo();
    const normal = async (c: object) =>
      (await a.verificarWebhook(cabeceras(), Buffer.from(JSON.stringify(c)))).evento!.normalizado;
    expect(
      await normal(
        evento('PAYMENT.CAPTURE.DENIED', {
          id: 'C2',
          supplementary_data: { related_ids: { order_id: 'O2' } },
        }),
      ),
    ).toMatchObject({ tipo: 'pago_rechazado', idExterno: 'O2', idCobro: 'C2' });
    expect((await normal(evento('PAYMENT.CAPTURE.DECLINED', { id: 'C3' }))).tipo).toBe(
      'pago_rechazado',
    );
    expect(
      await normal(evento('PAYMENT.CAPTURE.REFUNDED', { id: 'R1', status: 'COMPLETED' }, 'refund')),
    ).toMatchObject({ tipo: 'reembolso_completado', idReembolso: 'R1', idCobro: null });
    expect(
      (await normal(evento('PAYMENT.CAPTURE.REFUNDED', { id: 'R2', status: 'PENDING' }, 'refund')))
        .tipo,
    ).toBe('otro');
    expect(
      await normal(
        evento('CHECKOUT.ORDER.APPROVED', { id: 'O9', status: 'APPROVED' }, 'checkout-order'),
      ),
    ).toMatchObject({ tipo: 'pago_aprobado', idExterno: 'O9', idCobro: null });
    expect((await normal(evento('PAYMENT.CAPTURE.REVERSED', { id: 'C4' }))).tipo).toBe('otro');
  });

  it('token borrado → metodo_revocado, sin guardar el token en claro', async () => {
    const cuerpo = evento(
      'VAULT.PAYMENT-TOKEN.DELETED',
      {
        id: 'vault-secreto-9',
        links: [
          {
            href: 'https://api.sandbox.paypal.com/v3/vault/payment-tokens/vault-secreto-9',
            rel: 'self',
          },
        ],
      },
      'payment_token',
    );
    const v = await nuevo().verificarWebhook(cabeceras(), Buffer.from(JSON.stringify(cuerpo)));
    expect(v.evento!.normalizado).toMatchObject({
      tipo: 'metodo_revocado',
      token: 'vault-secreto-9',
    });
    expect(v.evento!.idRecurso).toBeNull();
    expect(JSON.stringify(v.evento!.carga)).not.toContain('vault-secreto-9');
  });

  it('la carga no guarda correo, nombre ni el vault id de la cuenta', async () => {
    const cuerpo = evento(
      'CHECKOUT.ORDER.COMPLETED',
      {
        id: 'O1',
        payer: { email_address: CORREO, name: { given_name: 'María' } },
        payment_source: {
          paypal: {
            email_address: CORREO,
            account_id: 'P1',
            attributes: { vault: { id: 'vault-oculto' } },
          },
        },
      },
      'checkout-order',
    );
    const v = await nuevo().verificarWebhook(cabeceras(), Buffer.from(JSON.stringify(cuerpo)));
    const carga = JSON.stringify(v.evento!.carga);
    for (const x of [CORREO, 'María', 'vault-oculto', 'P1']) expect(carga).not.toContain(x);
    expect(v.evento!.normalizado.tipo).toBe('otro');
  });

  it('un 5xx de PayPal al verificar es un error (PayPal reenviará el aviso)', async () => {
    falso.forzar = (p) =>
      p.ruta.startsWith('/v1/notifications') ? [500, { name: 'INTERNAL_SERVICE_ERROR' }] : null;
    const cuerpo = Buffer.from(JSON.stringify(evento('PAYMENT.CAPTURE.COMPLETED', { id: 'C' })));
    const e = await errorDe(nuevo().verificarWebhook(cabeceras(), cuerpo));
    expect(e.message).toMatch(/PayPal respondió 500 al verificar el webhook/);
  });

  it('sin PAYPAL_WEBHOOK_ID no se acepta ningún aviso', async () => {
    const v = await nuevo({ PAYPAL_WEBHOOK_ID: '' }).verificarWebhook(
      cabeceras(),
      Buffer.from('{"id":"x"}'),
    );
    expect(v.valido).toBe(false);
    expect(falso.peticiones).toHaveLength(0);
  });
});

describe('enmascararCorreo', () => {
  it('muestra el inicio y el dominio', () => {
    expect(enmascararCorreo('maria@gmail.com')).toBe('PayPal · ma***@gmail.com');
    expect(enmascararCorreo('al@x.com')).toBe('PayPal · a***@x.com');
    expect(enmascararCorreo(undefined)).toBe('PayPal');
  });
});
