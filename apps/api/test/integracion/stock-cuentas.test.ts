import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
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

/** «AAAA-MM-DD» a n días de hoy, en hora de Venezuela. */
const dia = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(
    new Date(Date.now() + n * 86_400_000),
  );
const ddmmaaaa = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const cliente = await conectar(ctx, 'cliente');
  const catalogo = await prepararCatalogo(admin.n);
  return { admin, operador, cliente: cliente.n, ...catalogo };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

const planEnCatalogo = async (e: Escenario) =>
  ((await e.cliente.get('/catalogo')).cuerpo.planes as { id: string; agotado?: boolean }[]).find(
    (p) => p.id === e.planId,
  )!;

async function cuenta(
  e: Escenario,
  usuario: string,
  facturaEn: string | null,
  perfiles = 2,
  apta = true,
) {
  const r = await e.operador.n.post('/cuentas', {
    servicioId: e.servicioId,
    usuario,
    clave: 'Clave-123',
    perfiles,
    ...(facturaEn ? { facturaEn } : {}),
  });
  expect(r.estado).toBe(201);
  const c = r.cuerpo as { id: string; listaPerfiles: { id: string; numero: number }[] };
  // La web solo entrega lo revisado: se marcan todos sus lugares como aptos.
  if (apta) {
    const m = await e.operador.n.post('/cuentas/entrega-web/aptos', {
      perfilIds: c.listaPerfiles.map((p) => p.id),
      apto: true,
    });
    expect(m.estado).toBe(200);
  }
  return c;
}

/** El cliente contrata y paga con comprobante; el operador confirma. */
async function comprarYPagar(e: Escenario) {
  const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
  expect(alta.estado).toBe(201);
  const pago = await e.cliente.formulario(
    `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
    { metodoCobroId: e.zelleId, monto: '5.00', fechaPago: hoy() },
    { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
  );
  expect(pago.estado).toBe(201);
  const ok = await e.operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, {
    montoRecibido: '5.00',
  });
  expect(ok.estado).toBe(200);
  return alta.cuerpo.suscripcion.id as string;
}

describe('stock y entrega automática desde Plataformas', () => {
  it('sin cuentas en Plataformas el plan se vende como siempre (entrega a mano)', async () => {
    const e = await escenario();
    expect((await planEnCatalogo(e)).agotado).toBeUndefined();
    expect(
      (await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' })).estado,
    ).toBe(201);
  });

  it('solo cuentan perfiles libres de cuentas activas y vigentes; sin stock no se vende', async () => {
    const e = await escenario();
    // Vencida, sin fecha y caída: ninguna cuenta.
    await cuenta(e, 'vencida@example.com', dia(-1));
    await cuenta(e, 'sinfecha@example.com', null);
    const caida = await cuenta(e, 'caida@example.com', dia(30));
    await e.operador.n.patch(`/cuentas/${caida.id}`, { estado: 'caida' });
    expect((await planEnCatalogo(e)).agotado).toBe(true);
    const sinStock = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(sinStock.estado).toBe(409);
    expect(sinStock.cuerpo.error.codigo).toBe('SIN_STOCK');

    // Una cuenta que vence hoy todavía sirve.
    await cuenta(e, 'hoy@example.com', dia(0));
    expect((await planEnCatalogo(e)).agotado).toBeUndefined();
  });

  it('al pagar entrega el mejor perfil (la cuenta que vence más tarde) con el contrato del Gestor', async () => {
    const e = await escenario();
    await cuenta(e, 'pronto@example.com', dia(5));
    const lejos = await cuenta(e, 'lejos@example.com', dia(40));
    await e.operador.n.patch(`/cuentas/${lejos.id}/perfiles/${lejos.listaPerfiles[0]!.id}`, {
      pin: '1357',
    });

    const suscripcionId = await comprarYPagar(e);
    const perfil = await ctx.prisma.perfilCuenta.findFirstOrThrow({ where: { suscripcionId } });
    expect(perfil.cuentaId).toBe(lejos.id);
    expect(perfil.estado).toBe('asignado');
    // Se entregó solo: no queda una entrega pendiente para el equipo.
    expect(await ctx.prisma.entrega.count()).toBe(0);
    const auditoria = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'perfil_cuenta.asignado', entidadId: perfil.id },
    });
    expect(auditoria.actorId).toBeNull();

    const datos = await e.cliente.post(`/mi/perfiles/${suscripcionId}/revelar`, {});
    expect(datos.estado).toBe(200);
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } });
    const vence = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(
      s.venceEn!,
    );
    const contrato = datos.cuerpo.contrato as string;
    expect(contrato.split('\n').slice(0, 8)).toEqual([
      'CONTRATO – FACTURA DE SERVICIO',
      '',
      'Servicio: NV Cine',
      'Correo: lejos@example.com',
      'Contraseña: Clave-123',
      `Perfil: ${perfil.numero}`,
      `Pin: ${perfil.numero === 1 ? '1357' : 'NO APLICA'}`,
      `Fecha vencimiento: ${ddmmaaaa(vence)}`,
    ]);
    expect(contrato).toContain('CONDICIONES DE USO DEL SERVICIO');
    expect(contrato).toContain('Horario: 11:00 AM a 11:30 PM.');

    // El equipo arma el mismo contrato para enviarlo.
    const mensaje = await e.operador.n.post(
      `/cuentas/${lejos.id}/perfiles/${perfil.id}/mensaje`,
      {},
    );
    expect(mensaje.cuerpo.texto).toBe(contrato);
  });

  it('una cuenta individual también es stock; se entrega después de los perfiles compartidos', async () => {
    const e = await escenario();
    const individual = await cuenta(e, 'individual@example.com', dia(60), 1);
    expect((await planEnCatalogo(e)).agotado).toBeUndefined();
    const compartida = await cuenta(e, 'compartida@example.com', dia(10));

    const primera = await comprarYPagar(e);
    const p1 = await ctx.prisma.perfilCuenta.findFirstOrThrow({
      where: { suscripcionId: primera },
    });
    expect(p1.cuentaId).toBe(compartida.id);

    await e.operador.n.patch(`/cuentas/${compartida.id}`, { estado: 'caida' });
    const segunda = await comprarYPagar(e);
    const p2 = await ctx.prisma.perfilCuenta.findFirstOrThrow({
      where: { suscripcionId: segunda },
    });
    expect(p2.cuentaId).toBe(individual.id);
    expect((await planEnCatalogo(e)).agotado).toBe(true);
  });

  it('si el stock se acaba antes del pago, la suscripción queda para asignar a mano', async () => {
    const e = await escenario();
    const c = await cuenta(e, 'una@example.com', dia(10), 2);
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(alta.estado).toBe(201);
    // Mientras tanto se bloquean los dos perfiles.
    for (const p of c.listaPerfiles) {
      await e.operador.n.patch(`/cuentas/${c.id}/perfiles/${p.id}`, { bloqueado: true });
    }
    const pago = await e.cliente.formulario(
      `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
      { metodoCobroId: e.zelleId, monto: '5.00', fechaPago: hoy() },
      { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    await e.operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' });
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: alta.cuerpo.suscripcion.id },
      include: { perfilCuenta: true },
    });
    expect(s.estado).toBe('activa');
    expect(s.perfilCuenta).toBeNull();
    expect(await ctx.prisma.entrega.count()).toBe(1);
  });

  it('el revendedor compra con saldo, recibe el perfil al instante y ve el contrato', async () => {
    const e = await escenario();
    const c = await cuenta(e, 'reventa@example.com', dia(20), 3);
    await ctx.prisma.proveedor.updateMany({ data: { permiteReventa: true } });
    await e.admin.n.patch(`/catalogo/planes/${e.planId}`, { revendible: true, costoUsd: '2.00' });
    const nivel = await e.admin.n.post('/revendedores/niveles', { nombre: 'Plata' });
    await e.admin.n.pedir('PUT', '/revendedores/precios', {
      planId: e.planId,
      nivelId: nivel.cuerpo.id,
      precioUsd: '4',
    });
    const { usuario, n } = await conectar(ctx, 'cliente');
    const sol = await n.post('/revendedor/solicitud', { nombreComercial: 'Tienda Uno' });
    await e.admin.n.post(`/revendedores/${sol.cuerpo.id}/aprobar`, { nivelId: nivel.cuerpo.id });
    await n.entrarCompleto(usuario.correo);
    const recarga = await n.formulario(
      '/revendedor/recargas',
      { metodoCobroId: e.zelleId, moneda: 'USD', monto: '20', fechaPago: hoy() },
      { campo: 'comprobante', nombre: 'recarga.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    await e.operador.n.post(`/recargas-saldo/${recarga.cuerpo.id}/confirmar`, {
      montoRecibido: '20',
    });

    const catalogo = await n.get('/revendedor/catalogo');
    expect(catalogo.cuerpo.planes[0].agotado).toBeUndefined();
    const compra = await n.post('/revendedor/compras', {
      tipo: 'alta',
      planId: e.planId,
      cliente: { nombre: 'Ana Pérez', correo: 'ana@cliente.test' },
      claveIdempotencia: randomUUID(),
    });
    expect(compra.estado).toBe(201);
    const perfiles = await n.get('/revendedor/perfiles');
    expect(perfiles.cuerpo).toHaveLength(1);
    expect(perfiles.cuerpo[0]).toMatchObject({ cliente: { nombre: 'Ana Pérez' } });
    const datos = await n.post(
      `/revendedor/perfiles/${perfiles.cuerpo[0].suscripcionId}/revelar`,
      {},
    );
    expect(datos.estado).toBe(200);
    expect(datos.cuerpo.contrato).toContain('Correo: reventa@example.com');

    // Otro revendedor no la ve.
    const otro = await conectar(ctx, 'cliente');
    expect(
      (await otro.n.post(`/revendedor/perfiles/${perfiles.cuerpo[0].suscripcionId}/revelar`, {}))
        .estado,
    ).not.toBe(200);

    // Se agotan los perfiles: la tienda del revendedor lo marca y no deja comprar.
    for (const p of c.listaPerfiles.slice(1)) {
      await e.operador.n.patch(`/cuentas/${c.id}/perfiles/${p.id}`, { bloqueado: true });
    }
    expect((await n.get('/revendedor/catalogo')).cuerpo.planes[0].agotado).toBe(true);
    const sinStock = await n.post('/revendedor/compras', {
      tipo: 'alta',
      planId: e.planId,
      cliente: { nombre: 'Beto' },
      claveIdempotencia: randomUUID(),
    });
    expect(sinStock.cuerpo.error.codigo).toBe('SIN_STOCK');
  });
});

describe('revisión manual: solo se entrega lo marcado como apto', () => {
  it('lo libre sin revisar no es stock; al marcarlo sí, y se puede desmarcar', async () => {
    const e = await escenario();
    const c = await cuenta(e, 'revisar@example.com', dia(30), 2, false);
    expect((await planEnCatalogo(e)).agotado).toBe(true);

    const vista = await e.operador.n.get('/cuentas/entrega-web');
    expect(vista.estado).toBe(200);
    const sv = (
      vista.cuerpo as {
        servicioId: string;
        aptos: number;
        porRevisar: unknown[];
        siguientes: unknown[];
      }[]
    ).find((x) => x.servicioId === e.servicioId)!;
    expect(sv.aptos).toBe(0);
    expect(sv.siguientes).toHaveLength(0);
    expect(sv.porRevisar).toHaveLength(2);
    expect(JSON.stringify(vista.cuerpo)).not.toContain('Clave-123');

    // Un cliente no puede marcar.
    expect(
      (
        await e.cliente.post('/cuentas/entrega-web/aptos', {
          perfilIds: [c.listaPerfiles[0]!.id],
          apto: true,
        })
      ).estado,
    ).toBe(403);

    const m = await e.operador.n.post('/cuentas/entrega-web/aptos', {
      perfilIds: [c.listaPerfiles[1]!.id],
      apto: true,
    });
    expect(m.cuerpo).toEqual({ marcados: 1, omitidos: 0 });
    expect((await planEnCatalogo(e)).agotado).toBeUndefined();

    const quitar = await e.operador.n.post('/cuentas/entrega-web/aptos', {
      perfilIds: [c.listaPerfiles[1]!.id],
      apto: false,
    });
    expect(quitar.cuerpo.marcados).toBe(1);
    expect((await planEnCatalogo(e)).agotado).toBe(true);
    expect(await ctx.prisma.auditoria.count({ where: { accion: 'perfil_cuenta.apto_web' } })).toBe(
      1,
    );
  });

  it('muestra qué se entregaría ahora y el siguiente, en el mismo orden que la entrega', async () => {
    const e = await escenario();
    await cuenta(e, 'pronto@example.com', dia(5), 1);
    const lejos = await cuenta(e, 'lejos@example.com', dia(40));
    const vista = await e.operador.n.get('/cuentas/entrega-web');
    const sv = (
      vista.cuerpo as {
        servicioId: string;
        siguientes: { cuentaId: string; perfilId: string; individual: boolean }[];
      }[]
    ).find((x) => x.servicioId === e.servicioId)!;
    // Primero los perfiles compartidos de la cuenta que vence más tarde; la individual, al final.
    expect(sv.siguientes.map((l) => l.cuentaId)).toEqual([lejos.id, lejos.id, expect.any(String)]);
    expect(sv.siguientes[2]!.individual).toBe(true);

    const ahora = sv.siguientes[0]!;
    const suscripcionId = await comprarYPagar(e);
    const perfil = await ctx.prisma.perfilCuenta.findFirstOrThrow({ where: { suscripcionId } });
    expect(perfil.id).toBe(ahora.perfilId);
    // Al asignarse deja de estar apto: si se libera, hay que revisarlo otra vez.
    expect(perfil.aptoWeb).toBe(false);
    const despues = await e.operador.n.get('/cuentas/entrega-web');
    const sv2 = (
      despues.cuerpo as { servicioId: string; siguientes: { perfilId: string }[] }[]
    ).find((x) => x.servicioId === e.servicioId)!;
    expect(sv2.siguientes[0]!.perfilId).toBe(sv.siguientes[1]!.perfilId);

    await e.operador.n.post(`/cuentas/${lejos.id}/perfiles/${perfil.id}/liberar`, {
      motivo: 'Prueba de corte',
    });
    const liberado = await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: perfil.id } });
    expect(liberado.estado).toBe('libre');
    expect(liberado.aptoWeb).toBe(false);
  });
});
