import { describe, expect, it, vi } from 'vitest';
import { crearDespertador, latidoVigenteMs } from '../../src/automatizaciones/ahorro.js';
import { TrabajadorService } from '../../src/automatizaciones/trabajador.service.js';
import { cargarEntorno, type Entorno } from '../../src/config/entorno.js';
import { SaludController } from '../../src/salud/salud.controller.js';

const base = {
  DATABASE_URL: 'postgresql://nv:nv_local_dev@localhost:5432/nv',
  WEB_ORIGEN: 'http://localhost:3000/',
  CLAVE_CIFRADO: Buffer.alloc(32, 1).toString('base64'),
};

describe('base en modo ahorro (Neon gratis)', () => {
  it('viene apagado y no se combina con las entregas en la API', () => {
    const e = cargarEntorno(base);
    expect(e.BASE_AHORRO).toBe(false);
    expect(e.TRABAJADOR_PAUSA_MINUTOS).toBe(15);
    expect(() => cargarEntorno({ ...base, BASE_AHORRO: 'true', ENTREGAS_EN_API: 'true' })).toThrow(
      /ENTREGAS_EN_API/,
    );
    expect(() => cargarEntorno({ ...base, TRABAJADOR_URL_INTERNA: 'trabajador' })).toThrow(
      /TRABAJADOR_URL_INTERNA/,
    );
  });

  it('el panel espera el latido según la pausa del trabajador', () => {
    expect(latidoVigenteMs({ BASE_AHORRO: false, TRABAJADOR_PAUSA_MINUTOS: 15 })).toBe(90_000);
    expect(latidoVigenteMs({ BASE_AHORRO: true, TRABAJADOR_PAUSA_MINUTOS: 15 })).toBe(1_020_000);
  });

  it('el despertador junta los avisos del mismo segundo y no falla si nadie contesta', async () => {
    vi.useFakeTimers();
    try {
      const solicitar = vi.fn().mockRejectedValue(new Error('sin trabajador'));
      const despertar = crearDespertador('http://trabajador:4100', solicitar);
      despertar();
      despertar();
      despertar();
      await vi.advanceTimersByTimeAsync(1100);
      expect(solicitar).toHaveBeenCalledTimes(1);
      expect(solicitar.mock.calls[0]![0]).toBe('http://trabajador:4100/despertar');
      despertar();
      await vi.advanceTimersByTimeAsync(1100);
      expect(solicitar).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la salud de la API no consulta la base salvo que se pida', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([1]) };
    const ahorro = new SaludController(prisma as never, { BASE_AHORRO: true } as Entorno);
    expect(await ahorro.salud()).toEqual({ estado: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    await ahorro.salud('1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const normal = new SaludController(prisma as never, { BASE_AHORRO: false } as Entorno);
    await normal.salud();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('el trabajador duerme sin trabajo, responde su salud y se despierta con un aviso', async () => {
    const puerto = 41_000 + Math.floor(Math.random() * 1000);
    const entorno = {
      ...cargarEntorno(base),
      BASE_AHORRO: true,
      TRABAJADOR_PAUSA_MINUTOS: 15,
      TRABAJADOR_ESPERA_SEGUNDOS: 1,
      TRABAJADOR_PUERTO: puerto,
    };
    const prisma = {
      latidoTrabajador: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const config = { asegurar: vi.fn().mockResolvedValue(undefined) };
    const planificador = { vuelta: vi.fn().mockResolvedValue(0) };
    const trabajos = { procesarLote: vi.fn().mockResolvedValue(0), purgar: vi.fn() };
    const t = new TrabajadorService(
      entorno,
      prisma as never,
      config as never,
      planificador as never,
      trabajos as never,
    );
    // Sin trabajo y sin avisos recientes: tras la primera vuelta duerme 15 minutos.
    (t as unknown as { purgar: () => Promise<void> }).purgar = vi.fn().mockResolvedValue(undefined);
    await t.iniciar();
    try {
      await vi.waitFor(() => expect(trabajos.procesarLote).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 1500));
      expect(trabajos.procesarLote).toHaveBeenCalledTimes(1);

      const salud = await fetch(`http://127.0.0.1:${puerto}/salud`);
      expect(salud.status).toBe(200);

      const aviso = await fetch(`http://127.0.0.1:${puerto}/despertar`, { method: 'POST' });
      expect(aviso.status).toBe(204);
      await vi.waitFor(() => expect(trabajos.procesarLote).toHaveBeenCalledTimes(2));
      // Tras un aviso sigue atento unos segundos (la base ya está despierta).
      await vi.waitFor(() => expect(trabajos.procesarLote).toHaveBeenCalledTimes(3), {
        timeout: 3000,
      });
    } finally {
      await t.beforeApplicationShutdown();
    }
    await expect(fetch(`http://127.0.0.1:${puerto}/salud`)).rejects.toThrow();
  });
});
