import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@nv/db';
import { REGLAS_COBRO, TIPOS_AUTOMATIZACION } from '@nv/shared';
import { ConfigAutomatizacionesService } from '../../src/automatizaciones/configuracion.service.js';
import { EjecutorAutomatizacionesService } from '../../src/automatizaciones/ejecutor.service.js';
import { inicioDiaCaracas } from '../../src/automatizaciones/horario.js';
import { PlanificadorService } from '../../src/automatizaciones/planificador.service.js';
import { ErrorFuenteTasa } from '../../src/automatizaciones/tasas/fuentes.js';
import { FuentesTasaService } from '../../src/automatizaciones/tasas/tasa-automatica.service.js';
import { TrabajosService } from '../../src/automatizaciones/trabajos.service.js';
import { D } from '../../src/dinero/dinero.js';
import { SuscripcionesService } from '../../src/suscripciones/suscripciones.service.js';
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
  ctx = await crearContexto({ WHATSAPP_PROVEEDOR: 'sandbox' });
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await limpiar(ctx.prisma);
});

const DIA = 24 * 3600_000;

const s = () => ({
  trabajos: ctx.app.get(TrabajosService),
  ejecutor: ctx.app.get(EjecutorAutomatizacionesService),
  planificador: ctx.app.get(PlanificadorService),
  suscripciones: ctx.app.get(SuscripcionesService),
  fuentes: ctx.app.get(FuentesTasaService),
  config: ctx.app.get(ConfigAutomatizacionesService),
});

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  await s().config.asegurar();
  return { admin, operador, ...catalogo };
}

let n = 0;
async function cliente(
  datos: Partial<Prisma.ClienteUncheckedCreateInput> & {
    whatsapp?: { consentimiento: boolean };
  } = {},
) {
  n += 1;
  const { whatsapp, ...resto } = datos;
  return ctx.prisma.cliente.create({
    data: {
      nombre: `Cliente ${n}`,
      correo: `cliente${n}@correo.test`,
      ...resto,
      ...(whatsapp
        ? {
            contactos: {
              create: {
                tipo: 'whatsapp',
                valor: `0414-000${String(n).padStart(4, '0')}`,
                consentimientoEn: whatsapp.consentimiento ? new Date() : null,
              },
            },
          }
        : {}),
    },
  });
}

function suscripcion(
  clienteId: string,
  planId: string,
  datos: Partial<Prisma.SuscripcionUncheckedCreateInput>,
) {
  return ctx.prisma.suscripcion.create({
    data: {
      clienteId,
      planId,
      estado: 'activa',
      moneda: 'VES',
      inicioEn: new Date(Date.now() - 20 * DIA),
      ...datos,
    },
  });
}

const correosA = (para: string, plantilla?: string) =>
  ctx.prisma.correoSaliente.findMany({ where: { para, ...(plantilla ? { plantilla } : {}) } });

async function activar(tipo: string, datos: Prisma.AutomatizacionUpdateInput = {}) {
  await ctx.prisma.automatizacion.update({ where: { tipo }, data: { activa: true, ...datos } });
}

async function revendedor(saldo = '10') {
  const { usuario } = await conectar(ctx, 'revendedor');
  const r = await ctx.prisma.revendedor.create({
    data: { usuarioId: usuario.id, estado: 'aprobado', nombreComercial: 'Reventas Demo' },
  });
  return { usuario, r, saldo };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('cola de trabajos en PostgreSQL', () => {
  it('una clave única repetida no encola dos veces', async () => {
    const { trabajos } = s();
    expect(await trabajos.encolar({ tipo: 'prueba', claveUnica: 'x:1' })).toBe(true);
    expect(await trabajos.encolar({ tipo: 'prueba', claveUnica: 'x:1' })).toBe(false);
    // Dentro de una transacción tampoco la aborta.
    await ctx.prisma.$transaction(async (tx) => {
      expect(await trabajos.encolar({ tipo: 'prueba', claveUnica: 'x:1' }, tx)).toBe(false);
      await tx.auditoria.create({ data: { actorTipo: 'sistema', accion: 'ok', entidad: 'x' } });
    });
    expect(await ctx.prisma.trabajo.count()).toBe(1);
    expect(await ctx.prisma.auditoria.count({ where: { accion: 'ok' } })).toBe(1);
  });

  it('dos trabajadores a la vez nunca toman el mismo trabajo', async () => {
    const { trabajos } = s();
    for (let i = 0; i < 20; i += 1) await trabajos.encolar({ tipo: 'prueba', carga: { i } });
    const lotes = await Promise.all([1, 2, 3, 4].map(() => trabajos.reclamar(6)));
    const ids = lotes.flat().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
    expect(await ctx.prisma.trabajo.count({ where: { estado: 'en_curso' } })).toBe(20);
  });

  it('reintenta con espera exponencial y marca fallido al agotar los intentos', async () => {
    const { trabajos } = s();
    let llamadas = 0;
    trabajos.registrar('prueba.falla', async () => {
      llamadas += 1;
      throw new Error('Proveedor caído');
    });
    await trabajos.encolar({ tipo: 'prueba.falla', maxIntentos: 2 });
    expect(await trabajos.procesarLote()).toBe(1);
    let t = await ctx.prisma.trabajo.findFirstOrThrow();
    expect(t).toMatchObject({ estado: 'pendiente', intentos: 1, ultimoError: 'Proveedor caído' });
    expect(t.ejecutarEn.getTime()).toBeGreaterThan(Date.now() + 20_000);
    // Aún no toca reintentar.
    expect(await trabajos.procesarLote()).toBe(0);
    await ctx.prisma.trabajo.update({ where: { id: t.id }, data: { ejecutarEn: new Date(0) } });
    expect(await trabajos.procesarLote()).toBe(1);
    t = await ctx.prisma.trabajo.findFirstOrThrow();
    expect(t).toMatchObject({ estado: 'fallido', intentos: 2 });
    expect(llamadas).toBe(2);
  });

  it('retoma los trabajos de un trabajador caído cuando vence su reserva', async () => {
    const { trabajos } = s();
    await trabajos.encolar({ tipo: 'prueba' });
    const [caido] = await trabajos.reclamar(1);
    expect(await trabajos.reclamar(1)).toHaveLength(0);
    expect(await trabajos.recuperarVencidos()).toBe(0);
    await ctx.prisma.trabajo.update({
      where: { id: caido!.id },
      data: { bloqueadoHasta: new Date(Date.now() - 1000) },
    });
    expect(await trabajos.recuperarVencidos()).toBe(1);
    const [otro] = await trabajos.reclamar(1);
    expect(otro?.intentos).toBe(2);
    // El trabajador caído ya no puede darlo por terminado.
    await trabajos.completar(caido!);
    expect((await ctx.prisma.trabajo.findFirstOrThrow()).estado).toBe('en_curso');
    await trabajos.completar(otro!);
    expect((await ctx.prisma.trabajo.findFirstOrThrow()).estado).toBe('completado');
  });
});

describe('programador', () => {
  it('encola una sola ejecución por ranura (hora de Venezuela), aunque corra dos veces a la vez', async () => {
    await s().config.asegurar();
    const { planificador } = s();
    const ahora = new Date('2026-09-24T13:05:00Z'); // 09:05 en Caracas
    const [a, b] = await Promise.all([planificador.vuelta(ahora), planificador.vuelta(ahora)]);
    expect(a + b).toBeGreaterThan(0);
    expect(await planificador.vuelta(ahora)).toBe(0);
    const trabajos = await ctx.prisma.trabajo.findMany({ orderBy: { claveUnica: 'asc' } });
    const claves = trabajos.map((t) => t.claveUnica);
    expect(claves).toContain('auto:recordatorio_vencimiento:2026-09-24T13:00:00.000Z');
    expect(claves).toContain('auto:factura_renovacion:2026-09-24T12:00:00.000Z');
    expect(claves).toContain('auto:alerta_sla_tickets:2026-09-24T13:00:00.000Z');
    expect(claves).toContain('vencimientos:2026-09-24T13:00:00.000Z');
    // La tasa automática viene desactivada y las de pagos corren a las 10:00.
    expect(claves.some((c) => c?.includes('tasa_automatica'))).toBe(false);
    expect(claves.some((c) => c?.includes('alerta_pagos_pendientes'))).toBe(false);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('una programada desactivada no hace nada; una manual corre igual', async () => {
    await s().config.asegurar();
    await ctx.prisma.automatizacion.update({
      where: { tipo: 'alerta_sla_tickets' },
      data: { activa: false },
    });
    expect(await s().ejecutor.ejecutar('alerta_sla_tickets', { disparo: 'programada' })).toBeNull();
    const manual = await s().ejecutor.ejecutar('alerta_sla_tickets', { disparo: 'manual' });
    expect(manual).toMatchObject({ estado: 'completada', disparo: 'manual' });
  });
});

describe('avisos a clientes', () => {
  it('recordatorio de vencimiento: una vez por vencimiento y día de aviso, sin clientes de revendedor', async () => {
    const e = await escenario();
    const ahora = new Date();
    const vence = new Date(inicioDiaCaracas(ahora, 3).getTime() + 15 * 3600_000);
    const ana = await cliente({ whatsapp: { consentimiento: false } });
    const beto = await cliente({ whatsapp: { consentimiento: true } });
    const sinRecordatorios = await cliente({ recibirRecordatorios: false });
    const r = await revendedor();
    const deRevendedor = await cliente({ revendedorId: r.r.id });
    const cancela = await cliente();
    for (const c of [ana, beto, sinRecordatorios, deRevendedor]) {
      await suscripcion(c.id, e.planId, { venceEn: vence });
    }
    await suscripcion(cancela.id, e.planId, { venceEn: vence, cancelarAlVencer: true });
    // Otro día de aviso: no toca hoy.
    await suscripcion(ana.id, e.planId, { venceEn: new Date(vence.getTime() + 2 * DIA) });

    const patch = await e.admin.n.patch('/automatizaciones/recordatorio_vencimiento', {
      canales: ['correo', 'whatsapp'],
    });
    expect(patch.estado).toBe(200);

    const primera = await s().ejecutor.ejecutar('recordatorio_vencimiento', {
      disparo: 'manual',
      ahora,
    });
    expect(primera).toMatchObject({ estado: 'completada', procesados: 2, omitidos: 1, errores: 0 });
    expect(await correosA(ana.correo!, 'recordatorioVencimiento')).toHaveLength(1);
    expect(await correosA(beto.correo!, 'recordatorioVencimiento')).toHaveLength(1);
    expect(await correosA(sinRecordatorios.correo!)).toHaveLength(0);
    expect(await correosA(deRevendedor.correo!)).toHaveLength(0);
    expect(await correosA(cancela.correo!)).toHaveLength(0);

    const whatsapp = await ctx.prisma.notificacion.findMany({ where: { canal: 'whatsapp' } });
    const deAna = whatsapp.find((w) => w.clienteId === ana.id)!;
    expect(deAna).toMatchObject({ estado: 'omitida', motivo: 'Sin consentimiento de WhatsApp.' });
    const deBeto = whatsapp.find((w) => w.clienteId === beto.id)!;
    expect(deBeto).toMatchObject({ estado: 'enviada', proveedor: 'sandbox' });
    expect(deBeto.destino).toMatch(/^\+58414/);
    const apagado = await ctx.prisma.notificacion.findFirstOrThrow({
      where: { clienteId: sinRecordatorios.id, canal: 'correo' },
    });
    expect(apagado).toMatchObject({
      estado: 'omitida',
      motivo: 'El cliente desactivó los recordatorios.',
    });

    // Ejecutarla de nuevo no manda nada.
    const segunda = await s().ejecutor.ejecutar('recordatorio_vencimiento', {
      disparo: 'manual',
      ahora,
    });
    expect(segunda).toMatchObject({ procesados: 0, omitidos: 3 });
    expect(await correosA(ana.correo!)).toHaveLength(1);
    expect(await ctx.prisma.notificacion.count()).toBe(6);
  });

  it('factura de renovación: la emite una vez, con instrucciones de pago, y no a clientes de revendedor', async () => {
    const e = await escenario();
    const ahora = new Date();
    const ana = await cliente();
    const r = await revendedor();
    const deRevendedor = await cliente({ revendedorId: r.r.id });
    const sub = await suscripcion(ana.id, e.planId, {
      venceEn: new Date(ahora.getTime() + 2 * DIA),
    });
    await suscripcion(deRevendedor.id, e.planId, { venceEn: new Date(ahora.getTime() + 2 * DIA) });
    await suscripcion(ana.id, e.planId, { venceEn: new Date(ahora.getTime() + 10 * DIA) });

    const primera = await s().ejecutor.ejecutar('factura_renovacion', { disparo: 'manual', ahora });
    expect(primera).toMatchObject({ estado: 'completada', procesados: 1, errores: 0 });
    const facturas = await ctx.prisma.factura.findMany();
    expect(facturas).toHaveLength(1);
    expect(facturas[0]).toMatchObject({
      suscripcionId: sub.id,
      concepto: 'renovacion',
      estado: 'emitida',
      creadoPorId: null,
      moneda: 'VES',
    });
    expect(facturas[0]!.total.toFixed(2)).toBe('200.00');
    const [correo] = await correosA(ana.correo!, 'facturaRenovacion');
    expect(correo?.texto).toContain('Pago Móvil');
    expect(correo?.texto).toContain(`/cuenta/facturas/${facturas[0]!.id}`);
    const auditoria = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'suscripcion.renovacion_facturada' },
    });
    expect(auditoria.actorTipo).toBe('sistema');

    const segunda = await s().ejecutor.ejecutar('factura_renovacion', { disparo: 'manual', ahora });
    expect(segunda).toMatchObject({ procesados: 0, omitidos: 1 });
    expect(await ctx.prisma.factura.count()).toBe(1);
    expect(await correosA(ana.correo!, 'facturaRenovacion')).toHaveLength(1);
  });

  it('gracia y suspensión se avisan aunque el cliente apagara los recordatorios; la reactivación también', async () => {
    const e = await escenario();
    const ana = await cliente({ recibirRecordatorios: false });
    const r = await revendedor();
    const deRevendedor = await cliente({ revendedorId: r.r.id });
    const vence = new Date(Date.now() - 1000);
    const sub = await suscripcion(ana.id, e.planId, { venceEn: vence });
    await suscripcion(deRevendedor.id, e.planId, { venceEn: vence });
    const { suscripciones, trabajos } = s();

    expect(await suscripciones.aplicarVencimientos(new Date(vence.getTime() + 1000))).toBe(2);
    // El aviso se encoló en la misma transacción que el cambio de estado.
    expect(await ctx.prisma.trabajo.count({ where: { tipo: 'aviso.suscripcion' } })).toBe(2);
    await trabajos.procesarTodo();
    expect(await correosA(ana.correo!, 'avisoGracia')).toHaveLength(1);
    const omitida = await ctx.prisma.notificacion.findFirstOrThrow({
      where: { clienteId: deRevendedor.id },
    });
    expect(omitida.estado).toBe('omitida');
    expect(omitida.motivo).toMatch(/revendedor/);

    const finGracia = new Date(vence.getTime() + (REGLAS_COBRO.diasGracia + 1) * DIA);
    expect(await suscripciones.aplicarVencimientos(finGracia)).toBe(2);
    await trabajos.procesarTodo();
    expect(await correosA(ana.correo!, 'avisoSuspension')).toHaveLength(1);
    expect(await ctx.prisma.trabajo.count({ where: { estado: { not: 'completado' } } })).toBe(0);

    // Pagar la renovación reactiva la suscripción y encola el aviso en la misma transacción.
    await ctx.prisma.$transaction((tx) =>
      suscripciones.aplicarPeriodo(tx, sub.id, 'renovacion', null, {}),
    );
    await trabajos.procesarTodo();
    const [recuperacion] = await correosA(ana.correo!, 'avisoRecuperacion');
    expect(recuperacion?.texto).toContain('vuelve a estar activo');
    // Aunque el trabajo se repita, el aviso no sale dos veces (clave única del aviso).
    const clave = (
      await ctx.prisma.trabajo.findFirstOrThrow({
        where: { carga: { path: ['automatizacion'], equals: 'aviso_recuperacion' } },
      })
    ).claveUnica;
    await trabajos.encolar({
      tipo: 'aviso.suscripcion',
      carga: { automatizacion: 'aviso_recuperacion', suscripcionId: sub.id },
      claveUnica: `${clave}:repetido`,
    });
    await trabajos.procesarTodo();
    expect(await correosA(ana.correo!)).toHaveLength(3);
  });

  it('un aviso por evento no sale si la automatización está desactivada o el estado ya cambió', async () => {
    const e = await escenario();
    const ana = await cliente();
    const vence = new Date(Date.now() - 1000);
    const sub = await suscripcion(ana.id, e.planId, { venceEn: vence });
    await ctx.prisma.automatizacion.update({
      where: { tipo: 'aviso_gracia' },
      data: { activa: false },
    });
    await s().suscripciones.aplicarVencimientos(new Date(vence.getTime() + 1000));
    await s().trabajos.procesarTodo();
    expect(await correosA(ana.correo!)).toHaveLength(0);
    // Reactivada antes de que salga el aviso de suspensión: no se envía.
    await ctx.prisma.automatizacion.update({
      where: { tipo: 'aviso_gracia' },
      data: { activa: true },
    });
    await s().suscripciones.aplicarVencimientos(
      new Date(vence.getTime() + (REGLAS_COBRO.diasGracia + 1) * DIA),
    );
    await ctx.prisma.suscripcion.update({ where: { id: sub.id }, data: { estado: 'activa' } });
    await s().trabajos.procesarTodo();
    expect(await correosA(ana.correo!)).toHaveLength(0);
  });
});

describe('avisos al equipo', () => {
  it('escalado: abre un ticket del sistema una sola vez por suspensión y avisa a soporte', async () => {
    const e = await escenario();
    const clienteUsuario = await conectar(ctx, 'cliente');
    const ficha = await ctx.prisma.cliente.create({
      data: {
        nombre: 'Carla',
        correo: clienteUsuario.usuario.correo,
        usuarioId: clienteUsuario.usuario.id,
      },
    });
    const sub = await suscripcion(ficha.id, e.planId, {
      estado: 'suspendida',
      venceEn: new Date(Date.now() - 10 * DIA),
    });
    await ctx.prisma.eventoSuscripcion.create({
      data: { suscripcionId: sub.id, tipo: 'suspension', motivo: 'Sin pago' },
    });
    const ahora = new Date(Date.now() + 4 * DIA);
    const r1 = await s().ejecutor.ejecutar('escalado_suspension', { disparo: 'manual', ahora });
    expect(r1).toMatchObject({ procesados: 1, errores: 0 });
    const r2 = await s().ejecutor.ejecutar('escalado_suspension', { disparo: 'manual', ahora });
    expect(r2).toMatchObject({ procesados: 0, omitidos: 1 });

    const tickets = await ctx.prisma.ticket.findMany({ include: { mensajes: true } });
    expect(tickets).toHaveLength(1);
    const t = tickets[0]!;
    expect(t).toMatchObject({
      origen: 'sistema',
      creadoPorId: null,
      prioridad: 'alta',
      categoria: 'pagos',
      suscripcionId: sub.id,
    });
    expect(t.mensajes.every((m) => m.autorId === null)).toBe(true);
    // Avisa a quienes gestionan tickets (administración y operación).
    expect(await correosA(e.admin.usuario.correo, 'escaladoSuspension')).toHaveLength(1);
    expect(await correosA(e.operador.usuario.correo, 'escaladoSuspension')).toHaveLength(1);

    // Se ve en los endpoints de tickets, con el autor del sistema.
    const lista = await e.admin.n.get('/tickets');
    expect(lista.cuerpo.elementos[0].origen).toBe('sistema');
    const detalle = await e.admin.n.get(`/tickets/${t.id}`);
    expect(detalle.estado).toBe(200);
    expect(detalle.cuerpo.mensajes).toHaveLength(2);
    expect(detalle.cuerpo.mensajes[0].autor).toMatchObject({ id: 'sistema', esEquipo: true });
    const delCliente = await clienteUsuario.n.get(`/mi/tickets/${t.id}`);
    expect(delCliente.cuerpo.mensajes).toHaveLength(1);
    expect(delCliente.cuerpo.mensajes[0].texto).toContain('suspendida');
    // El equipo puede responderlo como cualquier otro.
    const resp = await e.admin.n.post(`/tickets/${t.id}/mensajes`, {
      texto: 'Hola, te escribimos para ayudarte.',
      interno: false,
    });
    expect(resp.estado).toBe(201);
  });

  it('tickets fuera de plazo: una alerta por ticket, al asignado o a todo soporte', async () => {
    const e = await escenario();
    const c = await cliente();
    const base = {
      clienteId: c.id,
      asunto: 'No puedo entrar',
      categoria: 'acceso' as const,
      slaPrimeraRespuesta: new Date(Date.now() - 3600_000),
      origen: 'cliente',
    };
    const creador = await conectar(ctx, 'cliente');
    const libre = await ctx.prisma.ticket.create({
      data: { ...base, creadoPorId: creador.usuario.id },
    });
    await ctx.prisma.ticket.create({
      data: { ...base, creadoPorId: creador.usuario.id, asignadoAId: e.operador.usuario.id },
    });
    await ctx.prisma.ticket.create({
      data: { ...base, creadoPorId: creador.usuario.id, primeraRespuestaEn: new Date() },
    });
    const r1 = await s().ejecutor.ejecutar('alerta_sla_tickets', { disparo: 'manual' });
    expect(r1).toMatchObject({ procesados: 2, errores: 0 });
    expect(await correosA(e.admin.usuario.correo, 'alertaSla')).toHaveLength(1);
    expect(await correosA(e.operador.usuario.correo, 'alertaSla')).toHaveLength(2);
    const r2 = await s().ejecutor.ejecutar('alerta_sla_tickets', { disparo: 'manual' });
    expect(r2).toMatchObject({ procesados: 0, omitidos: 2 });
    expect(await ctx.prisma.correoSaliente.count({ where: { plantilla: 'alertaSla' } })).toBe(3);
    expect(libre.id).toBeTruthy();
  });

  it('pagos por conciliar: resumen diario a cobros, y nada si no hay pendientes', async () => {
    const e = await escenario();
    const vacio = await s().ejecutor.ejecutar('alerta_pagos_pendientes', { disparo: 'manual' });
    expect(vacio?.resumen).toMatch(/No hay pagos/);
    const c = await conectar(ctx, 'cliente');
    const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const pago = await c.n.formulario(
      `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
      {
        metodoCobroId: e.pagoMovilId,
        monto: '200',
        referenciaExterna: 'REF123456',
        fechaPago: hoy(),
      },
      { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(pago.estado).toBe(201);
    await ctx.prisma.pago.updateMany({ data: { creadoEn: new Date(Date.now() - 13 * 3600_000) } });
    const r = await s().ejecutor.ejecutar('alerta_pagos_pendientes', { disparo: 'manual' });
    expect(r).toMatchObject({ estado: 'completada', procesados: 2 });
    const [resumen] = await correosA(e.admin.usuario.correo, 'pagosPendientes');
    expect(resumen?.texto).toContain(pago.cuerpo.referencia);
    expect(resumen?.texto).toContain('/admin/cobros');
    expect(await correosA(e.operador.usuario.correo, 'pagosPendientes')).toHaveLength(1);
  });
});

describe('saldo bajo del revendedor', () => {
  it('avisa al cruzar el umbral hacia abajo y no repite hasta que el saldo vuelve a subir', async () => {
    const e = await escenario();
    const { usuario, r } = await revendedor();
    const ajustar = (montoUsd: string) =>
      e.admin.n.post(`/revendedores/${r.id}/ajustes`, { montoUsd, motivo: 'Prueba de saldo' });
    expect((await ajustar('10')).estado).toBe(201);
    expect((await ajustar('-6')).estado).toBe(201); // 10 → 4: cruza 5
    expect((await ajustar('-1')).estado).toBe(201); // 4 → 3: ya estaba por debajo
    await s().trabajos.procesarTodo();
    let correos = await correosA(usuario.correo, 'saldoBajoRevendedor');
    expect(correos).toHaveLength(1);
    expect(correos[0]?.texto).toContain('/revendedor/saldo');
    await ajustar('10'); // 13
    await ajustar('-9'); // 4: cruza otra vez
    await s().trabajos.procesarTodo();
    correos = await correosA(usuario.correo, 'saldoBajoRevendedor');
    expect(correos).toHaveLength(2);
  });
});

describe('tasa automática', () => {
  it('registra la tasa como automática, ignora un valor igual y no aplica un salto grande', async () => {
    const e = await escenario();
    await activar('tasa_automatica');
    const obtener = vi.spyOn(s().fuentes, 'obtener');

    obtener.mockResolvedValue({ valor: D('41.5'), fuente: 'bcv' });
    const aplicada = await s().ejecutor.ejecutar('tasa_automatica', { disparo: 'programada' });
    expect(aplicada).toMatchObject({ estado: 'completada', procesados: 1 });
    const historial = await e.admin.n.get('/finanzas/tasas/VES/historial');
    expect(historial.cuerpo[0]).toMatchObject({
      valor: '41.500000',
      origen: 'automatica',
      fuente: 'bcv',
      autor: null,
    });
    expect(historial.cuerpo[1]).toMatchObject({ valor: '40.000000', origen: 'manual' });
    const auditoria = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'tasa.registrada', actorTipo: 'sistema' },
    });
    expect(auditoria.actorId).toBeNull();

    const igual = await s().ejecutor.ejecutar('tasa_automatica', { disparo: 'programada' });
    expect(igual).toMatchObject({ estado: 'completada', procesados: 0, omitidos: 1 });
    expect(igual?.resumen).toMatch(/no cambió/);

    obtener.mockResolvedValue({ valor: D('60'), fuente: 'bcv' });
    const salto = await s().ejecutor.ejecutar('tasa_automatica', { disparo: 'programada' });
    expect(salto).toMatchObject({ estado: 'con_errores', procesados: 0 });
    expect(salto?.resumen).toMatch(/No se aplicó/);
    expect(await ctx.prisma.tasaCambio.count()).toBe(2);
    expect(await correosA(e.admin.usuario.correo, 'tasaNoAplicada')).toHaveLength(1);
    // Operación no configura finanzas: no recibe el aviso.
    expect(await correosA(e.operador.usuario.correo, 'tasaNoAplicada')).toHaveLength(0);

    obtener.mockRejectedValue(new ErrorFuenteTasa('No se pudo conectar con la fuente de la tasa.'));
    const caida = await s().ejecutor.ejecutar('tasa_automatica', { disparo: 'programada' });
    expect(caida).toMatchObject({
      estado: 'fallida',
      resumen: 'No se pudo conectar con la fuente de la tasa.',
    });
  });

  it('probar la fuente no guarda nada y explica el error', async () => {
    const e = await escenario();
    const obtener = vi.spyOn(s().fuentes, 'obtener');
    obtener.mockResolvedValue({ valor: D('42'), fuente: 'bcv' });
    const ok = await e.admin.n.post('/automatizaciones/tasa/probar', {});
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo).toMatchObject({
      fuente: 'bcv',
      valor: '42.000000',
      vigente: '40.000000',
      variacionPct: '5.00',
    });
    expect(await ctx.prisma.tasaCambio.count()).toBe(1);
    obtener.mockRejectedValue(new ErrorFuenteTasa('La página del BCV cambió.'));
    const mal = await e.admin.n.post('/automatizaciones/tasa/probar', { fuente: 'bcv' });
    expect(mal.estado).toBe(502);
    expect(mal.cuerpo.error).toMatchObject({
      codigo: 'FUENTE_TASA_FALLIDA',
      mensaje: 'La página del BCV cambió.',
    });
    expect((await e.operador.n.post('/automatizaciones/tasa/probar', {})).estado).toBe(403);
  });
});

describe('panel de automatizaciones', () => {
  it('operación ve el panel pero no lo configura; ventas y clientes no entran', async () => {
    const e = await escenario();
    const ventas = await conectar(ctx, 'ventas');
    const c = await conectar(ctx, 'cliente');
    const panel = await e.operador.n.get('/automatizaciones');
    expect(panel.estado).toBe(200);
    expect(panel.cuerpo.automatizaciones).toHaveLength(TIPOS_AUTOMATIZACION.length);
    const recordatorio = panel.cuerpo.automatizaciones.find(
      (a: { tipo: string }) => a.tipo === 'recordatorio_vencimiento',
    );
    expect(recordatorio).toMatchObject({
      activa: true,
      canales: ['correo'],
      canalesPermitidos: ['correo', 'whatsapp'],
      parametros: { diasAntes: [7, 3, 1], hora: 9 },
      ultimaEjecucion: null,
    });
    expect(recordatorio.proximaEjecucionEn).toMatch(/T13:00:00.000Z$/);
    const gracia = panel.cuerpo.automatizaciones.find(
      (a: { tipo: string }) => a.tipo === 'aviso_gracia',
    );
    expect(gracia.proximaEjecucionEn).toBeNull();
    expect(panel.cuerpo.canales).toEqual({
      correo: { proveedor: 'sandbox' },
      whatsapp: { proveedor: 'sandbox', listo: true },
      fuentesTasa: { bcv: true, json: false },
      trabajador: { ultimoLatidoEn: null, activo: false },
    });
    expect(
      (await e.operador.n.patch('/automatizaciones/recordatorio_vencimiento', { activa: false }))
        .estado,
    ).toBe(403);
    expect(
      (await e.operador.n.post('/automatizaciones/recordatorio_vencimiento/ejecutar')).estado,
    ).toBe(403);
    expect(
      (await e.operador.n.get('/automatizaciones/recordatorio_vencimiento/ejecuciones')).estado,
    ).toBe(200);
    expect((await e.operador.n.get('/notificaciones')).estado).toBe(200);
    expect(
      (await e.operador.n.post('/notificaciones/prueba', { canal: 'correo', destino: 'a@b.co' }))
        .estado,
    ).toBe(403);
    for (const otro of [ventas.n, c.n]) {
      expect((await otro.get('/automatizaciones')).estado).toBe(403);
      expect((await otro.get('/notificaciones')).estado).toBe(403);
    }
    expect((await new Navegador(ctx.app).get('/automatizaciones')).estado).toBe(401);
  });

  it('administración configura con validación por tipo y queda auditado', async () => {
    const e = await escenario();
    const malHora = await e.admin.n.patch('/automatizaciones/recordatorio_vencimiento', {
      parametros: { hora: 25 },
    });
    expect(malHora.estado).toBe(400);
    expect(malHora.cuerpo.error.campos['parametros.hora']).toBeDefined();
    const malCanal = await e.admin.n.patch('/automatizaciones/escalado_suspension', {
      canales: ['whatsapp'],
    });
    expect(malCanal.estado).toBe(400);
    expect(malCanal.cuerpo.error.campos.canales).toBeDefined();
    expect((await e.admin.n.patch('/automatizaciones/no_existe', { activa: true })).estado).toBe(
      400,
    );

    const ok = await e.admin.n.patch('/automatizaciones/tasa_automatica', {
      activa: true,
      parametros: { horas: [8, 14], variacionMaximaPct: 5 },
    });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo).toMatchObject({
      tipo: 'tasa_automatica',
      activa: true,
      parametros: { fuente: 'bcv', horas: [8, 14], variacionMaximaPct: 5 },
      actualizadoPor: { id: e.admin.usuario.id },
    });
    expect(ok.cuerpo.proximaEjecucionEn).not.toBeNull();
    const a = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'automatizacion.actualizada' },
    });
    expect(a).toMatchObject({ entidadId: 'tasa_automatica', actorId: e.admin.usuario.id });
    expect((a.antes as { activa: boolean }).activa).toBe(false);
    expect((a.despues as { activa: boolean }).activa).toBe(true);
  });

  it('"Ejecutar ahora" encola una ejecución manual y el historial la muestra', async () => {
    const e = await escenario();
    const evento = await e.admin.n.post('/automatizaciones/aviso_gracia/ejecutar');
    expect(evento.estado).toBe(409);
    const r = await e.admin.n.post('/automatizaciones/alerta_sla_tickets/ejecutar');
    expect(r.estado).toBe(202);
    expect(r.cuerpo.mensaje).toMatch(/trabajador no está en marcha/);
    // Un doble clic no encola otra.
    expect((await e.admin.n.post('/automatizaciones/alerta_sla_tickets/ejecutar')).estado).toBe(
      202,
    );
    expect(await ctx.prisma.trabajo.count()).toBe(1);
    await s().trabajos.procesarTodo();
    const historial = await e.operador.n.get(
      '/automatizaciones/alerta_sla_tickets/ejecuciones?pagina=1',
    );
    expect(historial.cuerpo).toMatchObject({ total: 1, pagina: 1, porPagina: 20 });
    expect(historial.cuerpo.elementos[0]).toMatchObject({
      tipo: 'alerta_sla_tickets',
      estado: 'completada',
      disparo: 'manual',
    });
    const panel = await e.operador.n.get('/automatizaciones');
    const sla = panel.cuerpo.automatizaciones.find(
      (a: { tipo: string }) => a.tipo === 'alerta_sla_tickets',
    );
    expect(sla.ultimaEjecucion.id).toBe(historial.cuerpo.elementos[0].id);

    // Con un latido reciente, el panel da el trabajador por activo.
    await ctx.prisma.latidoTrabajador.create({
      data: {
        id: 'prueba:1',
        host: 'prueba',
        pid: 1,
        iniciadoEn: new Date(),
        ultimoLatidoEn: new Date(),
      },
    });
    const con = await e.admin.n.get('/automatizaciones');
    expect(con.cuerpo.canales.trabajador.activo).toBe(true);
  });

  it('registro de avisos con destinos ocultos y mensaje de prueba con límite', async () => {
    const e = await escenario();
    const prueba = await e.admin.n.post('/notificaciones/prueba', {
      canal: 'correo',
      destino: 'maria.perez@gmail.com',
    });
    expect(prueba.estado).toBe(200);
    expect(prueba.cuerpo.mensaje).toBe('Enviamos un correo de prueba a ma***@gmail.com.');
    expect(await correosA('maria.perez@gmail.com', 'avisoPrueba')).toHaveLength(1);
    const wa = await e.admin.n.post('/notificaciones/prueba', {
      canal: 'whatsapp',
      destino: '0414-1234567',
    });
    expect(wa.estado).toBe(200);
    expect(wa.cuerpo.mensaje).toContain('+58 ***-***-4567');
    const lista = await e.admin.n.get('/notificaciones?canal=correo');
    expect(lista.cuerpo.total).toBe(1);
    expect(lista.cuerpo.elementos[0]).toMatchObject({
      canal: 'correo',
      plantilla: 'avisoPrueba',
      destino: 'ma***@gmail.com',
      estado: 'enviada',
      usuario: { id: e.admin.usuario.id },
      cliente: null,
      automatizacion: null,
    });
    const invalido = await e.admin.n.post('/notificaciones/prueba', {
      canal: 'correo',
      destino: 'no-es-correo',
    });
    expect(invalido.estado).toBe(400);
    for (let i = 0; i < 3; i += 1) {
      await e.admin.n.post('/notificaciones/prueba', { canal: 'correo', destino: 'x@correo.test' });
    }
    const limite = await e.admin.n.post('/notificaciones/prueba', {
      canal: 'correo',
      destino: 'x@correo.test',
    });
    expect(limite.estado).toBe(429);
  });
});

describe('preferencias de avisos del cliente', () => {
  it('el cliente apaga los recordatorios y queda auditado', async () => {
    const e = await escenario();
    const c = await conectar(ctx, 'cliente');
    expect((await c.n.get('/autoservicio/preferencias')).cuerpo).toEqual({
      recibirRecordatorios: true,
    });
    const put = await c.n.pedir('PUT', '/autoservicio/preferencias', {
      recibirRecordatorios: false,
    });
    expect(put.estado).toBe(200);
    expect(put.cuerpo).toEqual({ recibirRecordatorios: false });
    expect((await c.n.get('/mi/preferencias')).cuerpo).toEqual({ recibirRecordatorios: false });
    const ficha = await ctx.prisma.cliente.findUniqueOrThrow({
      where: { usuarioId: c.usuario.id },
    });
    expect(ficha.recibirRecordatorios).toBe(false);
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'cliente.preferencias_avisos' } }),
    ).toBe(1);
    expect(
      (await c.n.pedir('PUT', '/autoservicio/preferencias', { recibirRecordatorios: 'no' })).estado,
    ).toBe(400);
    expect((await e.operador.n.get('/autoservicio/preferencias')).estado).toBe(403);
  });
});
