// Comprobación de salud del trabajador: sano si ESTE
// contenedor dejó un latido en la base de datos en los últimos 2 minutos.
// El trabajador escribe su latido cada 30 s en la tabla latidos_trabajador.
// Con BASE_AHORRO no consulta la base (para que pueda apagarse): pregunta al propio
// trabajador, que escucha en TRABAJADOR_PUERTO.
import { hostname } from 'node:os';
import { crearClientePrisma } from '@nv/db';

const MAXIMO_MS = 120_000;
const ahorro = ['true', '1'].includes(process.env.BASE_AHORRO ?? '');

if (ahorro) {
  const puerto = process.env.TRABAJADOR_PUERTO || '4100';
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/salud`, {
      signal: AbortSignal.timeout(10_000),
    });
    process.exitCode = r.ok ? 0 : 1;
  } catch {
    process.exitCode = 1;
  }
} else {
  const prisma = crearClientePrisma(process.env.DATABASE_URL ?? '');
  try {
    const ultimo = await prisma.latidoTrabajador.findFirst({
      where: { host: hostname() },
      orderBy: { ultimoLatidoEn: 'desc' },
      select: { ultimoLatidoEn: true },
    });
    const sano = ultimo !== null && Date.now() - ultimo.ultimoLatidoEn.getTime() < MAXIMO_MS;
    process.exitCode = sano ? 0 : 1;
  } catch {
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
