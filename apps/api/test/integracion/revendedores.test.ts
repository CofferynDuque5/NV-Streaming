import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  Navegador,
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

const DIA = 24 * 3600_000;

const comprobante = {
  campo: 'comprobante',
  nombre: 'recarga.png',
  tipo: 'image/png',
  contenido: PNG_1X1,
};

/**
 * Catálogo de cobros (plan mensual de 5 USD, VES = 40, Pago Móvil y Zelle),
 * el plan revendible con costo 2 USD, el nivel Plata y su precio mayorista de 4 USD.
 */
async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  await ctx.prisma.proveedor.updateMany({ data: { permiteReventa: true } });
  const plan = await admin.n.patch(`/catalogo/planes/${catalogo.planId}`, {
    revendible: true,
    costoUsd: '2.00',
  });
  expect(plan.cuerpo).toMatchObject({ revendible: true, costoUsd: '2.00' });
  const nivel = await admin.n.post('/revendedores/niveles', {
    nombre: 'Plata',
    descripcion: 'Precio intermedio',
  });
  expect(nivel.estado).toBe(201);
  const precio = await admin.n.pedir('PUT', '/revendedores/precios', {
    planId: catalogo.planId,
    nivelId: nivel.cuerpo.id,
    precioUsd: '4',
  });
  expect(precio.cuerpo).toEqual({
    planId: catalogo.planId,
    nivelId: nivel.cuerpo.id,
    precioUsd: '4.00',
  });
  return { admin: admin.n, operador: operador.n, nivelId: nivel.cuerpo.id as string, ...catalogo };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

/** Un cliente solicita, administración lo aprueba y vuelve a entrar (con 2FA) como revendedor. */
async function nuevoRevendedor(e: Escenario, limiteDiarioCompras?: number) {
  const { usuario, n } = await conectar(ctx, 'cliente');
  const sol = await n.post('/revendedor/solicitud', {
    nombreComercial: `Tienda ${usuario.nombre}`,
    telefono: '+58 414 000 0000',
  });
  expect(sol.estado).toBe(201);
  const ap = await e.admin.post(`/revendedores/${sol.cuerpo.id}/aprobar`, {
    nivelId: e.nivelId,
    ...(limiteDiarioCompras ? { limiteDiarioCompras } : {}),
  });
  expect(ap.estado).toBe(200);
  await n.entrarCompleto(usuario.correo);
  return { n, usuario, id: sol.cuerpo.id as string };
}

async function recargar(
  e: Escenario,
  n: Navegador,
  monto: string,
  campos: Record<string, string> = {},
) {
  return n.formulario(
    '/revendedor/recargas',
    { metodoCobroId: e.zelleId, moneda: 'USD', monto, fechaPago: hoy(), ...campos },
    comprobante,
  );
}

/** Revendedor aprobado con saldo ya conciliado (recarga en USD confirmada por operación). */
async function revendedorConSaldo(e: Escenario, saldo: string, limiteDiarioCompras?: number) {
  const r = await nuevoRevendedor(e, limiteDiarioCompras);
  const rec = await recargar(e, r.n, saldo);
  expect(rec.estado).toBe(201);
  const ok = await e.operador.post(`/recargas-saldo/${rec.cuerpo.id}/confirmar`, {
    montoRecibido: saldo,
  });
  expect(ok.estado).toBe(200);
  return r;
}

const alta = (e: Escenario, extra: Record<string, unknown> = {}) => ({
  tipo: 'alta',
  planId: e.planId,
  cliente: { nombre: 'Ana Pérez', correo: 'ana@cliente.test', whatsapp: '+58 412 111 2233' },
  claveIdempotencia: randomUUID(),
  ...extra,
});

describe('solicitud y revisión', () => {
  it('aprobar cambia el rol, cierra sus sesiones y conserva su ficha de cliente', async () => {
    const e = await escenario();
    const { usuario, n } = await conectar(ctx, 'cliente');
    expect((await n.get('/revendedor/solicitud')).cuerpo).toEqual({ solicitud: null });
    const sol = await n.post('/revendedor/solicitud', {
      nombreComercial: '  Streaming Caracas ',
      documento: 'J-12345678-9',
      mensaje: 'Vendo en Caracas desde 2020.',
    });
    expect(sol.estado).toBe(201);
    expect(sol.cuerpo).toMatchObject({
      estado: 'solicitud',
      nombreComercial: 'Streaming Caracas',
      pais: 'VE',
    });
    expect(
      (await n.post('/revendedor/solicitud', { nombreComercial: 'Otra' })).cuerpo.error.codigo,
    ).toBe('SOLICITUD_EXISTENTE');
    // Su ficha de cliente existe antes de aprobar (se crea al usar su panel).
    await n.get('/mi/resumen');
    const ficha = await ctx.prisma.cliente.findUniqueOrThrow({ where: { usuarioId: usuario.id } });

    const cola = await e.admin.get('/revendedores?estado=solicitud');
    expect(cola.cuerpo.total).toBe(1);
    expect((await e.admin.get('/revendedores/resumen')).cuerpo.solicitudes).toBe(1);
    const sinNivel = await e.admin.post(`/revendedores/${sol.cuerpo.id}/aprobar`, {});
    expect(sinNivel.estado).toBe(400);
    const ap = await e.admin.post(`/revendedores/${sol.cuerpo.id}/aprobar`, {
      nivelId: e.nivelId,
      limiteDiarioCompras: 20,
    });
    expect(ap.cuerpo).toMatchObject({
      estado: 'aprobado',
      nivel: { id: e.nivelId, nombre: 'Plata' },
      limiteDiarioCompras: 20,
      saldoUsd: '0.00',
    });
    expect(
      (await e.admin.post(`/revendedores/${sol.cuerpo.id}/aprobar`, { nivelId: e.nivelId })).estado,
    ).toBe(409);

    // Su sesión quedó cerrada; al volver a entrar debe configurar la verificación en dos pasos.
    expect((await n.get('/auth/sesion')).estado).toBe(401);
    const entrada = await n.entrar(usuario.correo);
    expect(entrada.cuerpo.pendiente).toBe('configurar_2fa');
    await n.entrarCompleto(usuario.correo);
    const sesion = await n.get('/auth/sesion');
    expect(sesion.cuerpo.usuario.rol).toBe('revendedor');
    expect(sesion.cuerpo.permisos).toContain('reventa.usar');
    expect((await n.get('/revendedor/resumen')).cuerpo.revendedor.estado).toBe('aprobado');
    expect((await n.get('/mi/resumen')).estado).toBe(403);

    // La ficha de cliente y su historial siguen intactos.
    const despues = await ctx.prisma.cliente.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(despues.usuarioId).toBe(usuario.id);
    const acciones = (await ctx.prisma.auditoria.findMany()).map((a) => a.accion);
    expect(acciones).toEqual(
      expect.arrayContaining([
        'revendedor.solicitado',
        'revendedor.aprobado',
        'usuario.rol_cambiado',
      ]),
    );
  });

  it('un rechazo deja el motivo visible y permite volver a solicitar', async () => {
    const e = await escenario();
    const { usuario, n } = await conectar(ctx, 'cliente');
    const sol = await n.post('/revendedor/solicitud', { nombreComercial: 'Mi Tienda' });
    const corto = await e.admin.post(`/revendedores/${sol.cuerpo.id}/rechazar`, { motivo: 'no' });
    expect(corto.estado).toBe(400);
    const r = await e.admin.post(`/revendedores/${sol.cuerpo.id}/rechazar`, {
      motivo: 'Faltan los datos fiscales.',
    });
    expect(r.cuerpo).toMatchObject({
      estado: 'rechazado',
      motivoEstado: 'Faltan los datos fiscales.',
    });
    expect((await n.get('/revendedor/solicitud')).cuerpo.solicitud).toMatchObject({
      estado: 'rechazado',
      motivoEstado: 'Faltan los datos fiscales.',
    });
    expect((await ctx.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).rol).toBe(
      'cliente',
    );
    const otra = await n.post('/revendedor/solicitud', {
      nombreComercial: 'Mi Tienda C.A.',
      documento: 'J-1',
    });
    expect(otra.cuerpo).toMatchObject({
      id: sol.cuerpo.id,
      estado: 'solicitud',
      motivoEstado: null,
      nombreComercial: 'Mi Tienda C.A.',
    });
    expect(await ctx.prisma.revendedor.count()).toBe(1);
  });

  it('suspender bloquea recargas y compras pero deja ver el panel; reactivar las devuelve', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    const s = await e.admin.post(`/revendedores/${r.id}/suspender`, {
      motivo: 'Revisión de pagos',
    });
    expect(s.cuerpo).toMatchObject({ estado: 'suspendido', motivoEstado: 'Revisión de pagos' });
    const panel = await r.n.get('/revendedor/resumen');
    expect(panel.estado).toBe(200);
    expect(panel.cuerpo.revendedor).toMatchObject({ estado: 'suspendido', saldoUsd: '10.00' });
    const compra = await r.n.post('/revendedor/compras', alta(e));
    expect(compra.estado).toBe(403);
    expect(compra.cuerpo.error.codigo).toBe('REVENDEDOR_SUSPENDIDO');
    expect((await recargar(e, r.n, '5')).cuerpo.error.codigo).toBe('REVENDEDOR_SUSPENDIDO');
    await e.admin.post(`/revendedores/${r.id}/reactivar`, { motivo: 'Pagos verificados' });
    expect((await r.n.post('/revendedor/compras', alta(e))).estado).toBe(201);
  });
});

describe('niveles y precios mayoristas', () => {
  it('el precio mayorista nunca queda por debajo del costo del plan', async () => {
    const e = await escenario();
    const bajo = await e.admin.pedir('PUT', '/revendedores/precios', {
      planId: e.planId,
      nivelId: e.nivelId,
      precioUsd: '1.50',
    });
    expect(bajo.estado).toBe(409);
    expect(bajo.cuerpo.error.codigo).toBe('PRECIO_BAJO_COSTO');
    const cero = await e.admin.pedir('PUT', '/revendedores/precios', {
      planId: e.planId,
      nivelId: e.nivelId,
      precioUsd: '0',
    });
    expect(cero.estado).toBe(400);
    // Subir el costo por encima de un precio ya fijado también se rechaza.
    const costo = await e.admin.patch(`/catalogo/planes/${e.planId}`, { costoUsd: '4.50' });
    expect(costo.cuerpo.error.codigo).toBe('PRECIO_BAJO_COSTO');
    expect(
      (await e.admin.patch(`/catalogo/planes/${e.planId}`, { costoUsd: '' })).cuerpo.costoUsd,
    ).toBeNull();
    // El costo nunca llega al catálogo público.
    const publico = await new Navegador(ctx.app).get('/catalogo');
    expect(publico.cuerpo.planes[0]).not.toHaveProperty('costoUsd');
    const tabla = await e.admin.get('/revendedores/precios');
    expect(tabla.cuerpo.planes[0].precios[e.nivelId]).toBe('4.00');
  });

  it('solo se venden planes revendibles de proveedores que permiten la reventa', async () => {
    const e = await escenario();
    const otro = await e.admin.post('/catalogo/planes', {
      servicioId: e.servicioId,
      nombre: 'Solo público',
      precioUsd: '9',
      duracionCantidad: 1,
      duracionUnidad: 'mes',
    });
    const r1 = await e.admin.pedir('PUT', '/revendedores/precios', {
      planId: otro.cuerpo.id,
      nivelId: e.nivelId,
      precioUsd: '6',
    });
    expect(r1.cuerpo.error.codigo).toBe('PLAN_NO_REVENDIBLE');

    const r = await revendedorConSaldo(e, '20');
    const noRevendible = await r.n.post('/revendedor/compras', alta(e, { planId: otro.cuerpo.id }));
    expect(noRevendible.cuerpo.error.codigo).toBe('PLAN_NO_REVENDIBLE');

    const catalogo = await r.n.get('/revendedor/catalogo');
    expect(catalogo.cuerpo).toMatchObject({
      nivel: { id: e.nivelId, nombre: 'Plata' },
      tasaVes: '40.00',
      planes: [{ id: e.planId, precioUsd: '4.00', precioVes: '160.00', precioPublicoUsd: '5.00' }],
    });
    // Si el acuerdo con el proveedor deja de permitir la reventa, el plan sale del catálogo.
    await ctx.prisma.proveedor.updateMany({ data: { permiteReventa: false } });
    expect((await r.n.get('/revendedor/catalogo')).cuerpo.planes).toHaveLength(0);
    expect((await r.n.post('/revendedor/compras', alta(e))).cuerpo.error.codigo).toBe(
      'PLAN_NO_REVENDIBLE',
    );
    // Un nivel sin precio para el plan tampoco puede comprarlo.
    await ctx.prisma.proveedor.updateMany({ data: { permiteReventa: true } });
    const oro = await e.admin.post('/revendedores/niveles', { nombre: 'Oro' });
    await e.admin.patch(`/revendedores/${r.id}`, { nivelId: oro.cuerpo.id });
    expect((await r.n.post('/revendedor/compras', alta(e))).cuerpo.error.codigo).toBe(
      'SIN_PRECIO_MAYORISTA',
    );
    expect((await e.admin.post('/revendedores/niveles', { nombre: 'Oro' })).estado).toBe(409);
  });
});

describe('recargas de saldo', () => {
  it('reportar en bolívares fija la tasa; confirmar acredita lo recibido y lo registra', async () => {
    const e = await escenario();
    const r = await nuevoRevendedor(e);
    const base = {
      metodoCobroId: e.pagoMovilId,
      moneda: 'VES',
      monto: '400',
      referenciaExterna: 'PM-778899',
      fechaPago: hoy(),
    };
    expect((await r.n.formulario('/revendedor/recargas', base)).estado).toBe(400);
    const otraMoneda = await r.n.formulario(
      '/revendedor/recargas',
      { ...base, moneda: 'USD' },
      comprobante,
    );
    expect(otraMoneda.cuerpo.error.campos.metodoCobroId).toBeDefined();
    const rec = await r.n.formulario('/revendedor/recargas', base, comprobante);
    expect(rec.estado).toBe(201);
    expect(rec.cuerpo).toMatchObject({
      estado: 'en_revision',
      moneda: 'VES',
      montoDeclarado: '400.00',
      tasa: '40.000000',
      montoUsdEstimado: '10.00',
      montoUsd: null,
      tieneComprobante: true,
    });
    expect(rec.cuerpo.referencia).toMatch(/^R-[2-9A-Z]{8}$/);
    expect(rec.cuerpo).not.toHaveProperty('notas');
    // La tasa queda fijada aunque cambie después.
    await e.admin.post('/finanzas/tasas', { moneda: 'VES', valor: '50' });
    const repetida = await r.n.formulario('/revendedor/recargas', base, comprobante);
    expect(repetida.cuerpo.error.codigo).toBe('REFERENCIA_REPETIDA');

    const cola = await e.operador.get('/recargas-saldo?estado=en_revision');
    expect(cola.cuerpo.total).toBe(1);
    const ok = await e.operador.post(`/recargas-saldo/${rec.cuerpo.id}/confirmar`, {
      montoRecibido: '380',
      notas: 'Llegó menos',
    });
    expect(ok.cuerpo).toMatchObject({
      estado: 'confirmada',
      montoRecibido: '380.00',
      montoUsd: '9.50',
      notas: 'Llegó menos',
    });
    expect(
      (await e.operador.post(`/recargas-saldo/${rec.cuerpo.id}/confirmar`, { montoRecibido: '1' }))
        .cuerpo.error.codigo,
    ).toBe('RECARGA_YA_REVISADA');
    const libro = await r.n.get('/revendedor/movimientos');
    expect(libro.cuerpo.elementos).toEqual([
      expect.objectContaining({
        tipo: 'recarga',
        montoUsd: '9.50',
        saldoResultanteUsd: '9.50',
        recarga: { id: rec.cuerpo.id, referencia: rec.cuerpo.referencia },
        autor: null,
      }),
    ]);
    const resumen = await r.n.get('/revendedor/resumen');
    // Saldo en bolívares a la tasa vigente (50).
    expect(resumen.cuerpo).toMatchObject({ saldoVes: '475.00', tasaVes: '50.00' });
    expect(resumen.cuerpo.revendedor.saldoUsd).toBe('9.50');
    expect((await e.admin.get('/revendedores/resumen')).cuerpo).toMatchObject({
      recargasMesUsd: '9.50',
      saldoTotalUsd: '9.50',
    });
    const acciones = (await ctx.prisma.auditoria.findMany()).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(['recarga.reportada', 'recarga.confirmada']));
  });

  it('un rechazo no mueve el saldo; el comprobante solo lo ven su dueño y quien concilia', async () => {
    const e = await escenario();
    const r = await nuevoRevendedor(e);
    const rec = await recargar(e, r.n, '15');
    const no = await e.operador.post(`/recargas-saldo/${rec.cuerpo.id}/rechazar`, {
      motivo: 'No llegó a la cuenta.',
    });
    expect(no.cuerpo).toMatchObject({
      estado: 'rechazada',
      motivoRechazo: 'No llegó a la cuenta.',
    });
    expect(await ctx.prisma.movimientoSaldo.count()).toBe(0);
    const propio = await r.n.get('/revendedor/recargas');
    expect(propio.cuerpo.elementos[0]).toMatchObject({ estado: 'rechazada' });

    expect((await r.n.descargar(`/revendedor/recargas/${rec.cuerpo.id}/comprobante`)).estado).toBe(
      200,
    );
    expect(
      (await e.operador.descargar(`/recargas-saldo/${rec.cuerpo.id}/comprobante`)).estado,
    ).toBe(200);
    const otro = await nuevoRevendedor(e);
    expect(
      (await otro.n.descargar(`/revendedor/recargas/${rec.cuerpo.id}/comprobante`)).estado,
    ).toBe(404);
    expect((await otro.n.get('/revendedor/recargas')).cuerpo.total).toBe(0);
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/recargas-saldo')).estado).toBe(403);
  });
});

describe('compras con saldo', () => {
  it('compra un alta para un cliente nuevo, sin factura, y repetir la clave no cobra dos veces', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    const pedido = alta(e);
    const c = await r.n.post('/revendedor/compras', pedido);
    expect(c.estado).toBe(201);
    expect(c.cuerpo).toMatchObject({
      repetida: false,
      saldoUsd: '6.00',
      compra: {
        tipo: 'alta',
        estado: 'completada',
        precioUsd: '4.00',
        cliente: { nombre: 'Ana Pérez' },
        suscripcion: { estado: 'activa' },
      },
    });
    const vence = new Date(c.cuerpo.compra.suscripcion.venceEn).getTime();
    expect(vence - Date.now()).toBeGreaterThan(27 * DIA);
    expect(vence - Date.now()).toBeLessThan(32 * DIA);

    const otra = await r.n.post('/revendedor/compras', pedido);
    expect(otra.cuerpo).toMatchObject({ repetida: true, saldoUsd: '6.00' });
    expect(otra.cuerpo.compra.id).toBe(c.cuerpo.compra.id);
    const otroPlan = await r.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: c.cuerpo.compra.suscripcion.id,
      claveIdempotencia: pedido.claveIdempotencia,
    });
    expect(otroPlan.cuerpo.error.codigo).toBe('CLAVE_REUTILIZADA');

    expect(await ctx.prisma.compraRevendedor.count()).toBe(1);
    expect(await ctx.prisma.movimientoSaldo.count({ where: { tipo: 'compra' } })).toBe(1);
    expect(await ctx.prisma.factura.count()).toBe(0);
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: c.cuerpo.compra.suscripcion.id },
      include: { cliente: { include: { contactos: true } }, eventos: true },
    });
    expect(s.revendedorId).toBe(r.id);
    expect(s.cliente.revendedorId).toBe(r.id);
    // El correo del cliente final es un contacto, no un correo de acceso a NV.
    expect(s.cliente.correo).toBeNull();
    expect(s.cliente.contactos.map((k) => k.tipo).sort()).toEqual(['correo', 'whatsapp']);
    expect(s.eventos.map((x) => x.tipo).sort()).toEqual(['activacion', 'alta']);

    const cartera = await r.n.get('/revendedor/clientes');
    expect(cartera.cuerpo.elementos[0]).toMatchObject({
      nombre: 'Ana Pérez',
      correo: 'ana@cliente.test',
      whatsapp: '+584121112233',
    });
    expect(cartera.cuerpo.elementos[0].suscripciones[0].estado).toBe('activa');
    const resumen = await r.n.get('/revendedor/resumen');
    expect(resumen.cuerpo).toMatchObject({ comprasMes: 1, gastoMesUsd: '4.00', comprasHoy: 1 });
  });

  it('una segunda alta para un cliente de la cartera y la renovación extienden desde el vencimiento', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20');
    const primera = await r.n.post('/revendedor/compras', alta(e));
    const clienteId = primera.cuerpo.compra.cliente.id;
    const segunda = await r.n.post(
      '/revendedor/compras',
      alta(e, { cliente: undefined, clienteId }),
    );
    expect(segunda.estado).toBe(201);
    expect(segunda.cuerpo.compra.cliente.id).toBe(clienteId);
    expect(await ctx.prisma.cliente.count({ where: { revendedorId: r.id } })).toBe(1);

    const subId = primera.cuerpo.compra.suscripcion.id;
    const antes = new Date(primera.cuerpo.compra.suscripcion.venceEn);
    const ren = await r.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: subId,
      claveIdempotencia: randomUUID(),
    });
    expect(ren.cuerpo).toMatchObject({ saldoUsd: '8.00', compra: { tipo: 'renovacion' } });
    const despues = new Date(ren.cuerpo.compra.suscripcion.venceEn);
    expect(despues.getUTCMonth()).toBe((antes.getUTCMonth() + 1) % 12);
    const eventos = await ctx.prisma.eventoSuscripcion.findMany({
      where: { suscripcionId: subId },
      orderBy: { creadoEn: 'asc' },
    });
    expect(eventos.map((x) => x.tipo)).toEqual(['alta', 'activacion', 'renovacion']);
  });

  it('sin saldo suficiente responde un error claro y no crea nada', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '3');
    const c = await r.n.post('/revendedor/compras', alta(e));
    expect(c.estado).toBe(409);
    expect(c.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');
    expect(c.cuerpo.error.mensaje).toContain('no alcanza');
    expect(await ctx.prisma.compraRevendedor.count()).toBe(0);
    expect(await ctx.prisma.suscripcion.count()).toBe(0);
    expect(await ctx.prisma.cliente.count({ where: { revendedorId: r.id } })).toBe(0);
  });

  it('respeta el límite diario de compras', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20', 1);
    expect((await r.n.post('/revendedor/compras', alta(e))).estado).toBe(201);
    const segunda = await r.n.post('/revendedor/compras', alta(e));
    expect(segunda.estado).toBe(409);
    expect(segunda.cuerpo.error.codigo).toBe('LIMITE_DIARIO');
    await e.admin.patch(`/revendedores/${r.id}`, { limiteDiarioCompras: null });
    expect((await r.n.post('/revendedor/compras', alta(e))).estado).toBe(201);
  });

  it('compras simultáneas nunca gastan más saldo del que hay', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => r.n.post('/revendedor/compras', alta(e))),
    );
    const estados = respuestas.map((x) => x.estado).sort();
    expect(estados).toEqual([201, 201, 409, 409, 409]);
    const fila = await ctx.prisma.revendedor.findUniqueOrThrow({ where: { id: r.id } });
    expect(fila.saldoUsd.toFixed(2)).toBe('2.00');
    const movimientos = await ctx.prisma.movimientoSaldo.findMany({
      where: { revendedorId: r.id },
    });
    const suma = movimientos.reduce((s, m) => s + Number(m.montoUsd), 0);
    expect(suma.toFixed(2)).toBe('2.00');
    expect(await ctx.prisma.compraRevendedor.count()).toBe(2);
    expect(await ctx.prisma.suscripcion.count()).toBe(2);
  });

  it('un revendedor no ve ni toca clientes, suscripciones ni compras de otro (404)', async () => {
    const e = await escenario();
    const a = await revendedorConSaldo(e, '10');
    const b = await revendedorConSaldo(e, '10');
    const c = await a.n.post('/revendedor/compras', alta(e));
    const clienteId = c.cuerpo.compra.cliente.id;
    const subId = c.cuerpo.compra.suscripcion.id;
    expect((await b.n.get(`/revendedor/clientes/${clienteId}`)).estado).toBe(404);
    expect((await b.n.get('/revendedor/clientes')).cuerpo.total).toBe(0);
    expect((await b.n.get('/revendedor/compras')).cuerpo.total).toBe(0);
    const ajena = await b.n.post('/revendedor/compras', alta(e, { cliente: undefined, clienteId }));
    expect(ajena.estado).toBe(404);
    const renovar = await b.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: subId,
      claveIdempotencia: randomUUID(),
    });
    expect(renovar.estado).toBe(404);
    // Un cliente normal de NV tampoco es de la cartera de nadie.
    const normal = await e.operador.post('/clientes', { nombre: 'Cliente de NV' });
    expect((await a.n.get(`/revendedor/clientes/${normal.cuerpo.id}`)).estado).toBe(404);
    expect((await b.n.get('/revendedor/resumen')).cuerpo.revendedor.saldoUsd).toBe('10.00');
  });
});

describe('reembolsos, ajustes y libro mayor', () => {
  it('reembolsar devuelve el precio una sola vez y cancela la suscripción', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    const c = await r.n.post('/revendedor/compras', alta(e));
    const id = c.cuerpo.compra.id;
    expect(
      (await e.operador.post(`/revendedores/compras/${id}/reembolsar`, { motivo: 'Error' })).estado,
    ).toBe(403);
    const [uno, dos] = await Promise.all([
      e.admin.post(`/revendedores/compras/${id}/reembolsar`, { motivo: 'Cliente duplicado' }),
      e.admin.post(`/revendedores/compras/${id}/reembolsar`, { motivo: 'Cliente duplicado' }),
    ]);
    expect([uno.estado, dos.estado].sort()).toEqual([200, 409]);
    const ok = uno.estado === 200 ? uno : dos;
    expect(ok.cuerpo).toMatchObject({
      estado: 'reembolsada',
      motivoReembolso: 'Cliente duplicado',
      suscripcion: { estado: 'cancelada' },
    });
    expect((await r.n.get('/revendedor/resumen')).cuerpo.revendedor.saldoUsd).toBe('10.00');
    expect(await ctx.prisma.movimientoSaldo.count({ where: { tipo: 'reembolso' } })).toBe(1);
    const libro = await e.admin.get(`/revendedores/${r.id}/movimientos`);
    expect(libro.cuerpo.elementos.map((m: { tipo: string }) => m.tipo)).toEqual([
      'reembolso',
      'compra',
      'recarga',
    ]);
    expect(libro.cuerpo.elementos[0].autor).toMatchObject({ nombre: expect.any(String) });
    expect((await e.admin.get(`/revendedores/${r.id}/compras`)).cuerpo.elementos[0].estado).toBe(
      'reembolsada',
    );
  });

  it('los ajustes llevan motivo y nunca dejan el saldo en negativo; el libro no se edita', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    expect((await e.admin.post(`/revendedores/${r.id}/ajustes`, { montoUsd: '5' })).estado).toBe(
      400,
    );
    const mas = await e.admin.post(`/revendedores/${r.id}/ajustes`, {
      montoUsd: '5',
      motivo: 'Bonificación por volumen',
    });
    expect(mas.cuerpo).toMatchObject({
      tipo: 'ajuste',
      montoUsd: '5.00',
      saldoResultanteUsd: '15.00',
    });
    const demasiado = await e.admin.post(`/revendedores/${r.id}/ajustes`, {
      montoUsd: '-15.01',
      motivo: 'Corrección',
    });
    expect(demasiado.estado).toBe(409);
    expect(demasiado.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');
    const menos = await e.admin.post(`/revendedores/${r.id}/ajustes`, {
      montoUsd: '-15',
      motivo: 'Corrección de una recarga duplicada',
    });
    expect(menos.cuerpo.saldoResultanteUsd).toBe('0.00');
    expect(
      (await e.operador.post(`/revendedores/${r.id}/ajustes`, { montoUsd: '1', motivo: 'Bono' }))
        .estado,
    ).toBe(403);
    const primero = await ctx.prisma.movimientoSaldo.findFirstOrThrow();
    await expect(
      ctx.prisma.movimientoSaldo.update({ where: { id: primero.id }, data: { motivo: 'x' } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.movimientoSaldo.delete({ where: { id: primero.id } }),
    ).rejects.toThrow();
  });
});

describe('permisos', () => {
  it('cada rol solo llega a lo suyo', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '5');
    const ventas = await conectar(ctx, 'ventas');
    const cliente = await conectar(ctx, 'cliente');
    for (const ruta of ['/revendedores', `/revendedores/${r.id}`, '/revendedores/precios']) {
      expect((await ventas.n.get(ruta)).estado).toBe(403);
      expect((await cliente.n.get(ruta)).estado).toBe(403);
    }
    expect((await ventas.n.post(`/revendedores/${r.id}/suspender`, { motivo: 'xxx' })).estado).toBe(
      403,
    );
    expect((await cliente.n.post('/revendedor/compras', alta(e))).estado).toBe(403);
    expect((await cliente.n.get('/revendedor/resumen')).estado).toBe(403);
    expect(
      (await ventas.n.post('/revendedor/solicitud', { nombreComercial: 'Ventas' })).estado,
    ).toBe(403);
    expect((await r.n.post('/revendedor/solicitud', { nombreComercial: 'Otra vez' })).estado).toBe(
      403,
    );
    expect((await r.n.get('/revendedores')).estado).toBe(403);
    // Operación ve el programa y concilia recargas, pero no aprueba ni fija precios.
    expect((await e.operador.get('/revendedores')).estado).toBe(200);
    expect(
      (
        await e.operador.pedir('PUT', '/revendedores/precios', {
          planId: e.planId,
          nivelId: e.nivelId,
          precioUsd: '5',
        })
      ).estado,
    ).toBe(403);
    expect((await e.operador.post('/revendedores/niveles', { nombre: 'Bronce' })).estado).toBe(403);
  });
});

describe('pantallas del panel del revendedor', () => {
  it('saldo con recargas por estado y cifras de 30 días; movimientos por tipo; accesos sin ver', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '10');
    expect((await recargar(e, r.n, '5')).estado).toBe(201);
    const rechazada = await recargar(e, r.n, '3');
    expect(
      (
        await e.operador.post(`/recargas-saldo/${rechazada.cuerpo.id}/rechazar`, {
          motivo: 'No llegó el pago',
        })
      ).estado,
    ).toBe(200);
    const compra = await r.n.post('/revendedor/compras', alta(e));
    expect(compra.estado).toBe(201);

    const saldo = await r.n.get('/revendedor/saldo');
    expect(saldo.estado).toBe(200);
    expect(saldo.cuerpo).toEqual({
      saldoUsd: '6.00',
      recargasPorEstado: { en_revision: 1, confirmada: 1, rechazada: 1 },
      totalMovimientos: 2,
      ultimos30Dias: { entradasUsd: '10.00', salidasUsd: '4.00' },
    });

    const compras = await r.n.get('/revendedor/movimientos?tipo=compra');
    expect(compras.cuerpo.total).toBe(1);
    expect(compras.cuerpo.elementos[0]).toMatchObject({
      tipo: 'compra',
      montoUsd: '-4.00',
      compra: { tipo: 'alta', cliente: 'Ana Pérez' },
    });
    // La compra trae el slug y el universo del servicio para su imagen.
    expect(compra.cuerpo.compra.plan).toMatchObject({ servicioSlug: 'nv-cine' });
    expect(compra.cuerpo.compra.plan).toHaveProperty('categoria');
    const recargas = await r.n.get('/revendedor/movimientos?tipo=recarga');
    expect(recargas.cuerpo.elementos.map((m: { tipo: string }) => m.tipo)).toEqual(['recarga']);
    expect((await r.n.get('/revendedor/movimientos?tipo=reembolso')).cuerpo.total).toBe(0);
    expect((await r.n.get('/revendedor/movimientos?tipo=pago')).estado).toBe(400);
    expect((await r.n.get('/revendedor/movimientos')).cuerpo.total).toBe(2);

    // Un acceso entregado y sin mostrar cuenta en el resumen hasta que se ve.
    expect((await r.n.get('/revendedor/resumen')).cuerpo.accesosSinVer).toBe(0);
    // La compra deja su entrega en preparación; aquí se da por entregada.
    const entrega = await ctx.prisma.entrega.update({
      where: { claveIdempotencia: `compra:${compra.cuerpo.compra.id}` },
      data: { estado: 'entregada', datosCifrados: 'cifrado-de-prueba', entregadaEn: new Date() },
    });
    expect((await r.n.get('/revendedor/resumen')).cuerpo.accesosSinVer).toBe(1);
    await ctx.prisma.entrega.update({ where: { id: entrega.id }, data: { vistaEn: new Date() } });
    expect((await r.n.get('/revendedor/resumen')).cuerpo.accesosSinVer).toBe(0);

    // Lo de otro revendedor no cuenta.
    const otro = await revendedorConSaldo(e, '1');
    expect((await otro.n.get('/revendedor/saldo')).cuerpo).toMatchObject({
      saldoUsd: '1.00',
      totalMovimientos: 1,
      recargasPorEstado: { en_revision: 0, confirmada: 1, rechazada: 0 },
    });
  });

  it('la cartera se filtra por servicios por vencer o atrasados y el catálogo trae el servicio', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20');
    const nombres = ['Ana Pérez', 'Beto Ruiz', 'Carla Díaz'];
    const subs: string[] = [];
    for (const nombre of nombres) {
      const c = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre } }));
      expect(c.estado).toBe(201);
      subs.push(c.cuerpo.compra.suscripcion.id);
    }
    // Ana vence en 3 días, Beto está en gracia y Carla vence en un mes.
    await ctx.prisma.suscripcion.update({
      where: { id: subs[0] },
      data: { venceEn: new Date(Date.now() + 3 * DIA) },
    });
    await ctx.prisma.suscripcion.update({
      where: { id: subs[1] },
      data: { estado: 'en_gracia', venceEn: new Date(Date.now() - DIA) },
    });
    const lista = async (q: string) => {
      const p = await r.n.get(`/revendedor/clientes?${q}`);
      expect(p.estado).toBe(200);
      return {
        total: p.cuerpo.total,
        nombres: p.cuerpo.elementos.map((c: { nombre: string }) => c.nombre),
      };
    };
    expect(await lista('')).toEqual({ total: 3, nombres });
    expect(await lista('filtro=por_vencer')).toEqual({ total: 1, nombres: ['Ana Pérez'] });
    expect(await lista('filtro=atrasados')).toEqual({ total: 1, nombres: ['Beto Ruiz'] });
    expect(await lista('filtro=atrasados&busqueda=ana')).toEqual({ total: 0, nombres: [] });
    expect((await r.n.get('/revendedor/clientes?filtro=otro')).estado).toBe(400);
    // El resumen cuenta a Ana y a Beto entre los próximos vencimientos.
    const resumen = await r.n.get('/revendedor/resumen');
    expect(resumen.cuerpo.proximosVencimientos.map((s: { id: string }) => s.id).sort()).toEqual(
      [subs[0], subs[1]].sort(),
    );

    const catalogo = await r.n.get('/revendedor/catalogo');
    expect(catalogo.cuerpo.planes[0]).toMatchObject({
      precioUsd: '4.00',
      precioPublicoUsd: '5.00',
      servicio: { nombre: expect.any(String), slug: 'nv-cine' },
    });
    expect(catalogo.cuerpo.planes[0].servicio).toHaveProperty('categoria');
  });
});

describe('ventas, cartera y renovaciones del panel', () => {
  /** Día de Venezuela (UTC−4) de un instante, como lo devuelve la serie. */
  const diaVe = (d: Date) => new Date(d.getTime() - 4 * 3600_000).toISOString().slice(0, 10);

  it('resumen de ventas: serie por día, totales, ganancia estimada y más vendidos', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20');
    const a = await r.n.post('/revendedor/compras', alta(e));
    const b = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre: 'Beto Ruiz' } }));
    expect([a.estado, b.estado]).toEqual([201, 201]);
    const ren = await r.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: a.cuerpo.compra.suscripcion.id,
      claveIdempotencia: randomUUID(),
    });
    expect(ren.estado).toBe(201);
    // Beto se compró hace 10 días: cuenta en 30 días, no en 7 ni hoy.
    await ctx.prisma.compraRevendedor.update({
      where: { id: b.cuerpo.compra.id },
      data: { creadoEn: new Date(Date.now() - 10 * DIA) },
    });
    // Una venta reembolsada no suma, pero se cuenta aparte.
    const otra = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre: 'Caro' } }));
    expect(
      (
        await e.admin.post(`/revendedores/compras/${otra.cuerpo.compra.id}/reembolsar`, {
          motivo: 'Plan equivocado',
        })
      ).estado,
    ).toBe(200);

    const r30 = await r.n.get('/revendedor/ventas/resumen');
    expect(r30.estado).toBe(200);
    expect(r30.cuerpo.periodo).toBe('30');
    expect(r30.cuerpo.dias).toHaveLength(30);
    expect(r30.cuerpo.dias.at(-1)).toEqual({
      fecha: diaVe(new Date()),
      ventas: 2,
      pagadoUsd: '8.00',
      gananciaUsd: '2.00',
    });
    expect(
      r30.cuerpo.dias.find(
        (d: { fecha: string }) => d.fecha === diaVe(new Date(Date.now() - 10 * DIA)),
      ),
    ).toMatchObject({ ventas: 1, pagadoUsd: '4.00' });
    // Precio al público 5 USD y mayorista 4 USD: 1 USD de ganancia estimada por venta.
    expect(r30.cuerpo.totales).toEqual({
      ventas: 3,
      pagadoUsd: '12.00',
      publicoUsd: '15.00',
      gananciaUsd: '3.00',
      reembolsadas: 1,
      reembolsadoUsd: '4.00',
    });
    expect(r30.cuerpo.masVendidos).toEqual([
      {
        plan: expect.objectContaining({ id: e.planId, servicioSlug: 'nv-cine' }),
        ventas: 3,
        pagadoUsd: '12.00',
        gananciaUsd: '3.00',
      },
    ]);
    const r7 = await r.n.get('/revendedor/ventas/resumen?periodo=7');
    expect(r7.cuerpo.dias).toHaveLength(7);
    expect(r7.cuerpo.totales).toMatchObject({ ventas: 2, pagadoUsd: '8.00', reembolsadas: 1 });
    const rHoy = await r.n.get('/revendedor/ventas/resumen?periodo=hoy');
    expect(rHoy.cuerpo.dias).toHaveLength(1);
    expect(rHoy.cuerpo.totales.ventas).toBe(2);
    expect((await r.n.get('/revendedor/ventas/resumen?periodo=90')).estado).toBe(400);

    // Otro revendedor no ve nada de esto.
    const ajeno = await revendedorConSaldo(e, '1');
    const vacio = await ajeno.n.get('/revendedor/ventas/resumen');
    expect(vacio.cuerpo.totales).toMatchObject({ ventas: 0, pagadoUsd: '0.00', reembolsadas: 0 });
    expect(vacio.cuerpo.masVendidos).toEqual([]);
    expect(vacio.cuerpo.dias.every((d: { ventas: number }) => d.ventas === 0)).toBe(true);
  });

  it('lista de ventas por periodo y tipo, con precio al público, ganancia y páginas', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '30');
    const altas = [];
    for (const nombre of ['Ana', 'Beto', 'Caro']) {
      altas.push(await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre } })));
    }
    await r.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: altas[0]!.cuerpo.compra.suscripcion.id,
      claveIdempotencia: randomUUID(),
    });
    await e.admin.post(`/revendedores/compras/${altas[2]!.cuerpo.compra.id}/reembolsar`, {
      motivo: 'Cliente duplicado',
    });
    await ctx.prisma.compraRevendedor.update({
      where: { id: altas[1]!.cuerpo.compra.id },
      data: { creadoEn: new Date(Date.now() - 40 * DIA) },
    });

    const todas = await r.n.get('/revendedor/ventas?porPagina=2');
    expect(todas.estado).toBe(200);
    expect(todas.cuerpo).toMatchObject({
      total: 3,
      pagina: 1,
      porPagina: 2,
      conteos: { todas: 3, alta: 2, renovacion: 1, reembolsada: 1 },
      totales: { ventas: 2, pagadoUsd: '8.00', publicoUsd: '10.00', gananciaUsd: '2.00' },
    });
    expect(todas.cuerpo.elementos).toHaveLength(2);
    const segunda = await r.n.get('/revendedor/ventas?porPagina=2&pagina=2');
    expect(segunda.cuerpo.elementos).toHaveLength(1);
    const filas = [...todas.cuerpo.elementos, ...segunda.cuerpo.elementos];
    const reembolsada = filas.find((v: { estado: string }) => v.estado === 'reembolsada');
    expect(reembolsada).toMatchObject({ precioPublicoUsd: '5.00', gananciaUsd: null });
    expect(filas.find((v: { tipo: string }) => v.tipo === 'renovacion')).toMatchObject({
      precioUsd: '4.00',
      precioPublicoUsd: '5.00',
      gananciaUsd: '1.00',
      cliente: { nombre: 'Ana' },
    });

    const soloReemb = await r.n.get('/revendedor/ventas?tipo=reembolsada');
    expect(soloReemb.cuerpo.total).toBe(1);
    expect(soloReemb.cuerpo.totales).toMatchObject({
      ventas: 0,
      reembolsadas: 1,
      reembolsadoUsd: '4.00',
    });
    expect((await r.n.get('/revendedor/ventas?tipo=renovacion')).cuerpo.total).toBe(1);
    expect((await r.n.get('/revendedor/ventas?tipo=alta')).cuerpo.total).toBe(2);
    // Con 30 días no entra la de hace 40; en el listado del equipo sigue.
    expect((await r.n.get('/revendedor/compras')).cuerpo.total).toBe(4);
    expect((await r.n.get('/revendedor/ventas?tipo=otra')).estado).toBe(400);

    const ajeno = await revendedorConSaldo(e, '1');
    expect((await ajeno.n.get('/revendedor/ventas')).cuerpo).toMatchObject({
      total: 0,
      conteos: { todas: 0 },
    });
  });

  it('la cartera trae sus cifras, se ordena en la API y la ficha muestra servicios e historial', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '30');
    const ana = await r.n.post(
      '/revendedor/compras',
      alta(e, {
        cliente: { nombre: 'Ana', correo: 'ana@cliente.test', whatsapp: '+58 412 111 2233' },
      }),
    );
    const beto = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre: 'Beto' } }));
    const caro = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre: 'Caro' } }));
    // A Beto se le renueva dos veces: es quien más compró.
    for (let i = 0; i < 2; i += 1) {
      await r.n.post('/revendedor/compras', {
        tipo: 'renovacion',
        suscripcionId: beto.cuerpo.compra.suscripcion.id,
        claveIdempotencia: randomUUID(),
      });
    }
    // Caro vence mañana; Ana está en gracia desde ayer.
    await ctx.prisma.suscripcion.update({
      where: { id: caro.cuerpo.compra.suscripcion.id },
      data: { venceEn: new Date(Date.now() + DIA) },
    });
    await ctx.prisma.suscripcion.update({
      where: { id: ana.cuerpo.compra.suscripcion.id },
      data: { estado: 'en_gracia', venceEn: new Date(Date.now() - DIA) },
    });
    const nombres = async (q: string) =>
      (await r.n.get(`/revendedor/clientes?${q}`)).cuerpo.elementos.map(
        (c: { nombre: string }) => c.nombre,
      );
    expect(await nombres('')).toEqual(['Ana', 'Beto', 'Caro']);
    expect(await nombres('orden=nombre&dir=desc')).toEqual(['Caro', 'Beto', 'Ana']);
    expect(await nombres('orden=total')).toEqual(['Beto', 'Ana', 'Caro']);
    expect(await nombres('orden=vence')).toEqual(['Ana', 'Caro', 'Beto']);
    expect(await nombres('orden=ultima&dir=asc')).toEqual(['Ana', 'Caro', 'Beto']);
    expect(await nombres('orden=total&porPagina=1&pagina=2')).toEqual(['Ana']);
    expect((await r.n.get('/revendedor/clientes?orden=otro')).estado).toBe(400);

    const lista = await r.n.get('/revendedor/clientes?orden=total');
    expect(lista.cuerpo.conteos).toEqual({ todos: 3, por_vencer: 1, atrasados: 1 });
    expect(lista.cuerpo.elementos[0]).toMatchObject({
      nombre: 'Beto',
      ventas: 3,
      totalCompradoUsd: '12.00',
      serviciosActivos: 1,
      proximoVencimiento: { id: beto.cuerpo.compra.suscripcion.id },
    });
    expect(lista.cuerpo.elementos[0].ultimaVentaEn).toEqual(expect.any(String));
    const filtrada = await r.n.get('/revendedor/clientes?filtro=atrasados&busqueda=ana');
    expect(filtrada.cuerpo).toMatchObject({ total: 1, conteos: { todos: 1, atrasados: 1 } });

    const ficha = await r.n.get(`/revendedor/clientes/${ana.cuerpo.compra.cliente.id}`);
    expect(ficha.estado).toBe(200);
    expect(ficha.cuerpo).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@cliente.test',
      whatsapp: '+584121112233',
      ventas: 1,
      totalCompradoUsd: '4.00',
    });
    expect(ficha.cuerpo.servicios).toEqual([
      expect.objectContaining({
        suscripcion: expect.objectContaining({ estado: 'en_gracia' }),
        precioUsd: '4.00',
        noRenovable: null,
      }),
    ]);
    expect(ficha.cuerpo.historial).toEqual([
      expect.objectContaining({ tipo: 'alta', precioUsd: '4.00', gananciaUsd: '1.00' }),
    ]);
    // Un cliente de otro revendedor no existe para este.
    const ajeno = await revendedorConSaldo(e, '1');
    expect((await ajeno.n.get(`/revendedor/clientes/${ana.cuerpo.compra.cliente.id}`)).estado).toBe(
      404,
    );
  });

  it('lista lo que se puede renovar y lo renueva en lote, todo o nada', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '30');
    const subs: string[] = [];
    for (const nombre of ['Ana', 'Beto', 'Caro']) {
      const c = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre } }));
      subs.push(c.cuerpo.compra.suscripcion.id);
    }
    // Ana vence en 2 días, Beto venció (gracia) y Caro vence en un mes.
    await ctx.prisma.suscripcion.update({
      where: { id: subs[0] },
      data: { venceEn: new Date(Date.now() + 2 * DIA) },
    });
    await ctx.prisma.suscripcion.update({
      where: { id: subs[1] },
      data: { estado: 'en_gracia', venceEn: new Date(Date.now() - DIA) },
    });

    const urgentes = await r.n.get('/revendedor/renovaciones');
    expect(urgentes.estado).toBe(200);
    expect(urgentes.cuerpo.filtro).toBe('urgentes');
    expect(
      urgentes.cuerpo.elementos.map((x: { suscripcion: { id: string } }) => x.suscripcion.id),
    ).toEqual([subs[1], subs[0]]);
    expect(urgentes.cuerpo.totales).toEqual({
      urgentes: { cantidad: 2, totalUsd: '8.00' },
      atrasados: { cantidad: 1, totalUsd: '4.00' },
      todos: { cantidad: 3, totalUsd: '12.00' },
    });
    expect(
      (await r.n.get('/revendedor/renovaciones?filtro=atrasados')).cuerpo.elementos,
    ).toHaveLength(1);
    expect((await r.n.get('/revendedor/resumen')).cuerpo.renovacionesUrgentes).toBe(2);

    const antes = await ctx.prisma.suscripcion.findMany({ where: { id: { in: subs } } });
    const clave = randomUUID();
    const lote = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: [subs[0], subs[1]],
      claveIdempotencia: clave,
    });
    expect(lote.estado).toBe(200);
    // 30 - 3 altas de 4 - 2 renovaciones de 4 = 10.
    expect(lote.cuerpo).toMatchObject({ saldoUsd: '10.00', totalUsd: '8.00', repetida: false });
    expect(lote.cuerpo.renovadas.map((x: { suscripcionId: string }) => x.suscripcionId)).toEqual([
      subs[0],
      subs[1],
    ]);
    expect(lote.cuerpo.renovadas[1].compra).toMatchObject({
      tipo: 'renovacion',
      suscripcion: { estado: 'activa' },
    });
    const ana = antes.find((s) => s.id === subs[0])!;
    const anaDespues = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: subs[0] } });
    expect(anaDespues.venceEn!.getTime()).toBeGreaterThan(ana.venceEn!.getTime() + 25 * DIA);
    // Repetir la misma clave no cobra otra vez.
    const otraVez = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: [subs[0], subs[1]],
      claveIdempotencia: clave,
    });
    expect(otraVez.cuerpo).toMatchObject({ repetida: true, saldoUsd: '10.00' });
    expect(await ctx.prisma.compraRevendedor.count({ where: { tipo: 'renovacion' } })).toBe(2);
    // La misma clave con otros servicios se rechaza.
    expect(
      (
        await r.n.post('/revendedor/renovaciones/lote', {
          suscripcionIds: [subs[2]],
          claveIdempotencia: clave,
        })
      ).cuerpo.error.codigo,
    ).toBe('CLAVE_REUTILIZADA');
    expect((await r.n.get('/revendedor/renovaciones')).cuerpo.elementos).toHaveLength(0);

    // Entradas inválidas.
    for (const cuerpo of [
      { suscripcionIds: [], claveIdempotencia: randomUUID() },
      { suscripcionIds: [subs[2], subs[2]], claveIdempotencia: randomUUID() },
      { suscripcionIds: ['no-es-un-id'], claveIdempotencia: randomUUID() },
      { suscripcionIds: [subs[2]] },
    ]) {
      expect((await r.n.post('/revendedor/renovaciones/lote', cuerpo)).estado).toBe(400);
    }
  });

  it('el lote no renueva nada sin saldo, por encima del límite diario o con un servicio ajeno', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '12', 3);
    const subs: string[] = [];
    for (const nombre of ['Ana', 'Beto']) {
      const c = await r.n.post('/revendedor/compras', alta(e, { cliente: { nombre } }));
      subs.push(c.cuerpo.compra.suscripcion.id);
    }
    const renovaciones = () => ctx.prisma.compraRevendedor.count({ where: { tipo: 'renovacion' } });
    const saldo = async () =>
      (await ctx.prisma.revendedor.findUniqueOrThrow({ where: { id: r.id } })).saldoUsd.toFixed(2);

    // Quedan 4 USD: alcanza para una renovación, no para dos.
    const sinSaldo = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: subs,
      claveIdempotencia: randomUUID(),
    });
    expect(sinSaldo.estado).toBe(409);
    expect(sinSaldo.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');
    expect(sinSaldo.cuerpo.error.mensaje).toContain('Te faltan');
    expect(await renovaciones()).toBe(0);
    expect(await saldo()).toBe('4.00');

    // Con saldo, el límite diario (3 y ya hizo 2) solo admite una más.
    await e.admin.post(`/revendedores/${r.id}/ajustes`, { montoUsd: '20', motivo: 'Prueba' });
    const limite = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: subs,
      claveIdempotencia: randomUUID(),
    });
    expect(limite.estado).toBe(409);
    expect(limite.cuerpo.error.codigo).toBe('LIMITE_DIARIO');
    expect(limite.cuerpo.error.mensaje).toContain('queda 1 venta');
    expect(await renovaciones()).toBe(0);
    expect(await saldo()).toBe('24.00');

    // Un servicio de otro revendedor: 404 y nada renovado.
    await e.admin.patch(`/revendedores/${r.id}`, { limiteDiarioCompras: null });
    const otro = await revendedorConSaldo(e, '10');
    const suya = await otro.n.post(
      '/revendedor/compras',
      alta(e, { cliente: { nombre: 'Ajena' } }),
    );
    const ajena = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: [subs[0], suya.cuerpo.compra.suscripcion.id],
      claveIdempotencia: randomUUID(),
    });
    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo.error.campos).toHaveProperty(suya.cuerpo.compra.suscripcion.id);
    expect(await renovaciones()).toBe(0);

    // Uno que no se renueva (cancelación programada) frena todo el lote con su motivo.
    await ctx.prisma.suscripcion.update({
      where: { id: subs[1] },
      data: { cancelarAlVencer: true },
    });
    const noRenovable = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: subs,
      claveIdempotencia: randomUUID(),
    });
    expect(noRenovable.estado).toBe(409);
    expect(noRenovable.cuerpo.error.codigo).toBe('NO_RENOVABLE');
    expect(noRenovable.cuerpo.error.campos[subs[1]!]).toEqual([
      'Tiene una cancelación programada.',
    ]);
    expect(await renovaciones()).toBe(0);
    expect(await saldo()).toBe('24.00');
  });

  it('suspendido ve sus ventas, cartera y renovaciones, pero no vende, renueva ni recarga', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20');
    const c = await r.n.post('/revendedor/compras', alta(e));
    const sub = c.cuerpo.compra.suscripcion.id;
    await e.admin.post(`/revendedores/${r.id}/suspender`, { motivo: 'Revisión de pagos' });

    for (const ruta of [
      '/revendedor/ventas/resumen',
      '/revendedor/ventas',
      '/revendedor/clientes',
      `/revendedor/clientes/${c.cuerpo.compra.cliente.id}`,
      '/revendedor/renovaciones?filtro=todos',
    ]) {
      expect((await r.n.get(ruta)).estado, ruta).toBe(200);
    }
    const lote = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: [sub],
      claveIdempotencia: randomUUID(),
    });
    expect(lote.estado).toBe(403);
    expect(lote.cuerpo.error.codigo).toBe('REVENDEDOR_SUSPENDIDO');
    const suelta = await r.n.post('/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: sub,
      claveIdempotencia: randomUUID(),
    });
    expect(suelta.cuerpo.error.codigo).toBe('REVENDEDOR_SUSPENDIDO');
    expect((await r.n.post('/revendedor/compras', alta(e))).cuerpo.error.codigo).toBe(
      'REVENDEDOR_SUSPENDIDO',
    );
    expect((await recargar(e, r.n, '5')).cuerpo.error.codigo).toBe('REVENDEDOR_SUSPENDIDO');
    expect(await ctx.prisma.compraRevendedor.count()).toBe(1);
  });

  it('sin nivel no hay nada que renovar y el lote explica por qué', async () => {
    const e = await escenario();
    const r = await revendedorConSaldo(e, '20');
    const c = await r.n.post('/revendedor/compras', alta(e));
    await ctx.prisma.revendedor.update({ where: { id: r.id }, data: { nivelId: null } });
    const lista = await r.n.get('/revendedor/renovaciones?filtro=todos');
    expect(lista.cuerpo.elementos).toEqual([]);
    const ficha = await r.n.get(`/revendedor/clientes/${c.cuerpo.compra.cliente.id}`);
    expect(ficha.cuerpo.servicios[0]).toMatchObject({
      precioUsd: null,
      noRenovable: 'Aún no tienes nivel asignado.',
    });
    const lote = await r.n.post('/revendedor/renovaciones/lote', {
      suscripcionIds: [c.cuerpo.compra.suscripcion.id],
      claveIdempotencia: randomUUID(),
    });
    expect(lote.cuerpo.error.codigo).toBe('NO_RENOVABLE');
  });
});
