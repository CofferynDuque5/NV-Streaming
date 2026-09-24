import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INFO_PASARELA } from '@nv/shared';
import type { Entorno } from '../../src/config/entorno.js';
import {
  AdaptadorMercadoPago,
  type PagoMercadoPago,
} from '../../src/pagos-en-linea/mercadopago/mercadopago.adaptador.js';
import type { AdaptadorPaypal } from '../../src/pagos-en-linea/paypal/paypal.adaptador.js';
import { RegistroPasarelas } from '../../src/pagos-en-linea/registro.service.js';
import type { AdaptadorSandbox } from '../../src/pagos-en-linea/sandbox/sandbox.adaptador.js';

const TOKEN = 'APP_USR-token-de-prueba-que-nunca-debe-aparecer';
const SECRETO = 'secreto-firma-de-prueba';
const REF = 'L-ABCDEFGH';

// ── Mercado Pago falso (formas de la API documentada) ───────────────────────

interface Peticion {
  metodo: string;
  ruta: string;
  cabeceras: IncomingMessage['headers'];
  cuerpo: unknown;
}

const mp = {
  peticiones: [] as Peticion[],
  pagos: new Map<string, PagoMercadoPago>(),
  /** Pagos que la búsqueda todavía no incluye (índice con retraso). */
  ocultosEnBusqueda: new Set<string>(),
  reembolsos: new Map<string, Record<string, unknown>>(),
  demoraMs: 0,
  falla: null as number | null,
  siguienteId: 900,
  reiniciar() {
    this.peticiones = [];
    this.pagos.clear();
    this.ocultosEnBusqueda.clear();
    this.reembolsos.clear();
    this.demoraMs = 0;
    this.falla = null;
  },
};

function responder(res: ServerResponse, estado: number, cuerpo: unknown) {
  res.writeHead(estado, { 'content-type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

const noEncontrado = {
  message: 'Payment not found',
  error: 'not_found',
  status: 404,
  cause: [{ code: 2000, description: 'Payment not found' }],
};

async function atender(req: IncomingMessage, res: ServerResponse) {
  let crudo = '';
  for await (const trozo of req) crudo += String(trozo);
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  mp.peticiones.push({
    metodo: req.method ?? '',
    ruta: url.pathname + url.search,
    cabeceras: req.headers,
    cuerpo: crudo ? JSON.parse(crudo) : null,
  });
  if (mp.demoraMs) await new Promise((r) => setTimeout(r, mp.demoraMs));
  if (mp.falla) return responder(res, mp.falla, { message: `error ${TOKEN}`, status: mp.falla });
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return responder(res, 401, { message: 'invalid access token', error: 'unauthorized' });
  }
  if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
    const cuerpo = JSON.parse(crudo) as { items?: { currency_id?: string }[] };
    if (cuerpo.items?.[0]?.currency_id === 'USD') {
      return responder(res, 400, {
        message: 'currency_id invalid',
        error: 'invalid_items',
        status: 400,
        cause: [{ code: 'invalid_currency_id', description: 'Pedido de ana@correo.test' }],
      });
    }
    return responder(res, 201, {
      id: '123456789-pref',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789-pref',
      sandbox_init_point:
        'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789-pref',
    });
  }
  if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
    const ref = url.searchParams.get('external_reference');
    const results = [...mp.pagos.values()].filter(
      (p) => p.external_reference === ref && !mp.ocultosEnBusqueda.has(String(p.id)),
    );
    return responder(res, 200, {
      paging: { total: results.length, limit: 50, offset: 0 },
      results,
    });
  }
  const pago = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
  if (req.method === 'GET' && pago) {
    const p = mp.pagos.get(pago[1]!);
    return p ? responder(res, 200, p) : responder(res, 404, noEncontrado);
  }
  const devolucion = /^\/v1\/payments\/(\d+)\/refunds$/.exec(url.pathname);
  if (req.method === 'POST' && devolucion) {
    const clave = String(req.headers['x-idempotency-key'] ?? '');
    const previa = mp.reembolsos.get(clave);
    if (previa) return responder(res, 201, previa);
    const p = mp.pagos.get(devolucion[1]!);
    if (!p) return responder(res, 404, noEncontrado);
    const pedido = (JSON.parse(crudo || '{}') as { amount?: number }).amount;
    const ya = p.transaction_amount_refunded ?? 0;
    const importe = pedido ?? p.transaction_amount! - ya;
    if (importe + ya > p.transaction_amount! + 1e-9) {
      return responder(res, 400, {
        message: 'Invalid refund amount',
        error: 'bad_request',
        status: 400,
        cause: [{ code: 4040, description: 'amount exceeds' }],
      });
    }
    const r = {
      id: mp.siguienteId++,
      payment_id: Number(p.id),
      amount: importe,
      status: pedido === 13.13 ? 'in_process' : 'approved',
      date_created: new Date().toISOString(),
    };
    p.transaction_amount_refunded = ya + importe;
    p.refunds = [...(p.refunds ?? []), r];
    if (p.transaction_amount_refunded >= p.transaction_amount!) p.status = 'refunded';
    else p.status_detail = 'partially_refunded';
    mp.reembolsos.set(clave, r);
    return responder(res, 201, r);
  }
  responder(res, 404, { message: 'not found' });
}

let servidor: Server;
let base = '';
beforeAll(async () => {
  servidor = createServer((req, res) => {
    atender(req, res).catch(() => responder(res, 500, { message: 'fallo' }));
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
});

const entorno = (extra: Partial<Record<keyof Entorno, unknown>> = {}) =>
  ({
    WEB_ORIGEN: 'http://localhost:3000',
    API_URL_PUBLICA: '',
    MERCADOPAGO_TOKEN_ACCESO: TOKEN,
    MERCADOPAGO_SECRETO_WEBHOOK: SECRETO,
    MERCADOPAGO_MODO: 'pruebas',
    MERCADOPAGO_MONEDA: 'ARS',
    MERCADOPAGO_API_URL: base,
    ...extra,
  }) as unknown as Entorno;

let mpa: AdaptadorMercadoPago;
beforeEach(() => {
  mp.reiniciar();
  mpa = new AdaptadorMercadoPago(entorno());
  mpa.tiempoLimiteMs = 1_000;
});

const pedido = (extra: Record<string, unknown> = {}) => ({
  referencia: REF,
  idInterno: '1b0e8f7a-0000-4000-8000-000000000001',
  monto: '1500.50',
  moneda: 'ARS' as const,
  descripcion: 'Factura NV-000001 · NV Streaming',
  urlRetorno: 'http://localhost:3000/cuenta/pagos/retorno?intento=i1',
  urlCancelacion: 'http://localhost:3000/cuenta/pagos/retorno?intento=i1&cancelado=1',
  guardarMetodo: false,
  pagador: { nombre: 'Ana', correo: 'ana@correo.test' },
  ...extra,
});

const pago = (id: number, extra: Partial<PagoMercadoPago> = {}): PagoMercadoPago => {
  const p: PagoMercadoPago = {
    id,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: REF,
    transaction_amount: 1500.5,
    transaction_amount_refunded: 0,
    currency_id: 'ARS',
    date_created: new Date(Date.UTC(2026, 8, 24, 12, 0, id % 60)).toISOString(),
    date_approved: new Date(Date.UTC(2026, 8, 24, 12, 0, id % 60)).toISOString(),
    refunds: [],
    ...extra,
  };
  // Datos del pagador tal como los devuelve Mercado Pago (no deben guardarse ni mostrarse).
  Object.assign(p, { payer: { email: 'ana@correo.test', identification: { number: '123' } } });
  mp.pagos.set(String(id), p);
  return p;
};

describe('Mercado Pago: configuración', () => {
  it('necesita token, secreto de la firma y la moneda de la cuenta; sin cobros automáticos', () => {
    expect(mpa.configurada()).toBe(true);
    expect(mpa.modo).toBe('pruebas');
    expect(mpa.pasarela).toBe('mercadopago');
    for (const falta of [
      'MERCADOPAGO_TOKEN_ACCESO',
      'MERCADOPAGO_SECRETO_WEBHOOK',
      'MERCADOPAGO_MONEDA',
    ] as const) {
      expect(
        new AdaptadorMercadoPago(
          entorno({ [falta]: falta === 'MERCADOPAGO_MONEDA' ? undefined : '' }),
        ).configurada(),
      ).toBe(false);
    }
    expect(INFO_PASARELA.mercadopago.admiteCobroRecurrente).toBe(false);
  });

  it('el registro solo ofrece la moneda de la cuenta', () => {
    const registro = (m: AdaptadorMercadoPago) =>
      new RegistroPasarelas(entorno(), {} as AdaptadorSandbox, {} as AdaptadorPaypal, m);
    const ars = registro(mpa);
    expect(ars.monedas('mercadopago')).toEqual(['ARS']);
    expect(ars.admiteMoneda('mercadopago', 'ARS')).toBe(true);
    expect(ars.admiteMoneda('mercadopago', 'COP')).toBe(false);
    const cop = registro(new AdaptadorMercadoPago(entorno({ MERCADOPAGO_MONEDA: 'COP' })));
    expect(cop.monedas('mercadopago')).toEqual(['COP']);
    expect(cop.admiteMoneda('mercadopago', 'ARS')).toBe(false);
  });
});

describe('Mercado Pago: preferencias de Checkout Pro', () => {
  it('crea la preferencia con la referencia, las URLs de vuelta y la clave de idempotencia', async () => {
    const r = await mpa.crearPago(pedido({ guardarMetodo: true }));
    expect(r).toEqual({
      idExterno: REF,
      urlPago: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789-pref',
    });
    const [p] = mp.peticiones;
    expect(p).toMatchObject({ metodo: 'POST', ruta: '/checkout/preferences' });
    expect(p!.cabeceras['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(p!.cabeceras['x-idempotency-key']).toBe('nv-pref-1b0e8f7a-0000-4000-8000-000000000001');
    const cuerpo = p!.cuerpo as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      items: [
        {
          id: REF,
          title: 'Factura NV-000001 · NV Streaming',
          quantity: 1,
          unit_price: 1500.5,
          currency_id: 'ARS',
        },
      ],
      external_reference: REF,
      back_urls: {
        success: 'http://localhost:3000/cuenta/pagos/retorno?intento=i1',
        pending: 'http://localhost:3000/cuenta/pagos/retorno?intento=i1',
        failure: 'http://localhost:3000/cuenta/pagos/retorno?intento=i1&cancelado=1',
      },
      auto_return: 'approved',
      expires: true,
    });
    const desde = Date.parse(String(cuerpo['expiration_date_from']));
    const hasta = Date.parse(String(cuerpo['expiration_date_to']));
    expect(hasta - desde).toBe(120 * 60_000);
    // Sin datos del pagador ni nada para guardar tarjetas (guardarMetodo se ignora).
    expect(JSON.stringify(cuerpo)).not.toMatch(/ana@correo|payer|customer|card/);
  });

  it('en producción usa init_point', async () => {
    const prod = new AdaptadorMercadoPago(entorno({ MERCADOPAGO_MODO: 'produccion' }));
    expect((await prod.crearPago(pedido())).urlPago).toBe(
      'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789-pref',
    );
  });

  it('nunca crea una preferencia en otra moneda que la de la cuenta', async () => {
    await expect(mpa.crearPago(pedido({ moneda: 'COP' }))).rejects.toThrow(
      'La cuenta de Mercado Pago cobra en ARS; no puede crear un pago en COP.',
    );
    expect(mp.peticiones).toHaveLength(0);
  });

  it('un rechazo de la API es un error sin el cuerpo ni el token', async () => {
    const usd = new AdaptadorMercadoPago(entorno({ MERCADOPAGO_MONEDA: 'USD' }));
    const err = await usd.crearPago(pedido({ moneda: 'USD' })).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(
      'Mercado Pago no creó la preferencia (400: invalid_items, invalid_currency_id).',
    );
    expect((err as Error).message).not.toMatch(/ana@|APP_USR/);
  });
});

describe('Mercado Pago: retorno y consulta', () => {
  it('aprobado: lee el pago en la API aunque los parámetros digan otra cosa', async () => {
    pago(101);
    const r = await mpa.confirmarRetorno(REF, {
      payment_id: '101',
      status: 'rejected',
      external_reference: 'otra',
      preference_id: '123456789-pref',
    });
    expect(r).toEqual({
      estado: 'aprobado',
      idCobro: '101',
      montoRecibido: '1500.50',
      moneda: 'ARS',
    });
    expect(mp.peticiones.map((p) => p.ruta)).toEqual([
      '/v1/payments/101',
      `/v1/payments/search?external_reference=${REF}&sort=date_created&criteria=desc&limit=50`,
    ]);
  });

  it('el pago del retorno cuenta aunque la búsqueda todavía no lo muestre', async () => {
    pago(102);
    mp.ocultosEnBusqueda.add('102');
    expect(await mpa.consultarPago(REF)).toMatchObject({ estado: 'pendiente' });
    expect(await mpa.confirmarRetorno(REF, { payment_id: '102' })).toMatchObject({
      estado: 'aprobado',
      idCobro: '102',
    });
  });

  it('un payment_id de otra referencia se ignora', async () => {
    pago(103, { external_reference: 'L-OTRAREF1' });
    expect(await mpa.confirmarRetorno(REF, { payment_id: '103', status: 'approved' })).toEqual({
      estado: 'pendiente',
      idCobro: null,
      montoRecibido: null,
      moneda: null,
    });
    // Un id que no es numérico ni siquiera se consulta.
    await mpa.confirmarRetorno(REF, { payment_id: '../users/me' });
    expect(mp.peticiones.some((p) => p.ruta.includes('users'))).toBe(false);
  });

  it('pendiente, en proceso, rechazado (con motivo) y cancelado', async () => {
    expect((await mpa.consultarPago(REF)).estado).toBe('pendiente');
    pago(110, { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' });
    expect(await mpa.consultarPago(REF)).toMatchObject({
      estado: 'rechazado',
      idCobro: null,
      mensaje: 'La tarjeta no tiene fondos suficientes.',
    });
    pago(111, { status: 'in_process', status_detail: 'pending_review_manual' });
    expect((await mpa.consultarPago(REF)).estado).toBe('pendiente');
    mp.pagos.clear();
    pago(112, { status: 'cancelled', status_detail: 'expired' });
    expect(await mpa.consultarPago(REF)).toMatchObject({ estado: 'cancelado' });
    mp.pagos.clear();
    pago(113, { status: 'rejected', status_detail: 'algo_nuevo' });
    expect((await mpa.consultarPago(REF)).mensaje).toBe('Mercado Pago rechazó el pago.');
  });

  it('un rechazo seguido de un reintento aprobado en la misma preferencia: aprobado', async () => {
    pago(120, { status: 'rejected', status_detail: 'cc_rejected_other_reason' });
    pago(121);
    expect(await mpa.consultarPago(REF)).toMatchObject({ estado: 'aprobado', idCobro: '121' });
  });

  it('informa el importe y la moneda que cobró Mercado Pago (el núcleo detecta la diferencia)', async () => {
    pago(130, { transaction_amount: 1000 });
    expect(await mpa.confirmarRetorno(REF, { payment_id: '130' })).toMatchObject({
      estado: 'aprobado',
      montoRecibido: '1000.00',
      moneda: 'ARS',
    });
    mp.pagos.clear();
    pago(131, { currency_id: 'XXX' });
    await expect(mpa.consultarPago(REF)).rejects.toThrow('moneda desconocida');
  });
});

describe('Mercado Pago: devoluciones', () => {
  it('parcial con importe y luego el resto; la misma clave nunca devuelve dos veces', async () => {
    pago(200);
    const a = await mpa.reembolsar('200', '500.00', 'ARS', 'reembolso:r1');
    expect(a).toEqual({ estado: 'completado', idReembolso: expect.any(String) });
    const repetido = await mpa.reembolsar('200', '500.00', 'ARS', 'reembolso:r1');
    expect(repetido.idReembolso).toBe(a.idReembolso);
    const posts = mp.peticiones.filter((p) => p.metodo === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0]!.cuerpo).toEqual({ amount: 500 });
    expect(posts[1]!.cuerpo).toEqual({ amount: 500 });
    expect(posts[0]!.cabeceras['x-idempotency-key']).toBe('reembolso:r1');
    expect(mp.pagos.get('200')!.transaction_amount_refunded).toBe(500);
    const b = await mpa.reembolsar('200', '1000.50', 'ARS', 'reembolso:r2');
    expect(b.estado).toBe('completado');
    expect(mp.pagos.get('200')!.status).toBe('refunded');
    // Más de lo que queda: rechazo conocido, no un error.
    expect(await mpa.reembolsar('200', '1.00', 'ARS', 'reembolso:r3')).toEqual({
      estado: 'fallido',
      idReembolso: null,
      mensaje: 'Mercado Pago rechazó la devolución (400: bad_request, 4040).',
    });
  });

  it('total: sin cuerpo; en proceso queda pendiente', async () => {
    pago(210);
    expect((await mpa.reembolsar('210', '1500.50', 'ARS', 'k-total')).estado).toBe('completado');
    const post = mp.peticiones.find((p) => p.metodo === 'POST')!;
    expect(post.cuerpo).toEqual({});
    pago(211, { transaction_amount: 50 });
    expect(await mpa.reembolsar('211', '13.13', 'ARS', 'k-proceso')).toMatchObject({
      estado: 'pendiente',
    });
  });

  it('moneda distinta, cobro desconocido o id raro: fallido sin tocar la devolución', async () => {
    pago(220);
    expect((await mpa.reembolsar('220', '1.00', 'PEN', 'k1')).mensaje).toBe(
      'La moneda no coincide con la del cobro.',
    );
    expect((await mpa.reembolsar('999', '1.00', 'ARS', 'k2')).mensaje).toBe(
      'Mercado Pago no encuentra ese cobro.',
    );
    expect((await mpa.reembolsar('abc/../x', '1.00', 'ARS', 'k3')).estado).toBe('fallido');
    expect(mp.peticiones.some((p) => p.metodo === 'POST')).toBe(false);
  });

  it('una clave larga se convierte en una cabecera estable', async () => {
    pago(230);
    const clave = `reembolso:${'x'.repeat(120)}`;
    await mpa.reembolsar('230', '1.00', 'ARS', clave);
    await mpa.reembolsar('230', '1.00', 'ARS', clave);
    const claves = mp.peticiones
      .filter((p) => p.metodo === 'POST')
      .map((p) => p.cabeceras['x-idempotency-key']);
    expect(claves[0]).toMatch(/^nv-[0-9a-f]{48}$/);
    expect(claves[1]).toBe(claves[0]);
    expect(mp.pagos.get('230')!.transaction_amount_refunded).toBe(1);
  });
});

describe('Mercado Pago: cobros automáticos', () => {
  it('no se admiten: rechaza y marca el método como inválido sin llamar a la API', async () => {
    expect(await mpa.cobrarConMetodo()).toMatchObject({
      estado: 'rechazado',
      metodoInvalido: true,
    });
    expect(mp.peticiones).toHaveLength(0);
  });
});

describe('Mercado Pago: webhooks', () => {
  const avisar = (idDato: string | number, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      action: 'payment.updated',
      api_version: 'v1',
      data: { id: String(idDato) },
      date_created: '2026-09-24T12:00:00Z',
      id: 12345678901,
      live_mode: false,
      type: 'payment',
      user_id: 44444,
      ...extra,
    });
  const firmar = (
    idDato: string,
    { ts = Math.floor(Date.now() / 1000), peticion = 'req-abc-123', secreto = SECRETO } = {},
  ) => {
    const v1 = createHmac('sha256', secreto)
      .update(`id:${idDato};request-id:${peticion};ts:${ts};`)
      .digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': peticion };
  };
  const verificar = (cabeceras: Record<string, string>, cuerpo: string) =>
    mpa.verificarWebhook(cabeceras, Buffer.from(cuerpo, 'utf8'));

  it('pago aprobado: firma válida, se lee el pago y se normaliza con la referencia', async () => {
    pago(300);
    const v = await verificar(firmar('300'), avisar(300));
    expect(v.valido).toBe(true);
    expect(v.evento).toMatchObject({
      idEvento: '12345678901',
      tipo: 'payment.updated',
      idRecurso: '300',
      normalizado: { tipo: 'pago_aprobado', idExterno: REF, idCobro: '300' },
    });
    expect(v.evento!.carga).toMatchObject({ type: 'payment', _pago: { status: 'approved' } });
    expect(JSON.stringify(v.evento!.carga)).not.toMatch(/ana@correo|identification/);
  });

  it('rechazado, devuelto y otros temas', async () => {
    pago(310, { status: 'rejected', status_detail: 'cc_rejected_high_risk' });
    expect((await verificar(firmar('310'), avisar(310))).evento!.normalizado).toMatchObject({
      tipo: 'pago_rechazado',
      idExterno: REF,
      idCobro: '310',
    });
    pago(320);
    const d = await mpa.reembolsar('320', '1500.50', 'ARS', 'k-webhook');
    expect((await verificar(firmar('320'), avisar(320))).evento!.normalizado).toMatchObject({
      tipo: 'reembolso_completado',
      idCobro: '320',
      idReembolso: d.idReembolso,
    });
    pago(330, { status: 'in_process' });
    expect((await verificar(firmar('330'), avisar(330))).evento!.normalizado.tipo).toBe('otro');
    // Otro tema: no se consulta la API.
    const antes = mp.peticiones.length;
    const orden = await verificar(
      firmar('555'),
      avisar(555, { type: 'merchant_order', action: 'merchant_order.updated' }),
    );
    expect(orden.evento).toMatchObject({
      tipo: 'merchant_order.updated',
      normalizado: { tipo: 'otro' },
    });
    expect(mp.peticiones.length).toBe(antes);
    // El aviso de prueba del panel (pago que no existe) se acepta como "otro".
    expect((await verificar(firmar('123456'), avisar(123456))).evento!.normalizado.tipo).toBe(
      'otro',
    );
  });

  it('firma inválida, de otro secreto, con el id cambiado, vieja o ausente: no válido', async () => {
    pago(340);
    const buena = firmar('340');
    expect(
      (
        await verificar(
          { ...buena, 'x-signature': buena['x-signature'].replace(/v1=./, 'v1=0') },
          avisar(340),
        )
      ).valido,
    ).toBe(false);
    expect((await verificar(firmar('340', { secreto: 'otro' }), avisar(340))).valido).toBe(false);
    expect((await verificar(buena, avisar(341))).valido).toBe(false);
    expect((await verificar({ ...buena, 'x-request-id': 'otra' }, avisar(340))).valido).toBe(false);
    const vieja = Math.floor(Date.now() / 1000) - 3600;
    expect((await verificar(firmar('340', { ts: vieja }), avisar(340))).valido).toBe(false);
    expect((await verificar({}, avisar(340))).valido).toBe(false);
    expect((await verificar({ 'x-signature': 'basura' }, avisar(340))).valido).toBe(false);
    expect((await verificar(firmar('340'), 'no es json')).valido).toBe(false);
    // Nada se consultó a la API con avisos no válidos.
    expect(mp.peticiones).toHaveLength(0);
  });

  it('acepta la marca de tiempo en milisegundos', async () => {
    pago(350);
    const v = await verificar(firmar('350', { ts: Date.now() }), avisar(350));
    expect(v.valido).toBe(true);
  });

  it('sin respuesta de la API al leer el pago: lanza (Mercado Pago reintenta)', async () => {
    mp.falla = 503;
    await expect(verificar(firmar('360'), avisar(360))).rejects.toThrow(
      'Mercado Pago respondió 503 (GET /v1/payments/360); se reintentará.',
    );
  });
});

describe('Mercado Pago: red y secretos', () => {
  it('tiempo agotado: error claro', async () => {
    mp.demoraMs = 400;
    mpa.tiempoLimiteMs = 100;
    await expect(mpa.consultarPago(REF)).rejects.toThrow(
      'Mercado Pago no respondió a tiempo (GET /v1/payments/search).',
    );
  });

  it('sin conexión, 5xx, 429 y token rechazado: errores sin el token ni el cuerpo', async () => {
    const errores: string[] = [];
    const caida = new AdaptadorMercadoPago(entorno({ MERCADOPAGO_API_URL: 'http://127.0.0.1:1' }));
    errores.push((await caida.consultarPago(REF).catch((e: Error) => e.message)) as string);
    for (const estado of [500, 429]) {
      mp.falla = estado;
      errores.push((await mpa.crearPago(pedido()).catch((e: Error) => e.message)) as string);
    }
    mp.falla = null;
    const otroToken = new AdaptadorMercadoPago(
      entorno({ MERCADOPAGO_TOKEN_ACCESO: 'APP_USR-otro-token-secreto' }),
    );
    errores.push((await otroToken.consultarPago(REF).catch((e: Error) => e.message)) as string);
    expect(errores).toEqual([
      'No se pudo conectar con Mercado Pago (GET /v1/payments/search).',
      'Mercado Pago respondió 500 (POST /checkout/preferences); se reintentará.',
      'Mercado Pago respondió 429 (POST /checkout/preferences); se reintentará.',
      'Mercado Pago rechazó el token de acceso (GET /v1/payments/search). Revisa MERCADOPAGO_TOKEN_ACCESO.',
    ]);
    for (const m of errores) expect(m).not.toMatch(/APP_USR|secreto|L-ABCDEFGH/);
  });
});
