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
