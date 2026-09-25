import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EjecutorAutomatizacionesService } from '../../src/automatizaciones/ejecutor.service.js';
import { TrabajosService } from '../../src/automatizaciones/trabajos.service.js';
import { EntregasService } from '../../src/entregas/entregas.service.js';
import { verificarFirma } from '../../src/entregas/firma.js';
import { registrarEntrega } from '../../src/entregas/registro.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  type Navegador,
  PNG_1X1,
  prepararCatalogo,
} from './ayudas.js';

// ── Servidor falso del proveedor (sin internet) ────────────────────────────

interface Recibido {
  cabeceras: IncomingHttpHeaders;
  cuerpo: string;
  json: Record<string, any>;
}
interface RespuestaFalsa {
  estado: number;
  cuerpo?: unknown;
}

let servidor: Server;
let urlProveedor: string;
const recibidos: Recibido[] = [];
let cola: RespuestaFalsa[] = [];
let porDefecto: RespuestaFalsa = { estado: 200, cuerpo: {} };

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto({ ENTREGAS_WEBHOOK_RED_LOCAL: 'true' });
  servidor = createServer((req, res) => {
    let datos = '';
    req.on('data', (c: Buffer) => (datos += c.toString('utf8')));
    req.on('end', () => {
      recibidos.push({ cabeceras: req.headers, cuerpo: datos, json: JSON.parse(datos || '{}') });
      const r = cola.shift() ?? porDefecto;
      res.writeHead(r.estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.cuerpo ?? {}));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  urlProveedor = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/nv/entregas`;
});
afterAll(async () => {
  await ctx.app.close();
  await new Promise((ok) => servidor.close(ok));
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
  recibidos.length = 0;
  cola = [];
  porDefecto = { estado: 200, cuerpo: {} };
});

// ── Ayudas ───────────────────────────────────────────────────────────────

const procesar = () => ctx.app.get(TrabajosService).procesarTodo();

/** Adelanta el reloj de la cola: todo lo programado se ejecuta ya. */
async function adelantar() {
  await ctx.prisma.$executeRaw`UPDATE trabajos SET ejecutar_en = now() WHERE estado = 'pendiente'`;
  return procesar();
}

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const proveedor = await ctx.prisma.proveedor.findFirstOrThrow();
  return { admin: admin.n, operador: operador.n, proveedorId: proveedor.id, ...catalogo };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

/** Un cliente contrata el plan mensual y operación confirma su pago en USD. */
async function clientePagado(e: Escenario, cliente?: { n: Navegador }) {
  const c = cliente ?? (await conectar(ctx, 'cliente'));
  const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
  expect(alta.estado).toBe(201);
  const facturaId = alta.cuerpo.factura.id as string;
  const pago = await c.n.formulario(
    `/mi/facturas/${facturaId}/pagos`,
    {
      metodoCobroId: e.zelleId,
      monto: '5.00',
      referenciaExterna: `Z${randomUUID().slice(0, 8)}`,
      fechaPago: hoy(),
    },
    { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
  );
  expect(pago.estado).toBe(201);
  const ok = await e.operador.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' });
  expect(ok.estado).toBe(200);
  const entrega = await ctx.prisma.entrega.findFirstOrThrow({ where: { facturaId } });
  return {
    ...c,
    facturaId,
    suscripcionId: alta.cuerpo.suscripcion.id as string,
    entregaId: entrega.id,
  };
}

async function configurar(e: Escenario, cuerpo: Record<string, unknown>) {
  const r = await e.admin.pedir('PUT', `/catalogo/proveedores/${e.proveedorId}/entrega`, cuerpo);
  expect(r.estado).toBe(200);
  return r.cuerpo;
}

async function subirLote(e: Escenario, texto: string, nombre = 'Lote de prueba') {
  return e.admin.post(`/inventario/planes/${e.planId}/lotes`, { nombre, texto });
}

// ── Pruebas ──────────────────────────────────────────────────────────────

describe('registro de entregas', () => {
  it('una factura pagada crea exactamente una entrega y su trabajo, aunque se aplique dos veces', async () => {
    const e = await escenario();
    const c = await clientePagado(e);
    expect(await ctx.prisma.entrega.count()).toBe(1);
    const entrega = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(entrega).toMatchObject({
      estado: 'pendiente',
      motivo: 'alta',
      adaptador: 'manual',
      suscripcionId: c.suscripcionId,
      claveIdempotencia: `factura:${c.facturaId}`,
    });
    expect(await ctx.prisma.trabajo.count({ where: { tipo: 'entrega.procesar' } })).toBe(1);

    // Aplicar otra vez el mismo pago no crea otra entrega ni otro trabajo.
    const repetida = await ctx.prisma.$transaction((tx) =>
      registrarEntrega(tx, {
        origen: { tipo: 'factura', facturaId: c.facturaId },
        suscripcionId: c.suscripcionId,
        concepto: 'alta',
        periodo: { inicio: new Date(), fin: null },
      }),
    );
    expect(repetida).toBeNull();
    expect(await ctx.prisma.entrega.count()).toBe(1);
    expect(await ctx.prisma.trabajo.count({ where: { tipo: 'entrega.procesar' } })).toBe(1);
  });

  it('la entrega manual avisa al equipo y se completa sin aceptar credenciales', async () => {
    const e = await escenario();
    const c = await clientePagado(e);
    await procesar();
    expect(
      await ctx.prisma.notificacion.count({
        where: { plantilla: 'entregaPendiente', canal: 'correo' },
      }),
    ).toBe(2); // administración y operación
    expect((await e.admin.get(`/entregas/${c.entregaId}`)).cuerpo.estado).toBe('pendiente');

    const credenciales = [
      { instrucciones: 'Entra con usuario: ana@correo.com y contraseña: Secreta123' },
      { instrucciones: 'Inicia sesión con el correo ana@correo.com / clave Secreta123' },
      { instrucciones: 'Activa el servicio con el código.', codigo: 'password=Secreta123' },
      {
        instrucciones: 'Abre el enlace de activación.',
        enlace: 'https://ana:Secreta123@proveedor.example/activar',
      },
    ];
    for (const cuerpo of credenciales) {
      const r = await e.operador.post(`/entregas/${c.entregaId}/completar`, cuerpo);
      expect(r.estado, JSON.stringify(cuerpo)).toBe(400);
    }
    const noHttps = await e.operador.post(`/entregas/${c.entregaId}/completar`, {
      instrucciones: 'Abre el enlace de activación.',
      enlace: 'http://proveedor.example/activar',
    });
    expect(noHttps.estado).toBe(400);

    const ok = await e.operador.post(`/entregas/${c.entregaId}/completar`, {
      instrucciones: 'Abre el enlace y pega el código en la app oficial.',
      enlace: 'https://proveedor.example/activar',
      codigo: 'NVOR-ABCD-9876',
    });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo).toMatchObject({ estado: 'entregada', tieneCodigo: true, tieneEnlace: true });
    expect(JSON.stringify(ok.cuerpo)).not.toContain('NVOR-ABCD-9876');
    // Ni la auditoría ni los correos llevan el código.
    const registros = await ctx.prisma.auditoria.findMany({ where: { entidad: 'entrega' } });
    expect(registros.map((r) => r.accion)).toContain('entrega.completada');
    expect(JSON.stringify(registros)).not.toContain('NVOR-ABCD-9876');
    const correo = await ctx.prisma.correoSaliente.findFirstOrThrow({
      where: { plantilla: 'servicioListo' },
    });
    expect(correo.asunto).toBe('Tu servicio está listo');
    expect(correo.texto).not.toContain('NVOR-ABCD-9876');
    expect(correo.texto).not.toContain('proveedor.example');
    // La fila guarda el código cifrado.
    const fila = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(fila.datosCifrados).toMatch(/^ce\|v1\./);
    expect(fila.datosCifrados).not.toContain('NVOR');

    // Ya entregada: no se completa otra vez; reintentar una manual no aplica.
    expect(
      (
        await e.operador.post(`/entregas/${c.entregaId}/completar`, {
          instrucciones: 'Otra vez los mismos pasos.',
        })
      ).estado,
    ).toBe(409);
  });
});

describe('códigos de inventario', () => {
  it('un lote descarta repetidos, nunca devuelve los códigos y se reparte sin duplicar en paralelo', async () => {
    const e = await escenario();
    await configurar(e, { adaptador: 'codigos', instrucciones: 'Canjea el código en la app.' });
    const lote = await subirLote(
      e,
      [
        'codigo',
        'DEMO-AAAA-0001',
        'demo aaaa 0001', // el mismo, normalizado
        'DEMO-AAAA-0002',
        '"DEMO-AAAA-0003",tarjeta de 30 días',
        'usuario: ana@correo.com contraseña: 1234',
        'x',
      ].join('\n'),
    );
    expect(lote.estado).toBe(201);
    expect(lote.cuerpo).toMatchObject({
      anadidos: 3,
      repetidosEnArchivo: 1,
      yaExistentes: 0,
      entregasReintentadas: 0,
    });
    expect(lote.cuerpo.invalidos).toHaveLength(2);
    expect(JSON.stringify(lote.cuerpo)).not.toContain('AAAA');
    // Los mismos códigos otra vez: nada nuevo.
    const otra = await subirLote(e, 'DEMO-AAAA-0001\nDEMO-AAAA-0002');
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe('LOTE_REPETIDO');
    expect(JSON.stringify(otra.cuerpo)).not.toContain('AAAA');

    // Cuatro clientes pagan; hay tres códigos. Se procesan a la vez.
    const clientes = [];
    for (let i = 0; i < 4; i += 1) clientes.push(await clientePagado(e));
    const servicio = ctx.app.get(EntregasService);
    await Promise.all(clientes.map((c) => servicio.procesar(c.entregaId)));
    const entregas = await ctx.prisma.entrega.findMany({ include: { codigo: true } });
    expect(entregas.filter((x) => x.estado === 'entregada')).toHaveLength(3);
    const esperando = entregas.filter((x) => x.estado === 'pendiente');
    expect(esperando).toHaveLength(1);
    expect(esperando[0]!.error).toMatch(/No hay códigos disponibles/);
    const asignados = entregas.flatMap((x) => (x.codigo ? [x.codigo.id] : []));
    expect(new Set(asignados).size).toBe(3);
    expect(await ctx.prisma.notificacion.count({ where: { plantilla: 'entregaSinStock' } })).toBe(
      1,
    );

    // Cada cliente ve su propio código; todos distintos.
    const vistos = new Set<string>();
    for (const c of clientes) {
      const x = entregas.find((y) => y.id === c.entregaId)!;
      if (x.estado !== 'entregada') continue;
      const r = await c.n.post(`/mi/accesos/${c.entregaId}/revelar`);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.instrucciones).toBe('Canjea el código en la app.');
      vistos.add(r.cuerpo.codigo);
    }
    expect([...vistos].sort()).toEqual(['DEMO-AAAA-0001', 'DEMO-AAAA-0002', 'DEMO-AAAA-0003']);

    // Sin stock → se sube otro lote → la entrega pendiente se hace.
    const nuevo = await subirLote(e, 'DEMO-BBBB-0001\nDEMO-BBBB-0002', 'Reposición');
    expect(nuevo.cuerpo).toMatchObject({ anadidos: 2, entregasReintentadas: 1 });
    await procesar();
    const hecha = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: esperando[0]!.id } });
    expect(hecha.estado).toBe('entregada');

    const inventario = await e.admin.get(`/inventario/planes/${e.planId}`);
    expect(inventario.cuerpo).toMatchObject({ disponibles: 1, entregados: 4, pendientes: 0 });
    expect(inventario.cuerpo.lotes).toHaveLength(2);
    expect(JSON.stringify(inventario.cuerpo)).not.toMatch(/AAAA|BBBB/);

    // Anular un código disponible; uno entregado no se anula.
    const libre = inventario.cuerpo.codigos.elementos.find(
      (x: { estado: string }) => x.estado === 'disponible',
    );
    const entregado = inventario.cuerpo.codigos.elementos.find(
      (x: { estado: string }) => x.estado === 'entregado',
    );
    expect(
      (
        await e.admin.post(`/inventario/codigos/${libre.id}/anular`, {
          motivo: 'El distribuidor lo invalidó',
        })
      ).estado,
    ).toBe(204);
    expect(
      (
        await e.admin.post(`/inventario/codigos/${entregado.id}/anular`, {
          motivo: 'Prueba de anulación',
        })
      ).estado,
    ).toBe(409);
  });

  it('la automatización de pocos códigos avisa al equipo de inventario', async () => {
    const e = await escenario();
    await configurar(e, { adaptador: 'codigos' });
    await subirLote(e, 'DEMO-CCCC-0001');
    const ejecucion = await ctx.app
      .get(EjecutorAutomatizacionesService)
      .ejecutar('stock_bajo_codigos', { disparo: 'manual' });
    expect(ejecucion).toMatchObject({ estado: 'completada', procesados: 1 });
    const aviso = await ctx.prisma.correoSaliente.findFirstOrThrow({
      where: { plantilla: 'stockBajoCodigos' },
    });
    expect(aviso.texto).toContain('1 disponible');
    expect(aviso.texto).not.toContain('CCCC');
  });
});

describe('webhook firmado', () => {
  async function conWebhook(e: Escenario) {
    await configurar(e, { adaptador: 'webhook', webhookUrl: urlProveedor, incluirCorreo: false });
    const r = await e.admin.post(`/catalogo/proveedores/${e.proveedorId}/entrega/secreto`);
    expect(r.estado).toBe(200);
    expect(String(r.cabeceras['cache-control'])).toContain('no-store');
    expect(r.cuerpo.secreto).toMatch(/^nvwh_/);
    // La clave solo se ve al rotarla.
    const config = await e.admin.get(`/catalogo/proveedores/${e.proveedorId}/entrega`);
    expect(config.cuerpo.tieneSecreto).toBe(true);
    expect(JSON.stringify(config.cuerpo)).not.toContain(r.cuerpo.secreto);
    return r.cuerpo.secreto as string;
  }

  it('firma cada envío; 2xx entrega con referencia y enlace, y el ping prueba la configuración', async () => {
    const e = await escenario();
    const secreto = await conWebhook(e);
    const prueba = await e.admin.post(`/catalogo/proveedores/${e.proveedorId}/entrega/probar`);
    expect(prueba.cuerpo).toMatchObject({ ok: true, estadoHttp: 200 });
    expect(recibidos[0]!.json.evento).toBe('ping');

    cola = [
      {
        estado: 201,
        cuerpo: {
          referencia: 'EXT-123',
          enlace: 'https://activar.proveedor.example/t/abc',
          instrucciones: 'Abre el enlace desde tu teléfono.',
        },
      },
    ];
    const c = await clientePagado(e);
    await procesar();
    const envio = recibidos[1]!;
    expect(envio.json).toMatchObject({
      evento: 'entrega.solicitada',
      idEntrega: c.entregaId,
      motivo: 'alta',
      plan: { id: e.planId },
    });
    expect(envio.json.cliente).not.toHaveProperty('correo');
    expect(envio.cabeceras['idempotency-key']).toBe(c.entregaId);
    expect(verificarFirma(secreto, String(envio.cabeceras['nv-firma']), envio.cuerpo)).toBe(true);
    expect(verificarFirma('otra-clave', String(envio.cabeceras['nv-firma']), envio.cuerpo)).toBe(
      false,
    );

    const detalle = await e.admin.get(`/entregas/${c.entregaId}`);
    expect(detalle.cuerpo).toMatchObject({
      estado: 'entregada',
      referenciaExterna: 'EXT-123',
      tieneEnlace: true,
      intentos: 1,
    });
    const accesos = await c.n.get('/mi/accesos');
    expect(accesos.cuerpo[0]).toMatchObject({ estado: 'entregada', tieneEnlace: true });
    expect(JSON.stringify(accesos.cuerpo)).not.toContain('activar.proveedor.example');
    const r = await c.n.post(`/mi/accesos/${c.entregaId}/revelar`);
    expect(r.cuerpo).toMatchObject({
      enlace: 'https://activar.proveedor.example/t/abc',
      codigo: null,
      instrucciones: 'Abre el enlace desde tu teléfono.',
    });
  });

  it('409 cuenta como éxito; otro 4xx falla sin reintentar y avisa al equipo', async () => {
    const e = await escenario();
    await conWebhook(e);
    cola = [{ estado: 409, cuerpo: { codigo: 'ya_existe' } }];
    const a = await clientePagado(e);
    await procesar();
    expect(
      (await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: a.entregaId } })).estado,
    ).toBe('entregada');

    cola = [{ estado: 422, cuerpo: { mensaje: 'SKU desconocido' } }];
    const b = await clientePagado(e);
    await procesar();
    const fallida = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: b.entregaId } });
    expect(fallida.estado).toBe('fallida');
    expect(fallida.error).toContain('SKU desconocido');
    expect(await ctx.prisma.notificacion.count({ where: { plantilla: 'entregaFallida' } })).toBe(2);
    await adelantar();
    expect(recibidos.filter((x) => x.json.idEntrega === b.entregaId)).toHaveLength(1);

    // Una respuesta con credenciales se rechaza.
    cola = [{ estado: 200, cuerpo: { instrucciones: 'usuario: ana@correo.com contraseña: 1234' } }];
    const c = await clientePagado(e);
    await procesar();
    const rechazada = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(rechazada.estado).toBe('fallida');
    expect(rechazada.datosCifrados).toBeNull();

    // Reintentar a mano la vuelve a enviar.
    cola = [{ estado: 200, cuerpo: { referencia: 'EXT-9' } }];
    const re = await e.operador.post(`/entregas/${b.entregaId}/reintentar`);
    expect(re.cuerpo).toMatchObject({ estado: 'pendiente', intentos: 0 });
    await procesar();
    expect((await e.admin.get(`/entregas/${b.entregaId}`)).cuerpo).toMatchObject({
      estado: 'entregada',
      referenciaExterna: 'EXT-9',
    });
  });

  it('5xx se reintenta con espera creciente y queda fallida al agotar los intentos', async () => {
    const e = await escenario();
    await conWebhook(e);
    porDefecto = { estado: 503, cuerpo: { mensaje: 'En mantenimiento' } };
    const c = await clientePagado(e);
    await procesar();
    let fila = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(fila).toMatchObject({ estado: 'pendiente', intentos: 1 });
    const espera = fila.proximoIntentoEn!.getTime() - Date.now();
    expect(espera).toBeGreaterThan(50_000);
    expect(espera).toBeLessThan(70_000);
    await adelantar();
    fila = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(fila.intentos).toBe(2);
    const espera2 = fila.proximoIntentoEn!.getTime() - Date.now();
    expect(espera2).toBeGreaterThan(290_000);
    expect(espera2).toBeLessThan(310_000);
    for (let i = 0; i < 4; i += 1) await adelantar();
    fila = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(fila).toMatchObject({ estado: 'fallida', intentos: 6 });
    expect(fila.error).toMatch(/agotaron/);
    expect(recibidos.filter((x) => x.json.evento === 'entrega.solicitada')).toHaveLength(6);
  });

  it('cancelar la suscripción pide al proveedor revocar la entrega', async () => {
    const e = await escenario();
    await conWebhook(e);
    cola = [{ estado: 200, cuerpo: { referencia: 'EXT-R1' } }];
    const c = await clientePagado(e);
    await procesar();
    const cancelar = await e.operador.post(`/suscripciones/${c.suscripcionId}/cancelar`, {
      motivo: 'El cliente lo pidió',
      inmediata: true,
    });
    expect(cancelar.estado).toBe(200);
    await procesar();
    const revocacion = recibidos.find((x) => x.json.evento === 'entrega.revocada');
    expect(revocacion?.json).toMatchObject({ idEntrega: c.entregaId, referencia: 'EXT-R1' });
    const fila = await ctx.prisma.entrega.findUniqueOrThrow({ where: { id: c.entregaId } });
    expect(fila.estado).toBe('revocada');
    expect(fila.revocadaEn).not.toBeNull();
    const r = await c.n.post(`/mi/accesos/${c.entregaId}/revelar`);
    expect(r.estado).toBe(409);
  });
});

describe('accesos del cliente y del revendedor', () => {
  it('mostrar el código queda auditado, sin caché, con límite y solo para su dueño', async () => {
    const e = await escenario();
    await configurar(e, { adaptador: 'codigos' });
    await subirLote(e, 'DEMO-DDDD-0001');
    const c = await clientePagado(e);
    await procesar();
    const lista = await c.n.get('/mi/accesos');
    expect(lista.cuerpo).toHaveLength(1);
    expect(lista.cuerpo[0]).toMatchObject({ tieneCodigo: true, vistaEn: null });
    expect(JSON.stringify(lista.cuerpo)).not.toContain('DDDD');

    const r = await c.n.post(`/mi/accesos/${c.entregaId}/revelar`);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.codigo).toBe('DEMO-DDDD-0001');
    expect(String(r.cabeceras['cache-control'])).toContain('no-store');
    expect((await c.n.get('/mi/accesos')).cuerpo[0].vistaEn).not.toBeNull();
    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { accion: 'entrega.revelada' },
    });
    expect(auditoria).toHaveLength(1);
    expect(JSON.stringify(auditoria)).not.toContain('DDDD');

    // Otra persona: 404 (no 403) y nada en su lista.
    const otro = await conectar(ctx, 'cliente');
    expect((await otro.n.post(`/mi/accesos/${c.entregaId}/revelar`)).estado).toBe(404);
    expect((await otro.n.get('/mi/accesos')).cuerpo).toEqual([]);
    // El equipo no usa la ruta del cliente.
    expect((await e.operador.post(`/mi/accesos/${c.entregaId}/revelar`)).estado).toBe(403);

    // Límite por hora.
    let ultimo = 200;
    for (let i = 0; i < 30 && ultimo === 200; i += 1) {
      ultimo = (await c.n.post(`/mi/accesos/${c.entregaId}/revelar`)).estado;
    }
    expect(ultimo).toBe(429);
  });

  it('la compra de un revendedor se entrega y el revendedor ve el acceso de su cliente', async () => {
    const e = await escenario();
    await configurar(e, { adaptador: 'codigos' });
    await subirLote(e, 'DEMO-EEEE-0001\nDEMO-EEEE-0002');
    await ctx.prisma.proveedor.updateMany({ data: { permiteReventa: true } });
    await e.admin.patch(`/catalogo/planes/${e.planId}`, { revendible: true, costoUsd: '2.00' });
    const nivel = await e.admin.post('/revendedores/niveles', { nombre: 'Plata' });
    await e.admin.pedir('PUT', '/revendedores/precios', {
      planId: e.planId,
      nivelId: nivel.cuerpo.id,
      precioUsd: '4',
    });

    async function revendedor() {
      const { usuario, n } = await conectar(ctx, 'cliente');
      const sol = await n.post('/revendedor/solicitud', {
        nombreComercial: `Tienda ${usuario.nombre}`,
      });
      await e.admin.post(`/revendedores/${sol.cuerpo.id}/aprobar`, { nivelId: nivel.cuerpo.id });
      await n.entrarCompleto(usuario.correo);
      return { n, usuario, id: sol.cuerpo.id as string };
    }
    const r = await revendedor();
    const recarga = await r.n.formulario(
      '/revendedor/recargas',
      { metodoCobroId: e.zelleId, moneda: 'USD', monto: '20', fechaPago: hoy() },
      { campo: 'comprobante', nombre: 'recarga.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(recarga.estado).toBe(201);
    expect(
      (
        await e.operador.post(`/recargas-saldo/${recarga.cuerpo.id}/confirmar`, {
          montoRecibido: '20',
        })
      ).estado,
    ).toBe(200);
    const compra = await r.n.post('/revendedor/compras', {
      tipo: 'alta',
      planId: e.planId,
      cliente: { nombre: 'Ana Pérez', correo: 'ana@cliente.test' },
      claveIdempotencia: randomUUID(),
    });
    expect(compra.estado).toBe(201);
    const entrega = await ctx.prisma.entrega.findFirstOrThrow({
      where: { compraRevendedorId: compra.cuerpo.compra.id },
    });
    expect(entrega).toMatchObject({ motivo: 'compra', revendedorId: r.id, estado: 'pendiente' });
    await procesar();

    const accesos = await r.n.get('/revendedor/accesos');
    expect(accesos.cuerpo).toHaveLength(1);
    expect(accesos.cuerpo[0]).toMatchObject({
      estado: 'entregada',
      tieneCodigo: true,
      cliente: { nombre: 'Ana Pérez' },
    });
    const ver = await r.n.post(`/revendedor/accesos/${entrega.id}/revelar`);
    expect(ver.cuerpo.codigo).toMatch(/^DEMO-EEEE-000[12]$/);
    expect(
      await ctx.prisma.notificacion.count({ where: { plantilla: 'accesoListoRevendedor' } }),
    ).toBe(1);
    // El cliente final del revendedor no recibe el correo de NV.
    expect(await ctx.prisma.correoSaliente.count({ where: { plantilla: 'servicioListo' } })).toBe(
      0,
    );

    const otro = await revendedor();
    expect((await otro.n.post(`/revendedor/accesos/${entrega.id}/revelar`)).estado).toBe(404);
    expect((await otro.n.get('/revendedor/accesos')).cuerpo).toEqual([]);
  });
});

describe('permisos', () => {
  it('cada rol ve y hace solo lo suyo', async () => {
    const e = await escenario();
    const c = await clientePagado(e);
    const ventas = await conectar(ctx, 'ventas');

    expect((await c.n.get('/entregas')).estado).toBe(403);
    expect((await ventas.n.get('/entregas')).estado).toBe(403);
    expect((await ventas.n.get('/inventario')).estado).toBe(403);
    expect((await e.operador.get('/inventario')).estado).toBe(403);
    expect(
      (
        await e.operador.post(`/inventario/planes/${e.planId}/lotes`, {
          nombre: 'X',
          texto: 'ABCD1',
        })
      ).estado,
    ).toBe(403);
    expect(
      (
        await e.operador.pedir('PUT', `/catalogo/proveedores/${e.proveedorId}/entrega`, {
          adaptador: 'codigos',
        })
      ).estado,
    ).toBe(403);
    expect(
      (await e.operador.post(`/catalogo/proveedores/${e.proveedorId}/entrega/secreto`)).estado,
    ).toBe(403);

    const lista = await e.operador.get('/entregas?estado=pendiente');
    expect(lista.estado).toBe(200);
    expect(lista.cuerpo.total).toBe(1);
    expect(lista.cuerpo.contadores.pendiente).toBe(1);
    const anulada = await e.operador.post(`/entregas/${c.entregaId}/anular`, {
      motivo: 'Cliente duplicado',
    });
    expect(anulada.cuerpo.estado).toBe('anulada');
    expect(anulada.cuerpo.historial.map((h: { accion: string }) => h.accion)).toContain(
      'entrega.anulada',
    );
    expect((await e.admin.get('/inventario')).estado).toBe(200);
    // Un webhook a una dirección con credenciales se rechaza.
    const conClave = await e.admin.pedir('PUT', `/catalogo/proveedores/${e.proveedorId}/entrega`, {
      adaptador: 'webhook',
      webhookUrl: 'https://usuario:clave@proveedor.example/nv',
    });
    expect(conClave.estado).toBe(400);
  });
});
