import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { hoyEnVenezuela } from '@nv/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conectar, type Contexto, crearContexto, limpiar, ORIGEN } from './ayudas.js';

const vendedor = generateKeyPairSync('ed25519');
const otro = generateKeyPairSync('ed25519');
const CLAVE_PUBLICA = vendedor.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

function dia(desplazamiento: number): string {
  const f = new Date(`${hoyEnVenezuela()}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + desplazamiento);
  return f.toISOString().slice(0, 10);
}

function emitir(
  vence: string,
  opciones: { clave?: KeyObject; origen?: string; prueba?: boolean } = {},
): string {
  const datos = {
    v: 1,
    id: 'lic-prueba-1',
    negocio: 'Negocio de prueba',
    origen: opciones.origen ?? ORIGEN,
    plan: 'Mensual',
    prueba: opciones.prueba ?? false,
    emitida: dia(0),
    vence,
  };
  const firmado = `NVL1.${Buffer.from(JSON.stringify(datos)).toString('base64url')}`;
  const firma = sign(null, Buffer.from(firmado), opciones.clave ?? vendedor.privateKey);
  return `${firmado}.${firma.toString('base64url')}`;
}

const nuevoCliente = { nombre: 'Ana Pérez', pais: 'VE', monedaPreferida: 'USD' };

describe('licencia de la instalación', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await crearContexto({ LICENCIA_CLAVE_PUBLICA: CLAVE_PUBLICA });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await limpiar(ctx.prisma);
  });

  it('sin licencia el equipo solo consulta; al cargarla vuelve a funcionar', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    expect((await admin.get('/licencia')).cuerpo).toMatchObject({
      estado: 'falta',
      permiteCambios: false,
    });
    const bloqueado = await admin.post('/clientes', nuevoCliente);
    expect(bloqueado.estado).toBe(403);
    expect(bloqueado.cuerpo.error.codigo).toBe('LICENCIA_VENCIDA');
    expect((await admin.get('/clientes')).estado).toBe(200);

    // Clientes y cuenta propia siguen funcionando.
    const { n: cliente } = await conectar(ctx, 'cliente');
    expect((await cliente.get('/licencia')).estado).toBe(403);

    // Firmada por otra clave, de otra dirección o vencida: no se guarda.
    const falsa = await admin.pedir('PUT', '/licencia', {
      licencia: emitir(dia(30), { clave: otro.privateKey }),
    });
    expect(falsa.cuerpo.error.codigo).toBe('LICENCIA_INVALIDA');
    const ajena = await admin.pedir('PUT', '/licencia', {
      licencia: emitir(dia(30), { origen: 'https://otro.example.com' }),
    });
    expect(ajena.cuerpo.error.codigo).toBe('LICENCIA_INVALIDA');
    const vieja = await admin.pedir('PUT', '/licencia', { licencia: emitir(dia(-10)) });
    expect(vieja.cuerpo.error.codigo).toBe('LICENCIA_VENCIDA');

    const { n: operador } = await conectar(ctx, 'operador');
    const sinRol = await operador.pedir('PUT', '/licencia', { licencia: emitir(dia(30)) });
    expect(sinRol.cuerpo.error.codigo).toBe('SOLO_ADMINISTRACION');

    const licencia = emitir(dia(30), { prueba: true });
    const cargada = await admin.pedir('PUT', '/licencia', { licencia });
    expect(cargada.estado).toBe(200);
    expect(cargada.cuerpo).toMatchObject({
      estado: 'vigente',
      permiteCambios: true,
      negocio: 'Negocio de prueba',
      prueba: true,
      vence: dia(30),
      diasRestantes: 30,
    });
    expect((await admin.post('/clientes', nuevoCliente)).estado).toBe(201);

    // La auditoría no guarda la licencia.
    const registro = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'licencia.cargada' },
    });
    expect(JSON.stringify(registro)).not.toContain(licencia.split('.')[2]);
  });

  it('avisa antes de vencer y deja unos días de gracia', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    const pronto = await admin.pedir('PUT', '/licencia', { licencia: emitir(dia(3)) });
    expect(pronto.cuerpo).toMatchObject({ estado: 'por_vencer', diasRestantes: 3 });
    const gracia = await admin.pedir('PUT', '/licencia', { licencia: emitir(dia(-2)) });
    expect(gracia.cuerpo).toMatchObject({ estado: 'en_gracia', permiteCambios: true });
    expect((await admin.post('/clientes', nuevoCliente)).estado).toBe(201);
  });
});

describe('licencia vencida en la variable LICENCIA', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await crearContexto({
      LICENCIA_CLAVE_PUBLICA: CLAVE_PUBLICA,
      LICENCIA: emitir(dia(-5)),
    });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await limpiar(ctx.prisma);
  });

  it('deja el panel en solo lectura, pero se puede salir y cargar la renovación', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    expect((await admin.get('/licencia')).cuerpo).toMatchObject({
      estado: 'vencida',
      permiteCambios: false,
    });
    expect((await admin.post('/clientes', nuevoCliente)).estado).toBe(403);
    const renovada = await admin.pedir('PUT', '/licencia', { licencia: emitir(dia(60)) });
    expect(renovada.cuerpo.estado).toBe('vigente');
    expect((await admin.post('/clientes', nuevoCliente)).estado).toBe(201);
    expect((await admin.post('/auth/cierre-sesion')).estado).toBeLessThan(300);
  });
});

describe('instalación sin control de licencia', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await crearContexto();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('funciona como siempre y no acepta licencias', async () => {
    await limpiar(ctx.prisma);
    const { n: admin } = await conectar(ctx, 'admin');
    expect((await admin.get('/licencia')).cuerpo).toMatchObject({
      estado: 'sin_control',
      permiteCambios: true,
    });
    expect((await admin.post('/clientes', nuevoCliente)).estado).toBe(201);
    const r = await admin.pedir('PUT', '/licencia', { licencia: emitir(dia(30)) });
    expect(r.cuerpo.error.codigo).toBe('SIN_CONTROL_LICENCIA');
  });
});
