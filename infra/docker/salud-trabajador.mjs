// Comprobación de salud del trabajador (no tiene servidor HTTP): sano si ESTE
// contenedor dejó un latido en la base de datos en los últimos 2 minutos.
// El trabajador escribe su latido cada 30 s en la tabla latidos_trabajador.
import { hostname } from 'node:os';
import { crearClientePrisma } from '@nv/db';

const MAXIMO_MS = 120_000;
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
