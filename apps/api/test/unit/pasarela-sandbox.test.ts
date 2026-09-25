import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@nv/db';
import { redactarCarga } from '../../src/pagos-en-linea/adaptador.js';
import {
  AdaptadorSandbox,
  CABECERA_FIRMA_SANDBOX,
} from '../../src/pagos-en-linea/sandbox/sandbox.adaptador.js';
import type { Entorno } from '../../src/config/entorno.js';

type Fila = Record<string, unknown> & { id: string; claveIdempotencia?: string | null };

/** `operaciones_sandbox` en memoria, con sus índices únicos (id y clave de idempotencia). */
function prismaFalso() {
  const filas = new Map<string, Fila>();
  const duplicado = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'prueba',
    });
  const coincide = (f: Fila, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => f[k] === v);
  const operacionSandbox = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      [...filas.values()].find((f) => coincide(f, where)) ?? null,
    findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
      const f = [...filas.values()].find((x) => coincide(x, where));
      if (!f) throw new Error('No existe');
      return f;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...filas.values()].reverse().find((f) => coincide(f, where)) ?? null,
    create: async ({ data }: { data: Fila }) => {
      const clave = data.claveIdempotencia ?? null;
      if (
        filas.has(data.id) ||
        (clave && [...filas.values()].some((f) => f.claveIdempotencia === clave))
      ) {
        throw duplicado();
      }
      const f = { relacionadoId: null, datos: {}, guardarMetodo: false, ...data };
      filas.set(data.id, f);
      return f;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const f = filas.get(where.id);
      if (!f) throw new Error('No existe');
      Object.assign(f, data);
      return f;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const f of filas.values()) {
        if (coincide(f, where)) {
          Object.assign(f, data);
          count += 1;
        }
      }
      return { count };
    },
    aggregate: async ({ where }: { where: Record<string, unknown> }) => {
      let suma: Prisma.Decimal | null = null;
      for (const f of filas.values()) {
        if (coincide(f, where))
          suma = (suma ?? new Prisma.Decimal(0)).add(f['monto'] as Prisma.Decimal);
      }
      return { _sum: { monto: suma } };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      filas.delete(where.id);
    },
  };
  return { operacionSandbox, filas } as unknown as PrismaClient & { filas: Map<string, Fila> };
}

const entorno = {
  CLAVE_CIFRADO: randomBytes(32).toString('base64'),
  WEB_ORIGEN: 'http://localhost:3000',
  PASARELA_SANDBOX_HABILITADA: true,
} as unknown as Entorno;

let prisma: ReturnType<typeof prismaFalso>;
let sandbox: AdaptadorSandbox;
beforeEach(() => {
  prisma = prismaFalso();
  sandbox = new AdaptadorSandbox(prisma, entorno);
});

const pedido = (monto = '5.00', guardarMetodo = false, idInterno = 'intento-1') => ({
  referencia: 'L-ABCDEFGH',
  idInterno,
  monto,
  moneda: 'USD' as const,
  descripcion: 'Factura NV-000001',
  urlRetorno: 'http://localhost:3000/cuenta/pagos/retorno?intento=intento-1',
  urlCancelacion: 'http://localhost:3000/cuenta/pagos/retorno?intento=intento-1&cancelado=1',
  guardarMetodo,
  pagador: { nombre: 'Ana', correo: 'ana@correo.test' },
});

describe('pasarela de pruebas: órdenes', () => {
  it('crea la orden con la URL de su página y queda pendiente hasta que se elige el resultado', async () => {
    const orden = await sandbox.crearPago(pedido());
    expect(orden.idExterno).toMatch(/^sbx_ord_/);
    expect(orden.urlPago).toBe('http://localhost:3000/pago-sandbox/intento-1');
    // Repetir la creación del mismo intento no crea otra orden.
    expect((await sandbox.crearPago(pedido())).idExterno).toBe(orden.idExterno);
    expect((await sandbox.consultarPago(orden.idExterno)).estado).toBe('pendiente');
  });

  it('aprobada: se captura una sola vez aunque se consulte varias veces a la vez', async () => {
    const { idExterno } = await sandbox.crearPago(pedido('5.00', true));
    await sandbox.simular('intento-1', 'aprobar');
    const [a, b, c] = await Promise.all([
      sandbox.confirmarRetorno(idExterno),
      sandbox.consultarPago(idExterno),
      sandbox.consultarPago(idExterno),
    ]);
    expect(a).toMatchObject({ estado: 'aprobado', montoRecibido: '5.00', moneda: 'USD' });
    expect(a.idCobro).toMatch(/^sbx_cap_/);
    expect(b.idCobro).toBe(a.idCobro);
    expect(c.idCobro).toBe(a.idCobro);
    expect(a.metodoGuardado?.token).toMatch(/^sbx_tok_/);
    expect(a.metodoGuardado?.descripcion).toBe('Tarjeta de prueba ···· 4242');
    const cobros = [...prisma.filas.values()].filter((f) => f['tipo'] === 'cobro');
    expect(cobros).toHaveLength(1);
    // El resultado ya no se puede cambiar.
    await expect(sandbox.simular('intento-1', 'rechazar')).rejects.toThrow(/ya se resolvió/);
  });

  it('rechazada, cancelada y el importe terminado en ,15 (informa 1,00 menos)', async () => {
    const r = await sandbox.crearPago(pedido('5.00', false, 'a'));
    await sandbox.simular('a', 'rechazar');
    expect(await sandbox.consultarPago(r.idExterno)).toMatchObject({
      estado: 'rechazado',
      idCobro: null,
    });
    const c = await sandbox.crearPago(pedido('5.00', false, 'b'));
    await sandbox.simular('b', 'cancelar');
    expect((await sandbox.consultarPago(c.idExterno)).estado).toBe('cancelado');
    const m = await sandbox.crearPago(pedido('7.15', false, 'c'));
    await sandbox.simular('c', 'aprobar');
    expect((await sandbox.consultarPago(m.idExterno)).montoRecibido).toBe('6.15');
    expect((await sandbox.consultarPago('sbx_ord_no_existe')).estado).toBe('rechazado');
  });
});

describe('pasarela de pruebas: cobros con token', () => {
  async function token() {
    const { idExterno } = await sandbox.crearPago(pedido('5.00', true));
    await sandbox.simular('intento-1', 'aprobar');
    return (await sandbox.consultarPago(idExterno)).metodoGuardado!.token;
  }
  const cobro = (monto: string, clave: string) => ({
    referencia: 'NV-000002-1',
    monto,
    moneda: 'USD' as const,
    descripcion: 'Renovación',
    claveIdempotencia: clave,
  });

  it('cobra y, con la misma clave de idempotencia, devuelve el mismo cobro', async () => {
    const t = await token();
    const a = await sandbox.cobrarConMetodo(t, cobro('5.00', 'cobro:f1:1'));
    const b = await sandbox.cobrarConMetodo(t, cobro('5.00', 'cobro:f1:1'));
    expect(a).toMatchObject({ estado: 'aprobado', montoRecibido: '5.00' });
    expect(b.idCobro).toBe(a.idCobro);
    const c = await sandbox.cobrarConMetodo(t, cobro('5.00', 'cobro:f1:2'));
    expect(c.idCobro).not.toBe(a.idCobro);
  });

  it(',13 rechaza; ,14 invalida el token; los ganchos fuerzan resultados', async () => {
    const t = await token();
    expect(await sandbox.cobrarConMetodo(t, cobro('5.13', 'k1'))).toMatchObject({
      estado: 'rechazado',
    });
    expect((await sandbox.cobrarConMetodo(t, cobro('5.13', 'k1'))).metodoInvalido).toBeUndefined();
    await sandbox.forzarToken(t, 'rechazar');
    expect((await sandbox.cobrarConMetodo(t, cobro('5.00', 'k2'))).estado).toBe('rechazado');
    await sandbox.forzarToken(t, null);
    expect((await sandbox.cobrarConMetodo(t, cobro('5.00', 'k3'))).estado).toBe('aprobado');
    expect(await sandbox.cobrarConMetodo(t, cobro('5.14', 'k4'))).toMatchObject({
      estado: 'rechazado',
      metodoInvalido: true,
    });
    // Ya inválido: cualquier cobro posterior también.
    expect((await sandbox.cobrarConMetodo(t, cobro('5.00', 'k5'))).metodoInvalido).toBe(true);
    expect(
      (await sandbox.cobrarConMetodo('sbx_tok_falso', cobro('5.00', 'k6'))).metodoInvalido,
    ).toBe(true);
  });

  it('un token revocado o en otra moneda no cobra', async () => {
    const t = await token();
    expect(
      (await sandbox.cobrarConMetodo(t, { ...cobro('5.00', 'e1'), moneda: 'EUR' })).estado,
    ).toBe('rechazado');
    await sandbox.revocarToken(t);
    expect((await sandbox.cobrarConMetodo(t, cobro('5.00', 'e2'))).metodoInvalido).toBe(true);
  });

  it('devoluciones: parciales hasta lo cobrado, idempotentes por clave', async () => {
    const t = await token();
    const { idCobro } = await sandbox.cobrarConMetodo(t, cobro('5.00', 'r'));
    expect((await sandbox.reembolsar(idCobro!, '2.00', 'USD', 'd1')).estado).toBe('completado');
    const repetido = await sandbox.reembolsar(idCobro!, '2.00', 'USD', 'd1');
    expect(repetido.estado).toBe('completado');
    expect(await sandbox.reembolsar(idCobro!, '3.01', 'USD', 'd2')).toMatchObject({
      estado: 'fallido',
      mensaje: 'La devolución supera lo cobrado.',
    });
    expect((await sandbox.reembolsar(idCobro!, '3.00', 'USD', 'd3')).estado).toBe('completado');
    expect((await sandbox.reembolsar(idCobro!, '1.00', 'EUR', 'd4')).estado).toBe('fallido');
    expect((await sandbox.reembolsar('sbx_cap_x', '1.00', 'USD', 'd5')).estado).toBe('fallido');
  });
});

describe('pasarela de pruebas: webhooks', () => {
  it('acepta solo la firma correcta, reciente y sobre los bytes exactos', async () => {
    const cuerpo = sandbox.cuerpoWebhook('orden.aprobada', 'sbx_ord_1', 'evt_1');
    const ok = await sandbox.verificarWebhook(sandbox.firmar(cuerpo), Buffer.from(cuerpo));
    expect(ok.valido).toBe(true);
    expect(ok.evento).toMatchObject({
      idEvento: 'evt_1',
      tipo: 'orden.aprobada',
      idRecurso: 'sbx_ord_1',
      normalizado: { tipo: 'pago_aprobado', idExterno: 'sbx_ord_1' },
    });
    expect((await sandbox.verificarWebhook({}, Buffer.from(cuerpo))).valido).toBe(false);
    expect(
      (await sandbox.verificarWebhook(sandbox.firmar(cuerpo), Buffer.from(`${cuerpo}\n`))).valido,
    ).toBe(false);
    const viejo = sandbox.firmar(cuerpo, Math.floor(Date.now() / 1000) - 600);
    expect((await sandbox.verificarWebhook(viejo, Buffer.from(cuerpo))).valido).toBe(false);
    // Otra instancia con otra clave no puede firmar por esta.
    const otra = new AdaptadorSandbox(prisma, {
      ...entorno,
      CLAVE_CIFRADO: randomBytes(32).toString('base64'),
    });
    expect((await sandbox.verificarWebhook(otra.firmar(cuerpo), Buffer.from(cuerpo))).valido).toBe(
      false,
    );
    const cabecera = sandbox.firmar(cuerpo)[CABECERA_FIRMA_SANDBOX]!;
    expect(cabecera).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('un evento de token no guarda el token', async () => {
    const cuerpo = sandbox.cuerpoWebhook('token.revocado', 'sbx_tok_secreto');
    const v = await sandbox.verificarWebhook(sandbox.firmar(cuerpo), Buffer.from(cuerpo));
    expect(v.evento?.normalizado).toMatchObject({
      tipo: 'metodo_revocado',
      token: 'sbx_tok_secreto',
    });
    expect(v.evento?.idRecurso).toBeNull();
    expect(JSON.stringify(v.evento?.carga)).not.toContain('sbx_tok_secreto');
  });
});

describe('redactarCarga', () => {
  it('quita datos personales y deja lo demás', () => {
    const r = redactarCarga({
      id: 'WH-1',
      description: 'Pago de factura',
      resource: {
        id: 'CAP-1',
        amount: { value: '5.00', currency_code: 'USD' },
        payer: { email_address: 'ana@correo.test', name: { given_name: 'Ana' } },
        shipping: { address: { line1: 'Calle 1' } },
        payment_source: { card: { last_digits: '4242' } },
        client_ip: '1.2.3.4',
        nota: 'escribió a ana@correo.test',
      },
    });
    expect(r).toEqual({
      id: 'WH-1',
      description: 'Pago de factura',
      resource: {
        id: 'CAP-1',
        amount: { value: '5.00', currency_code: 'USD' },
        payer: '[redactado]',
        shipping: { address: '[redactado]' },
        payment_source: { card: '[redactado]' },
        client_ip: '[redactado]',
        nota: '[redactado]',
      },
    });
  });
});
