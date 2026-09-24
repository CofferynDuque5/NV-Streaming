import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INFO_PASARELA, textoAutorizacion, VERSION_TEXTO_AUTORIZACION } from '@nv/shared';
import { ConfigAutomatizacionesService } from '../../src/automatizaciones/configuracion.service.js';
import { EjecutorAutomatizacionesService } from '../../src/automatizaciones/ejecutor.service.js';
import { DIA_MS, inicioDiaCaracas } from '../../src/automatizaciones/horario.js';
import { TrabajosService } from '../../src/automatizaciones/trabajos.service.js';
import { Cifrador } from '../../src/comun/cripto.js';
import { IntentosPagoService } from '../../src/pagos-en-linea/intentos.service.js';
import { CONTEXTO_TOKEN } from '../../src/pagos-en-linea/metodos-autorizados.service.js';
import {
  AdaptadorSandbox,
  CABECERA_FIRMA_SANDBOX,
} from '../../src/pagos-en-linea/sandbox/sandbox.adaptador.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  Navegador,
  ORIGEN,
  PNG_1X1,
  prepararCatalogo,
} from './ayudas.js';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
});

const s = () => ({
  trabajos: ctx.app.get(TrabajosService),
  ejecutor: ctx.app.get(EjecutorAutomatizacionesService),
  config: ctx.app.get(ConfigAutomatizacionesService),
  sandbox: ctx.app.get(AdaptadorSandbox),
  intentos: ctx.app.get(IntentosPagoService),
  cifrador: ctx.app.get(Cifrador),
});

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const cliente = await conectar(ctx, 'cliente');
  const catalogo = await prepararCatalogo(admin.n);
  await s().config.asegurar();
  const metodo = await admin.n.post('/finanzas/metodos-cobro', {
    nombre: 'Pago en línea (pruebas)',
    moneda: 'USD',
    instrucciones: 'Paga con tarjeta de prueba.',
    tipo: 'pasarela',
    pasarela: 'sandbox',
  });
  expect(metodo.estado).toBe(201);
  return {
    admin: admin.n,
    operador: operador.n,
    cliente: cliente.n,
    clienteUsuario: cliente.usuario,
    sandboxId: metodo.cuerpo.id as string,
    ...catalogo,
  };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

/** El cliente contrata el plan en USD: devuelve la suscripción y su factura de alta. */
async function contratar(e: Escenario, n = e.cliente, planId = e.planId, moneda = 'USD') {
  const alta = await n.post('/mi/suscripciones', { planId, moneda });
  expect(alta.estado).toBe(201);
  return { suscripcionId: alta.cuerpo.suscripcion.id as string, facturaId: alta.cuerpo.factura.id };
}

async function iniciar(
  e: Escenario,
  facturaId: string,
  opciones: { guardarMetodo?: boolean; aceptoAutorizacion?: boolean } = {},
  n = e.cliente,
) {
  return n.post(`/mi/facturas/${facturaId}/pago-en-linea`, {
    metodoCobroId: e.sandboxId,
    ...opciones,
  });
}

/** La "página de la pasarela": la usa quien paga, sin sesión de NV. */
const simular = (intentoId: string, resultado: 'aprobar' | 'rechazar' | 'cancelar') =>
  new Navegador(ctx.app).post(`/pasarelas/sandbox/intentos/${intentoId}/simular`, { resultado });

async function pagarAprobado(e: Escenario, facturaId: string, guardar = false) {
  const i = await iniciar(
    e,
    facturaId,
    guardar ? { guardarMetodo: true, aceptoAutorizacion: true } : {},
  );
  expect(i.estado).toBe(201);
  expect((await simular(i.cuerpo.id, 'aprobar')).estado).toBe(200);
  const r = await e.cliente.post(`/mi/pagos-en-linea/${i.cuerpo.id}/retorno`, { parametros: {} });
  expect(r.cuerpo.estado).toBe('aprobado');
  return r.cuerpo;
}

/** Envía un webhook tal cual lo haría la pasarela (cuerpo crudo y cabeceras). */
const webhook = (cuerpo: string, cabeceras: Record<string, string>) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/pasarelas/sandbox/webhook',
    headers: { 'content-type': 'application/json', ...cabeceras },
    payload: cuerpo,
  });

/** Vence hoy (Caracas), un rato después de ahora. */
function venceHoy(ahora = new Date()) {
  return new Date(
    Math.min(ahora.getTime() + 3600_000, inicioDiaCaracas(ahora, 1).getTime() - 60_000),
  );
}

async function tokenDe(metodoId: string) {
  const m = await ctx.prisma.metodoPagoAutorizado.findUniqueOrThrow({ where: { id: metodoId } });
  return s().cifrador.descifrar(m.tokenCifrado, CONTEXTO_TOKEN);
}

/** Suscripción activa, pagada en línea guardando el método (queda con cobro automático). */
async function conCobroAutomatico(e: Escenario) {
  const { suscripcionId, facturaId } = await contratar(e);
  await pagarAprobado(e, facturaId, true);
  const sub = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } });
  expect(sub.metodoAutorizadoId).not.toBeNull();
  const venceEn = venceHoy();
  await ctx.prisma.suscripcion.update({ where: { id: suscripcionId }, data: { venceEn } });
  return { suscripcionId, metodoId: sub.metodoAutorizadoId!, venceEn };
}

const correos = (plantilla: string) => ctx.prisma.correoSaliente.findMany({ where: { plantilla } });

// ─────────────────────────────────────────────────────────────────────────────

describe('pago en línea de una factura', () => {
  it('aprobado: la factura queda pagada, la suscripción activa y el pago con origen pasarela', async () => {
    const e = await escenario();
    const { suscripcionId, facturaId } = await contratar(e);

    const op = await e.cliente.get(`/mi/facturas/${facturaId}/pago-en-linea`);
    expect(op.estado).toBe(200);
    expect(op.cuerpo.factura).toMatchObject({ id: facturaId, total: '5.00', moneda: 'USD' });
    expect(op.cuerpo.opciones).toEqual([
      {
        metodoCobroId: e.sandboxId,
        nombre: 'Pago en línea (pruebas)',
        pasarela: 'sandbox',
        moneda: 'USD',
        admiteGuardar: true,
      },
    ]);
    expect(op.cuerpo.versionTexto).toBe(VERSION_TEXTO_AUTORIZACION);
    expect(op.cuerpo.textosAutorizacion.sandbox).toContain(e.clienteUsuario.nombre);

    const i = await iniciar(e, facturaId);
    expect(i.estado).toBe(201);
    expect(i.cuerpo).toMatchObject({
      estado: 'pendiente',
      monto: '5.00',
      moneda: 'USD',
      pasarela: 'sandbox',
    });
    expect(i.cuerpo.urlPago).toBe(`${ORIGEN}/pago-sandbox/${i.cuerpo.id}`);

    const pagina = await new Navegador(ctx.app).get(`/pasarelas/sandbox/intentos/${i.cuerpo.id}`);
    expect(pagina.cuerpo).toMatchObject({
      monto: '5.00',
      moneda: 'USD',
      estado: 'pendiente',
      guardarMetodo: false,
    });

    const sim = await simular(i.cuerpo.id, 'aprobar');
    expect(sim.cuerpo.urlRetorno).toBe(`${ORIGEN}/cuenta/pagos/retorno?intento=${i.cuerpo.id}`);
    const r = await e.cliente.post(`/mi/pagos-en-linea/${i.cuerpo.id}/retorno`, { parametros: {} });
    expect(r.cuerpo).toMatchObject({ estado: 'aprobado', urlPago: null, error: null });

    const f = await e.cliente.get(`/mi/facturas/${facturaId}`);
    expect(f.cuerpo.estado).toBe('pagada');
    expect(f.cuerpo.pagos).toHaveLength(1);
    expect(f.cuerpo.pagos[0]).toMatchObject({
      estado: 'confirmado',
      origen: 'pasarela',
      pasarela: 'sandbox',
      montoRecibido: '5.00',
      montoReembolsado: '0.00',
    });
    expect((await e.cliente.get(`/mi/suscripciones/${suscripcionId}`)).cuerpo).toMatchObject({
      estado: 'activa',
      cobroAutomatico: null,
    });
    expect(await correos('pagoConfirmado')).toHaveLength(1);

    // El webhook de la aprobación llega después: no crea otro pago.
    await s().trabajos.procesarTodo();
    expect(await ctx.prisma.pago.count()).toBe(1);
    const ev = await e.admin.get('/eventos-pasarela');
    expect(ev.cuerpo.elementos).toHaveLength(1);
    expect(ev.cuerpo.elementos[0]).toMatchObject({
      tipo: 'orden.aprobada',
      estado: 'procesado',
      firmaValida: true,
    });

    const auditoria = await ctx.prisma.auditoria.findMany({ where: { entidadId: i.cuerpo.id } });
    expect(auditoria.map((a) => a.accion).sort()).toEqual([
      'pago_en_linea.aprobado',
      'pago_en_linea.iniciado',
    ]);
    // El intento ya no se puede volver a simular.
    expect((await simular(i.cuerpo.id, 'aprobar')).estado).toBe(409);
  });

  it('rechazado y cancelado no pagan la factura; se puede volver a intentar', async () => {
    const e = await escenario();
    const { facturaId } = await contratar(e);

    const a = await iniciar(e, facturaId);
    await simular(a.cuerpo.id, 'rechazar');
    const ra = await e.cliente.post(`/mi/pagos-en-linea/${a.cuerpo.id}/retorno`, {
      parametros: {},
    });
    expect(ra.cuerpo).toMatchObject({ estado: 'rechazado', urlPago: null });
    expect(ra.cuerpo.error).toMatch(/rechaz/);

    const b = await iniciar(e, facturaId);
    const sim = await simular(b.cuerpo.id, 'cancelar');
    expect(sim.cuerpo.urlRetorno).toContain('&cancelado=1');
    const rb = await e.cliente.post(`/mi/pagos-en-linea/${b.cuerpo.id}/cancelar`);
    expect(rb.cuerpo.estado).toBe('cancelado');

    // Iniciar otro con uno abierto lo cierra antes (índice: uno abierto por factura).
    const c = await iniciar(e, facturaId);
    const d = await iniciar(e, facturaId);
    expect(d.estado).toBe(201);
    expect((await e.cliente.get(`/mi/pagos-en-linea/${c.cuerpo.id}`)).cuerpo.estado).toBe(
      'cancelado',
    );

    await s().trabajos.procesarTodo();
    expect(await ctx.prisma.pago.count()).toBe(0);
    expect((await e.cliente.get(`/mi/facturas/${facturaId}`)).cuerpo.estado).toBe('emitida');
  });

  it('el retorno y el webhook repetidos o a la vez registran un solo pago', async () => {
    const e = await escenario();
    const { suscripcionId, facturaId } = await contratar(e);
    const i = await iniciar(e, facturaId);
    await simular(i.cuerpo.id, 'aprobar');
    const intento = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: i.cuerpo.id } });
    const cuerpo = s().sandbox.cuerpoWebhook('orden.aprobada', intento.idExterno!, 'evt_duplicado');
    await Promise.all([
      e.cliente.post(`/mi/pagos-en-linea/${i.cuerpo.id}/retorno`, { parametros: {} }),
      e.cliente.post(`/mi/pagos-en-linea/${i.cuerpo.id}/retorno`, { parametros: {} }),
      e.cliente.get(`/mi/pagos-en-linea/${i.cuerpo.id}`),
      webhook(cuerpo, s().sandbox.firmar(cuerpo)),
      webhook(cuerpo, s().sandbox.firmar(cuerpo)),
      s().trabajos.procesarTodo(),
      s().intentos.resolverPorIdExterno('sandbox', intento.idExterno!),
    ]);
    await s().trabajos.procesarTodo();
    expect(await ctx.prisma.pago.count()).toBe(1);
    expect(await ctx.prisma.operacionSandbox.count({ where: { tipo: 'cobro' } })).toBe(1);
    const eventos = await ctx.prisma.eventoSuscripcion.findMany({ where: { suscripcionId } });
    expect(eventos.filter((x) => x.tipo === 'activacion')).toHaveLength(1);
    expect(await ctx.prisma.eventoPasarela.count({ where: { idEvento: 'evt_duplicado' } })).toBe(1);
  });

  it('un monto distinto al de la factura no se confirma: queda en revisión y avisa al equipo', async () => {
    const e = await escenario();
    // La pasarela de pruebas informa 1,00 menos cuando el importe termina en ,15.
    const plan = await e.admin.post('/catalogo/planes', {
      servicioId: e.servicioId,
      nombre: 'Semanal',
      precioUsd: '3.15',
      duracionCantidad: 7,
      duracionUnidad: 'dia',
    });
    const { suscripcionId, facturaId } = await contratar(e, e.cliente, plan.cuerpo.id);
    const i = await iniciar(e, facturaId);
    await simular(i.cuerpo.id, 'aprobar');
    const r = await e.cliente.post(`/mi/pagos-en-linea/${i.cuerpo.id}/retorno`, { parametros: {} });
    expect(r.cuerpo.estado).toBe('aprobado');
    expect(r.cuerpo.error).toMatch(/revisando/);
    const f = await e.cliente.get(`/mi/facturas/${facturaId}`);
    expect(f.cuerpo.estado).toBe('emitida');
    expect(f.cuerpo.pagoEnRevision).toBe(true);
    expect(f.cuerpo.pagos[0]).toMatchObject({
      estado: 'en_revision',
      origen: 'pasarela',
      montoRecibido: '2.15',
    });
    expect(
      (await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })).estado,
    ).toBe('pendiente_pago');
    expect(await ctx.prisma.auditoria.count({ where: { accion: 'pago_en_linea.revision' } })).toBe(
      1,
    );
    // Dos del equipo con pagos.gestionar (administración y operador).
    expect(await correos('pagoEnLineaEnRevision')).toHaveLength(2);
    expect(await correos('pagoConfirmado')).toHaveLength(0);
    // No se puede reportar otro pago ni iniciar otro en línea mientras está en revisión.
    expect((await iniciar(e, facturaId)).cuerpo.error.codigo).toBe('PAGO_EN_REVISION');
  });

  it('VES nunca se ofrece en línea y un pago manual no puede usar un método en línea', async () => {
    const e = await escenario();
    const ves = await e.admin.post('/finanzas/metodos-cobro', {
      nombre: 'En línea Bs',
      moneda: 'VES',
      instrucciones: 'No debería existir.',
      tipo: 'pasarela',
      pasarela: 'sandbox',
    });
    expect(ves.estado).toBe(400);
    expect(ves.cuerpo.error.campos.moneda).toBeDefined();
    const { facturaId } = await contratar(e, e.cliente, e.planId, 'VES');
    const op = await e.cliente.get(`/mi/facturas/${facturaId}/pago-en-linea`);
    expect(op.cuerpo.opciones).toEqual([]);
    expect((await iniciar(e, facturaId)).estado).toBe(400);
    // Aunque alguien la forzara en la base, la restricción lo impide.
    await expect(
      ctx.prisma.metodoCobro.create({
        data: {
          nombre: 'x',
          moneda: 'VES',
          instrucciones: 'xxxxx',
          tipo: 'pasarela',
          pasarela: 'sandbox',
        },
      }),
    ).rejects.toThrow();

    const usd = await contratar(e);
    const manual = await e.cliente.formulario(
      `/mi/facturas/${usd.facturaId}/pagos`,
      { metodoCobroId: e.sandboxId, monto: '5', referenciaExterna: 'X1', fechaPago: hoy() },
      { campo: 'comprobante', nombre: 'p.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(manual.estado).toBe(400);
    const lista = await e.cliente.get('/mi/metodos-cobro?moneda=USD');
    expect(lista.cuerpo.map((m: { nombre: string }) => m.nombre)).toEqual(['Zelle']);
  });

  it('los métodos en línea se validan al crearlos y editarlos', async () => {
    const e = await escenario();
    const base = { nombre: 'PayPal', moneda: 'USD', instrucciones: 'Paga en línea.' };
    expect(
      (await e.admin.post('/finanzas/metodos-cobro', { ...base, tipo: 'pasarela' })).estado,
    ).toBe(400);
    expect(
      (
        await e.admin.post('/finanzas/metodos-cobro', {
          ...base,
          tipo: 'manual',
          pasarela: 'sandbox',
        })
      ).estado,
    ).toBe(400);
    expect(
      (
        await e.admin.post('/finanzas/metodos-cobro', {
          ...base,
          tipo: 'pasarela',
          pasarela: 'mercadopago',
        })
      ).estado,
    ).toBe(400);
    const pp = await e.admin.post('/finanzas/metodos-cobro', {
      ...base,
      tipo: 'pasarela',
      pasarela: 'paypal',
      requiereReferencia: true,
    });
    expect(pp.cuerpo).toMatchObject({
      tipo: 'pasarela',
      pasarela: 'paypal',
      requiereReferencia: false,
    });
    expect(
      (await e.admin.patch(`/finanzas/metodos-cobro/${pp.cuerpo.id}`, { moneda: 'VES' })).estado,
    ).toBe(400);
    const manual = await e.admin.patch(`/finanzas/metodos-cobro/${pp.cuerpo.id}`, {
      tipo: 'manual',
    });
    expect(manual.cuerpo).toMatchObject({ tipo: 'manual', pasarela: null });
    // PayPal sin credenciales: no se ofrece al cliente.
    await e.admin.patch(`/finanzas/metodos-cobro/${pp.cuerpo.id}`, {
      tipo: 'pasarela',
      pasarela: 'paypal',
    });
    const { facturaId } = await contratar(e);
    const op = await e.cliente.get(`/mi/facturas/${facturaId}/pago-en-linea`);
    expect(op.cuerpo.opciones.map((o: { pasarela: string }) => o.pasarela)).toEqual(['sandbox']);
  });

  it('las facturas, intentos y métodos de otro cliente responden 404', async () => {
    const e = await escenario();
    const otro = await conectar(ctx, 'cliente');
    const { facturaId } = await contratar(e);
    await pagarAprobado(e, facturaId, true);
    const intento = await ctx.prisma.intentoPago.findFirstOrThrow();
    const metodo = await ctx.prisma.metodoPagoAutorizado.findFirstOrThrow();
    const suyo = await contratar(e, otro.n);
    expect((await otro.n.get(`/mi/facturas/${facturaId}/pago-en-linea`)).estado).toBe(404);
    expect((await iniciar(e, facturaId, {}, otro.n)).estado).toBe(404);
    expect((await otro.n.get(`/mi/pagos-en-linea/${intento.id}`)).estado).toBe(404);
    expect((await otro.n.post(`/mi/pagos-en-linea/${intento.id}/retorno`, {})).estado).toBe(404);
    expect((await otro.n.post(`/mi/pagos-en-linea/${intento.id}/cancelar`)).estado).toBe(404);
    expect((await otro.n.post(`/mi/metodos-autorizados/${metodo.id}/revocar`, {})).estado).toBe(
      404,
    );
    expect((await otro.n.get('/mi/metodos-autorizados')).cuerpo).toEqual([]);
    const ajeno = await otro.n.pedir(
      'PUT',
      `/mi/suscripciones/${suyo.suscripcionId}/cobro-automatico`,
      {
        metodoAutorizadoId: metodo.id,
      },
    );
    expect(ajeno.estado).toBe(404);
    // Ventas solo ve su cartera.
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get(`/clientes/${intento.clienteId}/metodos-autorizados`)).estado).toBe(
      404,
    );
  });

  it('un intento abandonado vence; antes se consulta la pasarela por si sí se pagó', async () => {
    const e = await escenario();
    const a = await contratar(e);
    const b = await contratar(e);
    const ia = await iniciar(e, a.facturaId);
    const ib = await iniciar(e, b.facturaId);
    // B sí se aprobó en la pasarela, pero el cliente nunca volvió y el webhook no llegó.
    await s().sandbox.simular(ib.cuerpo.id, 'aprobar');
    await ctx.prisma.intentoPago.updateMany({ data: { expiraEn: new Date(Date.now() - 1000) } });
    expect(await s().intentos.expirar()).toBe(1);
    expect(
      (await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: ia.cuerpo.id } })).estado,
    ).toBe('expirado');
    expect(
      (await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: ib.cuerpo.id } })).estado,
    ).toBe('aprobado');
    expect(
      (await ctx.prisma.factura.findUniqueOrThrow({ where: { id: b.facturaId } })).estado,
    ).toBe('pagada');
  });
});

describe('autorización y métodos guardados', () => {
  it('guardar el método exige aceptar la autorización y deja la evidencia; el token va cifrado', async () => {
    const e = await escenario();
    const { suscripcionId, facturaId } = await contratar(e);
    const sin = await iniciar(e, facturaId, { guardarMetodo: true });
    expect(sin.estado).toBe(400);
    expect(sin.cuerpo.error.campos.aceptoAutorizacion).toBeDefined();

    await pagarAprobado(e, facturaId, true);
    const [m] = await ctx.prisma.metodoPagoAutorizado.findMany();
    expect(m).toBeDefined();
    const texto = textoAutorizacion({
      pasarela: INFO_PASARELA.sandbox.nombre,
      moneda: 'USD',
      titular: e.clienteUsuario.nombre,
    });
    expect(m).toMatchObject({
      estado: 'activo',
      pasarela: 'sandbox',
      moneda: 'USD',
      textoAceptado: texto,
      versionTexto: VERSION_TEXTO_AUTORIZACION,
      autorizadoIp: '127.0.0.1',
      metodoCobroId: e.sandboxId,
    });
    expect(m!.autorizadoAgente).toContain('Mozilla');
    // El token no se puede leer en la fila: solo el valor cifrado.
    expect(m!.tokenCifrado).toMatch(/^v1\./);
    expect(m!.tokenCifrado).not.toContain('sbx_');
    expect(await tokenDe(m!.id)).toMatch(/^sbx_tok_/);

    const lista = await e.cliente.get('/mi/metodos-autorizados');
    expect(lista.cuerpo).toHaveLength(1);
    expect(lista.cuerpo[0]).toMatchObject({
      id: m!.id,
      descripcion: 'Tarjeta de prueba ···· 4242',
      textoAceptado: texto,
      suscripciones: [{ id: suscripcionId }],
    });
    expect(JSON.stringify(lista.cuerpo)).not.toContain('token');
    // Se activó en la suscripción que pagó y se muestra en ella.
    const sub = await e.cliente.get(`/mi/suscripciones/${suscripcionId}`);
    expect(sub.cuerpo.cobroAutomatico).toEqual({ metodoId: m!.id, descripcion: m!.descripcion });
    expect(await correos('metodoAutorizadoGuardado')).toHaveLength(1);
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'metodo_autorizado.creado' } }),
    ).toBe(1);
  });

  it('el cliente desactiva y activa el cobro automático; revocar desengancha y cancela lo programado', async () => {
    const e = await escenario();
    const { suscripcionId, metodoId } = await conCobroAutomatico(e);
    const ruta = `/mi/suscripciones/${suscripcionId}/cobro-automatico`;
    expect((await e.cliente.pedir('PUT', ruta, { metodoAutorizadoId: null })).cuerpo).toEqual({
      metodoAutorizadoId: null,
    });
    expect((await e.cliente.pedir('PUT', ruta, { metodoAutorizadoId: metodoId })).cuerpo).toEqual({
      metodoAutorizadoId: metodoId,
    });
    // Un cobro programado de esa suscripción…
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    const factura = await ctx.prisma.factura.findFirstOrThrow({
      where: { suscripcionId, concepto: 'renovacion' },
    });
    const programado = await ctx.prisma.cobroAutomatico.create({
      data: {
        facturaId: factura.id,
        suscripcionId,
        metodoId,
        intento: 9,
        programadoPara: new Date(Date.now() + DIA_MS),
        claveIdempotencia: `cobro:${factura.id}:9`,
      },
    });
    const r = await e.cliente.post(`/mi/metodos-autorizados/${metodoId}/revocar`, {
      motivo: 'Ya no quiero',
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({
      estado: 'revocado',
      motivoEstado: 'Ya no quiero',
      suscripciones: [],
    });
    expect(
      (await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } }))
        .metodoAutorizadoId,
    ).toBeNull();
    expect(
      (await ctx.prisma.cobroAutomatico.findUniqueOrThrow({ where: { id: programado.id } })).estado,
    ).toBe('cancelado');
    // La pasarela también lo borró.
    const token = await tokenDe(metodoId);
    expect(
      (await ctx.prisma.operacionSandbox.findUniqueOrThrow({ where: { id: token } })).estado,
    ).toBe('revocado');
    expect((await e.cliente.post(`/mi/metodos-autorizados/${metodoId}/revocar`, {})).estado).toBe(
      409,
    );
    expect((await e.cliente.pedir('PUT', ruta, { metodoAutorizadoId: metodoId })).estado).toBe(400);
    expect(await correos('metodoAutorizadoRevocado')).toHaveLength(1);
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'metodo_autorizado.revocado' } }),
    ).toBe(1);
  });

  it('el equipo ve y revoca los métodos de un cliente con sus permisos', async () => {
    const e = await escenario();
    const { metodoId } = await conCobroAutomatico(e);
    const cliente = await ctx.prisma.cliente.findFirstOrThrow({
      where: { usuarioId: e.clienteUsuario.id },
    });
    const lista = await e.operador.get(`/clientes/${cliente.id}/metodos-autorizados`);
    expect(lista.cuerpo).toHaveLength(1);
    const ventas = await conectar(ctx, 'ventas');
    const revocar = `/clientes/${cliente.id}/metodos-autorizados/${metodoId}/revocar`;
    expect((await ventas.n.post(revocar, {})).estado).toBe(404);
    const r = await e.operador.post(revocar, { motivo: 'Pedido por teléfono' });
    expect(r.cuerpo.estado).toBe('revocado');
  });

  it('las suscripciones de la cartera de un revendedor no pueden usar el cobro automático', async () => {
    const e = await escenario();
    const { suscripcionId, metodoId } = await conCobroAutomatico(e);
    const { usuario } = await conectar(ctx, 'revendedor');
    const rev = await ctx.prisma.revendedor.create({
      data: { usuarioId: usuario.id, estado: 'aprobado', nombreComercial: 'Reventas' },
    });
    const cliente = await ctx.prisma.cliente.findFirstOrThrow({
      where: { usuarioId: e.clienteUsuario.id },
    });
    await ctx.prisma.cliente.update({ where: { id: cliente.id }, data: { revendedorId: rev.id } });
    const r = await e.cliente.pedir('PUT', `/mi/suscripciones/${suscripcionId}/cobro-automatico`, {
      metodoAutorizadoId: metodoId,
    });
    // Ya tenía el método enganchado: aun así, la tarea no le cobra.
    expect([200, 409]).toContain(r.estado);
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    expect(await ctx.prisma.cobroAutomatico.count()).toBe(0);
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { metodoAutorizadoId: null },
    });
    const otra = await e.cliente.pedir(
      'PUT',
      `/mi/suscripciones/${suscripcionId}/cobro-automatico`,
      {
        metodoAutorizadoId: metodoId,
      },
    );
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe('COBRO_AUTOMATICO_NO_DISPONIBLE');
  });
});

describe('cobro automático', () => {
  it('el día del vencimiento emite la renovación, la cobra y la suscripción se renueva', async () => {
    const e = await escenario();
    const { suscripcionId, venceEn } = await conCobroAutomatico(e);
    const ej = await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    expect(ej).toMatchObject({ estado: 'completada', procesados: 1, errores: 0 });
    const [c] = await ctx.prisma.cobroAutomatico.findMany();
    expect(c).toMatchObject({ estado: 'exitoso', intento: 1 });
    expect(c!.claveIdempotencia).toBe(`cobro:${c!.facturaId}:1`);
    const f = await ctx.prisma.factura.findUniqueOrThrow({ where: { id: c!.facturaId } });
    expect(f).toMatchObject({ estado: 'pagada', concepto: 'renovacion' });
    const pago = await ctx.prisma.pago.findUniqueOrThrow({ where: { id: c!.pagoId! } });
    expect(pago).toMatchObject({
      origen: 'pasarela',
      estado: 'confirmado',
      metodoCobroId: e.sandboxId,
    });
    const sub = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } });
    expect(sub.venceEn!.getTime()).toBeGreaterThan(venceEn.getTime() + 27 * DIA_MS);
    expect(await correos('cobroAutomaticoRealizado')).toHaveLength(1);
    // Otra pasada el mismo día no vuelve a cobrar.
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    expect(await ctx.prisma.cobroAutomatico.count()).toBe(1);
    expect(
      await ctx.prisma.operacionSandbox.count({
        where: { tipo: 'cobro', claveIdempotencia: { startsWith: 'cobro:' } },
      }),
    ).toBe(1);
    const lista = await e.operador.get('/cobros-automaticos?estado=exitoso');
    expect(lista.cuerpo.total).toBe(1);
    expect(lista.cuerpo.elementos[0]).toMatchObject({
      intento: 1,
      estado: 'exitoso',
      pagoId: pago.id,
    });
  });

  it('el día anterior avisa "mañana cobraremos"', async () => {
    const e = await escenario();
    const { suscripcionId } = await conCobroAutomatico(e);
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { venceEn: new Date(venceHoy().getTime() + DIA_MS) },
    });
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    const [aviso] = await correos('cobroAutomaticoProximo');
    expect(aviso?.asunto).toMatch(/^Mañana cobraremos USD 5\.00|^Mañana cobraremos/);
    expect(await ctx.prisma.cobroAutomatico.count()).toBe(0);
  });

  it('si falla, reintenta los días configurados después del vencimiento y luego se detiene', async () => {
    const e = await escenario();
    const { suscripcionId, metodoId } = await conCobroAutomatico(e);
    await s().sandbox.forzarToken(await tokenDe(metodoId), 'rechazar');
    const ahora = new Date();
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual', ahora });
    const base = inicioDiaCaracas(ahora).getTime();
    const esperados = [1, 3, 5].map((d) =>
      new Date(base + d * DIA_MS + 7 * 3600_000).toISOString(),
    );
    for (let n = 1; n <= 4; n += 1) {
      const cobros = await ctx.prisma.cobroAutomatico.findMany({ orderBy: { intento: 'asc' } });
      expect(cobros.filter((c) => c.estado === 'fallido')).toHaveLength(n);
      const siguiente = cobros.find((c) => c.estado === 'programado');
      if (n < 4) {
        expect(siguiente?.intento).toBe(n + 1);
        expect(siguiente?.programadoPara.toISOString()).toBe(esperados[n - 1]);
        // Antes de la hora no se ejecuta.
        await s().ejecutor.ejecutar('cobro_automatico', {
          disparo: 'manual',
          ahora: new Date(siguiente!.programadoPara.getTime() - 60_000),
        });
        expect(await ctx.prisma.cobroAutomatico.count({ where: { estado: 'fallido' } })).toBe(n);
        await s().ejecutor.ejecutar('cobro_automatico', {
          disparo: 'manual',
          ahora: siguiente!.programadoPara,
        });
      } else {
        expect(siguiente).toBeUndefined();
      }
    }
    expect(await ctx.prisma.cobroAutomatico.count()).toBe(4);
    expect(await ctx.prisma.pago.count({ where: { factura: { concepto: 'renovacion' } } })).toBe(0);
    const fallidos = await correos('cobroAutomaticoFallido');
    expect(fallidos).toHaveLength(4);
    expect(fallidos.some((c) => c.texto?.includes('Ya no lo intentaremos'))).toBe(true);
    // Sigue autorizado; la factura sigue abierta y el flujo normal de gracia continúa.
    expect(
      (await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } }))
        .metodoAutorizadoId,
    ).toBe(metodoId);
    expect(await ctx.prisma.factura.count({ where: { suscripcionId, estado: 'emitida' } })).toBe(1);
  });

  it('un reintento cobra si el problema se resolvió', async () => {
    const e = await escenario();
    const { metodoId } = await conCobroAutomatico(e);
    const token = await tokenDe(metodoId);
    await s().sandbox.forzarToken(token, 'rechazar');
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    await s().sandbox.forzarToken(token, null);
    const segundo = await ctx.prisma.cobroAutomatico.findFirstOrThrow({
      where: { estado: 'programado' },
    });
    await s().ejecutor.ejecutar('cobro_automatico', {
      disparo: 'manual',
      ahora: segundo.programadoPara,
    });
    expect(
      (await ctx.prisma.cobroAutomatico.findUniqueOrThrow({ where: { id: segundo.id } })).estado,
    ).toBe('exitoso');
    expect(await ctx.prisma.cobroAutomatico.count({ where: { estado: 'programado' } })).toBe(0);
  });

  it('sin autorización activa nunca se cobra', async () => {
    const e = await escenario();
    const { suscripcionId, metodoId } = await conCobroAutomatico(e);
    // Método guardado pero cobro automático desactivado en la suscripción.
    await e.cliente.pedir('PUT', `/mi/suscripciones/${suscripcionId}/cobro-automatico`, {
      metodoAutorizadoId: null,
    });
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    expect(await ctx.prisma.cobroAutomatico.count()).toBe(0);
    // Un cobro programado cuyo método se revocó por fuera de la API tampoco se ejecuta.
    const f = await ctx.prisma.factura.create({
      data: {
        clienteId: (
          await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })
        ).clienteId,
        suscripcionId,
        concepto: 'renovacion',
        moneda: 'USD',
        subtotal: '5',
        total: '5',
        tasa: '1',
        totalUsd: '5',
        venceEn: new Date(Date.now() + DIA_MS),
      },
    });
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { metodoAutorizadoId: metodoId },
    });
    await ctx.prisma.metodoPagoAutorizado.update({
      where: { id: metodoId },
      data: { estado: 'revocado', revocadoEn: new Date() },
    });
    await ctx.prisma.cobroAutomatico.create({
      data: {
        facturaId: f.id,
        suscripcionId,
        metodoId,
        intento: 1,
        programadoPara: new Date(Date.now() - 1000),
        claveIdempotencia: `cobro:${f.id}:1`,
      },
    });
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    const [c] = await ctx.prisma.cobroAutomatico.findMany();
    expect(c).toMatchObject({ estado: 'cancelado', error: 'La autorización ya no está activa.' });
    expect(
      await ctx.prisma.operacionSandbox.count({
        where: { claveIdempotencia: { startsWith: 'cobro:cobro:' } },
      }),
    ).toBe(0);
  });

  it('un token muerto deja el método inválido, lo desengancha y avisa', async () => {
    const e = await escenario();
    const { suscripcionId, metodoId } = await conCobroAutomatico(e);
    await s().sandbox.forzarToken(await tokenDe(metodoId), 'invalido');
    await s().ejecutor.ejecutar('cobro_automatico', { disparo: 'manual' });
    const m = await ctx.prisma.metodoPagoAutorizado.findUniqueOrThrow({ where: { id: metodoId } });
    expect(m.estado).toBe('invalido');
    expect(
      (await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } }))
        .metodoAutorizadoId,
    ).toBeNull();
    expect(await ctx.prisma.cobroAutomatico.count({ where: { estado: 'programado' } })).toBe(0);
    expect(await correos('metodoAutorizadoInvalido')).toHaveLength(1);
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'metodo_autorizado.invalidado' } }),
    ).toBe(1);
  });

  it('un webhook de token revocado invalida el método', async () => {
    const e = await escenario();
    const { metodoId } = await conCobroAutomatico(e);
    const token = await tokenDe(metodoId);
    const cuerpo = s().sandbox.cuerpoWebhook('token.revocado', token);
    expect((await webhook(cuerpo, s().sandbox.firmar(cuerpo))).statusCode).toBe(200);
    await s().trabajos.procesarTodo();
    expect(
      (await ctx.prisma.metodoPagoAutorizado.findUniqueOrThrow({ where: { id: metodoId } })).estado,
    ).toBe('invalido');
    // La carga guardada no tiene el token en claro.
    const ev = await ctx.prisma.eventoPasarela.findFirstOrThrow({
      where: { tipo: 'token.revocado' },
    });
    expect(JSON.stringify(ev.carga)).not.toContain(token);
  });
});

describe('webhooks', () => {
  it('firma inválida → 400 y no se guarda; repetido → 200 sin duplicar; el equipo reprocesa', async () => {
    const e = await escenario();
    const cuerpo = s().sandbox.cuerpoWebhook('orden.aprobada', 'sbx_ord_inexistente', 'evt_1');
    expect((await webhook(cuerpo, {})).statusCode).toBe(400);
    const mala = s().sandbox.firmar(cuerpo);
    mala[CABECERA_FIRMA_SANDBOX] = mala[CABECERA_FIRMA_SANDBOX]!.replace(
      /v1=(.)/,
      (_, c: string) => `v1=${c === '0' ? '1' : '0'}`,
    );
    expect((await webhook(cuerpo, mala)).statusCode).toBe(400);
    const vieja = s().sandbox.firmar(cuerpo, Math.floor(Date.now() / 1000) - 3600);
    expect((await webhook(cuerpo, vieja)).statusCode).toBe(400);
    expect((await webhook(`${cuerpo} `, s().sandbox.firmar(cuerpo))).statusCode).toBe(400);
    expect(await ctx.prisma.eventoPasarela.count()).toBe(0);

    const ok = await webhook(cuerpo, s().sandbox.firmar(cuerpo));
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ recibido: true, duplicado: false });
    const otra = await webhook(cuerpo, s().sandbox.firmar(cuerpo));
    expect(otra.json()).toEqual({ recibido: true, duplicado: true });
    expect(await ctx.prisma.eventoPasarela.count()).toBe(1);
    expect(await ctx.prisma.trabajo.count({ where: { tipo: 'pasarela.evento' } })).toBe(1);
    await s().trabajos.procesarTodo();
    const lista = await e.admin.get('/eventos-pasarela?estado=ignorado');
    expect(lista.cuerpo.total).toBe(1);
    const id = lista.cuerpo.elementos[0].id;
    expect((await e.operador.get('/eventos-pasarela')).estado).toBe(403);
    expect((await e.operador.post(`/eventos-pasarela/${id}/reprocesar`)).estado).toBe(403);
    const re = await e.admin.post(`/eventos-pasarela/${id}/reprocesar`);
    expect(re.estado).toBe(200);
    expect(re.cuerpo.estado).toBe('ignorado');
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'evento_pasarela.reprocesado' } }),
    ).toBe(1);

    // Cuerpo demasiado grande.
    const grande = JSON.stringify({ id: 'x', relleno: 'a'.repeat(300 * 1024) });
    expect((await webhook(grande, s().sandbox.firmar(grande))).statusCode).toBe(413);
    // Una pasarela sin configurar no recibe nada.
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pasarelas/paypal/webhook',
      payload: {},
    });
    expect(r.statusCode).toBe(404);
  });

  it('las rutas JSON normales siguen igual', async () => {
    const e = await escenario();
    const r = await e.admin.post('/finanzas/tasas', { moneda: 'VES', valor: '41' });
    expect(r.estado).toBe(201);
  });

  it('el equipo ve el estado de las pasarelas', async () => {
    const e = await escenario();
    const r = await e.admin.get('/pasarelas');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.map((p: { pasarela: string }) => p.pasarela)).toEqual([
      'paypal',
      'mercadopago',
      'sandbox',
    ]);
    expect(r.cuerpo[2]).toMatchObject({
      configurada: true,
      modo: 'pruebas',
      urlWebhook: `${ORIGEN}/api/v1/pasarelas/sandbox/webhook`,
    });
    expect(r.cuerpo[0]).toMatchObject({ configurada: false, monedas: ['USD', 'EUR'] });
    expect((await e.operador.get('/pasarelas')).estado).toBe(403);
  });
});

describe('devoluciones', () => {
  it('parcial y luego total, nunca por encima de lo recibido; solo administración', async () => {
    const e = await escenario();
    const { suscripcionId, facturaId } = await contratar(e);
    await pagarAprobado(e, facturaId);
    const pago = await ctx.prisma.pago.findFirstOrThrow();
    const ruta = `/pagos/${pago.id}/reembolsos`;

    expect(
      (await e.operador.post(ruta, { monto: '1.00', motivo: 'Pedido del cliente' })).estado,
    ).toBe(403);
    expect(
      (await e.cliente.post(ruta, { monto: '1.00', motivo: 'Pedido del cliente' })).estado,
    ).toBe(403);

    const parcial = await e.admin.pedir('POST', ruta, {
      monto: '2.00',
      motivo: 'Descuento acordado',
    });
    expect(parcial.estado).toBe(201);
    expect(parcial.cuerpo).toMatchObject({ monto: '2.00', moneda: 'USD', estado: 'completado' });
    let p = await e.admin.get(`/pagos/${pago.id}`);
    expect(p.cuerpo).toMatchObject({ estado: 'confirmado', montoReembolsado: '2.00' });

    const excede = await e.admin.post(ruta, { monto: '3.01', motivo: 'Demasiado' });
    expect(excede.estado).toBe(409);
    expect(excede.cuerpo.error.codigo).toBe('REEMBOLSO_EXCEDE');

    const resto = await e.admin.post(ruta, { motivo: 'Devolución total' });
    expect(resto.cuerpo).toMatchObject({ monto: '3.00', estado: 'completado' });
    p = await e.admin.get(`/pagos/${pago.id}`);
    expect(p.cuerpo).toMatchObject({ estado: 'reembolsado', montoReembolsado: '5.00' });
    expect((await e.admin.post(ruta, { motivo: 'Otra vez' })).estado).toBe(409);

    const lista = await e.operador.get(ruta);
    expect(lista.cuerpo.map((r: { monto: string }) => r.monto)).toEqual(['3.00', '2.00']);
    expect(await correos('reembolsoRealizado')).toHaveLength(2);
    expect(await ctx.prisma.auditoria.count({ where: { accion: 'reembolso.completado' } })).toBe(2);
    // La suscripción no se cancela sola.
    expect(
      (await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })).estado,
    ).toBe('activa');
  });

  it('la misma clave de idempotencia no devuelve dos veces y un pago manual no se devuelve por aquí', async () => {
    const e = await escenario();
    const { facturaId } = await contratar(e);
    await pagarAprobado(e, facturaId);
    const pago = await ctx.prisma.pago.findFirstOrThrow();
    const pedir = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/v1/pagos/${pago.id}/reembolsos`,
        headers: { origin: ORIGEN, cookie: e.admin.cookie!, 'idempotency-key': 'clave-unica-123' },
        payload: { monto: '1.00', motivo: 'Doble clic' },
      });
    const [a, b] = await Promise.all([pedir(), pedir()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 201]);
    expect(a.json().id).toBe(b.json().id);
    expect(
      (
        await ctx.prisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
      ).montoReembolsado.toFixed(2),
    ).toBe('1.00');
    expect(await ctx.prisma.operacionSandbox.count({ where: { tipo: 'reembolso' } })).toBe(1);

    // Pago manual (Zelle) confirmado por el equipo: no se devuelve por la pasarela.
    const otra = await contratar(e);
    const manual = await e.operador.formulario(`/facturas/${otra.facturaId}/pagos`, {
      metodoCobroId: e.zelleId,
      monto: '5',
      fechaPago: hoy(),
    });
    expect(manual.estado).toBe(201);
    const r = await e.admin.post(`/pagos/${manual.cuerpo.id}/reembolsos`, {
      motivo: 'No aplica aquí',
    });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error.codigo).toBe('REEMBOLSO_NO_PERMITIDO');
  });
});
