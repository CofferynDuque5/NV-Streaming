import { leerRespaldoGestor } from '@nv/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conectar, type Contexto, crearContexto, limpiar, prepararCatalogo } from './ayudas.js';

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

/** Copia del Gestor con datos inventados. */
const RESPALDO = {
  db: {
    platforms: [{ id: 'plat_1', name: 'Cine viejo' }],
    accounts: {
      plat_1: [
        {
          id: 'a_1',
          email: 'cine1@example.com',
          password: 'Clave-Secreta-1',
          expiry: '2099-01-10',
          costoCuenta: 6,
          numProfiles: 3,
        },
        { id: 'a_2', email: 'cine2@example.com', password: 'Clave-2', cost: 4, numProfiles: 1 },
      ],
    },
    clients: {
      plat_1: [
        {
          id: 'c_1',
          accountId: 'a_1',
          slotIndex: 0,
          email: 'Perfil 1',
          pin: '4321',
          nombre: 'Ana',
          apellido: 'Pérez',
          contacto: '+58 412 555 1234',
          vencimientoCliente: '2099-02-01',
          precioVenta: 3,
        },
        {
          id: 'c_2',
          accountId: 'a_1',
          slotIndex: 1,
          email: 'Perfil 2',
          nombre: 'Luis',
          contacto: 'luis@example.com',
          vencimientoCliente: '2020-01-01',
          precioVenta: 2,
        },
        { id: 'c_3', accountId: 'a_1', slotIndex: 2, email: 'Perfil 3', nombre: 'Sin asignar' },
        {
          id: 'c_4',
          accountId: 'a_2',
          slotIndex: 0,
          email: 'Perfil 1',
          nombre: 'Ana',
          apellido: 'Pérez',
          contacto: '04125551234',
          vencimientoCliente: '2099-03-01',
          precioVenta: 3,
        },
      ],
    },
  },
};

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const [plat] = leerRespaldoGestor(RESPALDO).plataformas;
  const cuerpo = {
    plataforma: { origenId: plat!.origenId, nombre: plat!.nombre },
    servicioId: catalogo.servicioId,
    planId: catalogo.planId,
    cuentas: plat!.cuentas,
  };
  return { admin, operador, catalogo, cuerpo };
}

const conteos = async () => ({
  cuentas: await ctx.prisma.cuentaServicio.count(),
  perfiles: await ctx.prisma.perfilCuenta.count(),
  clientes: await ctx.prisma.cliente.count(),
  suscripciones: await ctx.prisma.suscripcion.count(),
});

describe('importar el Gestor viejo', () => {
  it('simula sin escribir, importa todo o nada y deshace el lote', async () => {
    const { admin, operador, cuerpo } = await escenario();

    expect((await operador.n.post('/cuentas/gestor/simular', cuerpo)).cuerpo.error.codigo).toBe(
      'SOLO_ADMINISTRACION',
    );

    // Luis ya es cliente del panel: se reutiliza por su correo.
    const luis = await admin.n.post('/clientes', {
      nombre: 'Luis Gómez',
      correo: 'luis@example.com',
    });
    expect(luis.estado).toBe(201);
    const antes = await conteos();

    const sim = await admin.n.post('/cuentas/gestor/simular', cuerpo);
    expect(sim.estado).toBe(200);
    expect(sim.cuerpo).toMatchObject({
      cuentas: { enArchivo: 2, nuevas: 2, yaEstaban: 0, yaImportadas: 0 },
      perfiles: { nuevos: 4, libres: 1, asignados: 3 },
      clientes: { nuevos: 1, existentes: 1, sinContacto: 0 },
      suscripciones: { activas: 2, vencidas: 1 },
      costoUsd: '10.00',
      ventaUsd: '8.00',
    });
    expect(await conteos()).toEqual(antes);

    const imp = await admin.n.post('/cuentas/gestor/importar', cuerpo);
    expect(imp.estado).toBe(201);
    expect(await conteos()).toEqual({
      cuentas: 2,
      perfiles: 4,
      clientes: antes.clientes + 1,
      suscripciones: 3,
    });
    const ana = await ctx.prisma.cliente.findFirstOrThrow({
      where: { nombre: 'Ana Pérez' },
      include: { contactos: true, suscripciones: { orderBy: { venceEn: 'asc' } } },
    });
    expect(ana.origen).toBe('gestor');
    expect(ana.contactos).toMatchObject([
      { tipo: 'whatsapp', valor: '+584125551234', consentimientoEn: null },
    ]);
    expect(ana.suscripciones.map((s) => s.estado)).toEqual(['activa', 'activa']);
    const deLuis = await ctx.prisma.suscripcion.findFirstOrThrow({
      where: { clienteId: luis.cuerpo.id },
    });
    expect(deLuis.estado).toBe('vencida');

    const cuenta = await ctx.prisma.cuentaServicio.findFirstOrThrow({
      where: { pista: { startsWith: 'ci' }, modo: 'perfiles', costoUsd: 6 },
      include: { perfiles: { orderBy: { numero: 'asc' } } },
    });
    expect(cuenta.claveCifrada).not.toContain('Clave-Secreta-1');
    expect(cuenta.facturaEn?.toISOString().slice(0, 10)).toBe('2099-01-10');
    expect(cuenta.perfiles.map((p) => p.estado)).toEqual(['asignado', 'asignado', 'libre']);
    expect(cuenta.perfiles[0]!.pinCifrado).not.toBeNull();
    const ver = await admin.n.post(`/cuentas/${cuenta.id}/revelar`, {});
    expect(ver.cuerpo).toMatchObject({ usuario: 'cine1@example.com', clave: 'Clave-Secreta-1' });
    expect(ver.cuerpo.perfiles[0]).toMatchObject({ numero: 1, pin: '4321' });

    // Repetir no duplica nada.
    expect((await admin.n.post('/cuentas/gestor/importar', cuerpo)).cuerpo.error.codigo).toBe(
      'NADA_QUE_IMPORTAR',
    );
    expect((await admin.n.post('/cuentas/gestor/simular', cuerpo)).cuerpo.cuentas).toMatchObject({
      nuevas: 0,
      yaImportadas: 2,
    });

    const lotes = await admin.n.get('/cuentas/gestor/lotes');
    expect(lotes.cuerpo).toHaveLength(1);
    expect(lotes.cuerpo[0]).toMatchObject({ plataforma: 'Cine viejo', revertidoEn: null });
    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { accion: { startsWith: 'gestor.' } },
    });
    expect(JSON.stringify(auditoria)).not.toMatch(/Clave-Secreta|cine1@|Pérez|4321/);

    const deshacer = await admin.n.post(`/cuentas/gestor/lotes/${imp.cuerpo.loteId}/deshacer`, {});
    expect(deshacer.estado).toBe(204);
    expect(await conteos()).toEqual(antes);
    expect(await ctx.prisma.cliente.count({ where: { id: luis.cuerpo.id } })).toBe(1);
    expect(
      (await admin.n.post(`/cuentas/gestor/lotes/${imp.cuerpo.loteId}/deshacer`, {})).cuerpo.error
        .codigo,
    ).toBe('LOTE_REVERTIDO');
    // Deshecho, se puede volver a importar.
    expect((await admin.n.post('/cuentas/gestor/importar', cuerpo)).estado).toBe(201);
  });

  it('Spotify: miembros a su correo, cuentas a correo sin clave ni fecha y clientes sin cuenta', async () => {
    const admin = await conectar(ctx, 'admin');
    const catalogo = await prepararCatalogo(admin.n);
    const [sp] = leerRespaldoGestor({
      db: {
        platforms: [{ id: 'sp', name: 'Spotify' }],
        accounts: {
          sp: [
            {
              id: 'fam',
              email: 'familia@example.com',
              password: 'F-1',
              numProfiles: 3,
              caidaReportada: true,
            },
            { id: 'nada', email: '', password: '', numProfiles: 2 },
          ],
        },
        clients: {
          sp: [
            {
              id: 's1',
              accountId: 'fam',
              slotIndex: 1,
              email: 'familia@example.com',
              nombre: 'Sin asignar',
            },
            {
              id: 's2',
              accountId: 'fam',
              slotIndex: 2,
              email: 'rosa@example.com',
              password: 'Rosa-1',
              nombre: 'Rosa',
              contacto: '+584141112244',
            },
            { id: 's3', email: 'juan@example.com', nombre: 'Juan', contacto: '+584141112255' },
            {
              id: 's4',
              nombre: 'Pedro',
              contacto: '+584141112266',
              vencimientoCliente: '2099-01-01',
              precioVenta: 2,
            },
            { id: 's5', accountId: 'borrada', nombre: 'Marta', contacto: '+584141112277' },
          ],
        },
      },
    }).plataformas;
    const cuerpo = {
      plataforma: { origenId: sp!.origenId, nombre: sp!.nombre },
      servicioId: catalogo.servicioId,
      planId: catalogo.planId,
      cuentas: sp!.cuentas,
      clientesSueltos: sp!.clientesSueltos,
    };
    const sim = await admin.n.post('/cuentas/gestor/simular', cuerpo);
    expect(sim.cuerpo).toMatchObject({
      cuentas: { nuevas: 3 },
      clientes: { nuevos: 4, sinPerfil: 2 },
      suscripciones: { activas: 2, vencidas: 0 },
    });
    const imp = await admin.n.post('/cuentas/gestor/importar', cuerpo);
    expect(imp.estado).toBe(201);

    const fam = await ctx.prisma.cuentaServicio.findFirstOrThrow({
      where: { estado: 'caida' },
      include: { perfiles: { orderBy: { numero: 'asc' } } },
    });
    expect(fam.perfiles.map((p) => [p.nombre, p.estado])).toEqual([
      ['Principal', 'libre'],
      ['Miembro 1', 'asignado'],
      ['Miembro 2', 'libre'],
    ]);
    expect(fam.perfiles[1]!.usuarioMiembroCifrado).not.toBeNull();
    expect(fam.perfiles[1]!.usuarioMiembroCifrado).not.toContain('rosa@');
    expect(fam.perfiles[1]!.claveMiembroCifrada).not.toBeNull();
    expect(await ctx.prisma.cuentaServicio.count({ where: { modo: 'completa' } })).toBe(1);
    expect(
      await ctx.prisma.cuentaServicio.count({ where: { notas: { contains: 'no tenía correo' } } }),
    ).toBe(1);
    // Juan (a su correo) queda activo y sin fecha, como en el Gestor.
    const juan = await ctx.prisma.cliente.findFirstOrThrow({
      where: { nombre: 'Juan' },
      include: { suscripciones: true },
    });
    expect(juan.suscripciones).toMatchObject([{ estado: 'activa', venceEn: null }]);
    // Pedro y Marta entran sin perfil, con su nota.
    const notas = await ctx.prisma.notaInterna.findMany({ include: { cliente: true } });
    expect(notas.map((n) => n.cliente!.nombre).sort()).toEqual(['Marta', 'Pedro']);
    expect(notas.find((n) => n.cliente!.nombre === 'Pedro')!.texto).toMatch(
      /no tenía cuenta asignada.*2099-01-01.*2\.00 USD/,
    );

    // Repetir no duplica las notas.
    expect((await admin.n.post('/cuentas/gestor/importar', cuerpo)).cuerpo.error.codigo).toBe(
      'NADA_QUE_IMPORTAR',
    );
    expect(
      (await admin.n.post(`/cuentas/gestor/lotes/${imp.cuerpo.loteId}/deshacer`, {})).estado,
    ).toBe(204);
    expect(await ctx.prisma.notaInterna.count()).toBe(0);
    expect(await ctx.prisma.cliente.count({ where: { origen: 'gestor' } })).toBe(0);
    expect(await ctx.prisma.cuentaServicio.count()).toBe(0);
  });

  it('papelera: cuentas retiradas y clientes borrados con nota', async () => {
    const admin = await conectar(ctx, 'admin');
    const catalogo = await prepararCatalogo(admin.n);
    const [n] = leerRespaldoGestor({
      db: {
        platforms: [{ id: 'n', name: 'Netflix' }],
        accounts: { n: [] },
        clients: { n: [] },
        papelera: {
          cuentas: [
            {
              id: 'pa',
              _platId: 'n',
              email: 'vieja@example.com',
              password: 'V-1',
              numProfiles: 2,
              _deletedAt: '2026-10-01T00:00:00Z',
              _clientsJson: JSON.stringify([{ id: 'h', nombre: 'Rosa', pin: '1111' }]),
            },
          ],
          clientes: [
            {
              id: 'pc',
              _platId: 'n',
              nombre: 'Luis',
              contacto: '+584141112233',
              _deletedAt: '2026-10-02T00:00:00Z',
            },
          ],
        },
      },
    }).plataformas;
    const imp = await admin.n.post('/cuentas/gestor/importar', {
      plataforma: { origenId: n!.origenId, nombre: n!.nombre },
      servicioId: catalogo.servicioId,
      planId: catalogo.planId,
      cuentas: n!.cuentas,
      clientesSueltos: n!.clientesSueltos,
    });
    expect(imp.estado).toBe(201);
    const c = await ctx.prisma.cuentaServicio.findFirstOrThrow({ include: { perfiles: true } });
    expect(c.estado).toBe('retirada');
    expect(c.notas).toMatch(/papelera del Gestor \(borrada el 2026-10-01\)\. Tenía a: Rosa/);
    expect(c.perfiles.every((p) => p.estado === 'libre')).toBe(true);
    const nota = await ctx.prisma.notaInterna.findFirstOrThrow({ include: { cliente: true } });
    expect(nota.cliente!.nombre).toBe('Luis');
    expect(nota.texto).toMatch(/papelera del Gestor \(borrado el 2026-10-02\)/);
  });

  it('no deshace un lote que ya tiene movimientos', async () => {
    const { admin, catalogo, cuerpo } = await escenario();
    const imp = await admin.n.post('/cuentas/gestor/importar', cuerpo);
    expect(imp.estado).toBe(201);
    const ana = await ctx.prisma.cliente.findFirstOrThrow({ where: { nombre: 'Ana Pérez' } });
    const nueva = await admin.n.post('/suscripciones', {
      clienteId: ana.id,
      planId: catalogo.planId,
      moneda: 'USD',
    });
    expect(nueva.estado).toBe(201);
    const r = await admin.n.post(`/cuentas/gestor/lotes/${imp.cuerpo.loteId}/deshacer`, {});
    expect(r.cuerpo.error.codigo).toBe('LOTE_EN_USO');
    expect(await ctx.prisma.cuentaServicio.count()).toBe(2);
  });

  it('con la «Copia para NV Streaming» guarda responsable, todos los contactos y el orden', async () => {
    const admin = await conectar(ctx, 'admin');
    const catalogo = await prepararCatalogo(admin.n);
    const copia = {
      formato: 'nv-gestor-a-nvstreaming',
      db: {
        platforms: [{ id: 'plat_9', name: 'Cine nuevo', orden: 0 }],
        accounts: {
          plat_9: [
            {
              id: 'z_1',
              orden: 0,
              email: 'primera@example.com',
              password: 'P-1',
              numProfiles: 2,
              tipoCuenta: 'perfiles',
              metodoPago: 'paypal',
            },
            {
              id: 'z_2',
              orden: 1,
              email: 'segunda@example.com',
              password: 'P-2',
              numProfiles: 1,
              tipoCuenta: 'completa',
            },
            { id: 'z_3', orden: 2, email: 'tercera@example.com', password: 'P-3', numProfiles: 1 },
          ],
        },
        clients: {
          plat_9: [
            {
              id: 'k_1',
              accountId: 'z_1',
              slotIndex: 1,
              ordenPerfil: 1,
              nombre: 'Marta',
              responsable: 'Revendedor Juan',
              contactos: [
                { tipo: 'telegram', valor: 'marta_tg' },
                { tipo: 'whatsapp', valor: '+584125550001' },
                { tipo: 'correo', valor: 'marta@example.com' },
              ],
              vencimientoCliente: '2099-01-01',
              precioVenta: 3,
            },
            {
              id: 'k_2',
              accountId: 'z_2',
              slotIndex: 1,
              nombre: 'Rosa',
              contacto: '@rosa_r',
              vencimientoCliente: '2099-01-01',
            },
          ],
        },
      },
    };
    const [plat] = leerRespaldoGestor(copia).plataformas;
    const imp = await admin.n.post('/cuentas/gestor/importar', {
      plataforma: { origenId: plat!.origenId, nombre: plat!.nombre },
      servicioId: catalogo.servicioId,
      planId: catalogo.planId,
      cuentas: plat!.cuentas,
    });

    expect(imp.estado).toBe(201);
    const marta = await ctx.prisma.cliente.findFirstOrThrow({
      where: { nombre: 'Marta' },
      include: { contactos: { orderBy: { tipo: 'asc' } } },
    });
    expect(marta).toMatchObject({ responsable: 'Revendedor Juan', correo: 'marta@example.com' });
    expect(marta.contactos.map((c) => [c.tipo, c.valor]).sort()).toEqual([
      ['telegram', 'marta_tg'],
      ['whatsapp', '+584125550001'],
    ]);
    const rosa = await ctx.prisma.cliente.findFirstOrThrow({
      where: { nombre: 'Rosa' },
      include: { contactos: true },
    });
    expect(rosa.contactos.map((c) => [c.tipo, c.valor])).toEqual([['telegram', 'rosa_r']]);
    // La lista de cuentas (más nuevas arriba) queda en el orden del Gestor.
    const cuentas = await admin.n.get('/cuentas');
    const pistas = cuentas.cuerpo.elementos.map((c: { pista: string }) => c.pista);
    expect(pistas.slice(0, 3)).toEqual([
      'pr•••@example.com',
      'se•••@example.com',
      'te•••@example.com',
    ]);
    const modos = await ctx.prisma.cuentaServicio.findMany({
      orderBy: { creadoEn: 'desc' },
      select: { modo: true, metodoPago: true },
    });
    expect(modos).toEqual([
      { modo: 'perfiles', metodoPago: 'PayPal' },
      { modo: 'completa', metodoPago: null },
      { modo: 'perfiles', metodoPago: null },
    ]);
  });

  it('rechaza un plan de otro servicio', async () => {
    const { admin, cuerpo } = await escenario();
    const otro = await admin.n.post('/catalogo/servicios', {
      proveedorId: (await ctx.prisma.servicio.findFirstOrThrow()).proveedorId,
      nombre: 'Otro',
      slug: 'otro',
    });
    const r = await admin.n.post('/cuentas/gestor/simular', {
      ...cuerpo,
      servicioId: otro.cuerpo.id,
    });
    expect(r.cuerpo.error.codigo).toBe('PLAN_DE_OTRO_SERVICIO');
  });
});
