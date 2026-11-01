import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/**
 * Crea un cliente de Prisma conectado con el driver oficial `pg`.
 *
 * Con la base lejos del servidor (Neon), abrir una conexión cuesta varios viajes de
 * ida y vuelta (TLS y contraseña). Por defecto `pg` cierra las conexiones libres a los
 * 10 s, así que casi cada clic del panel volvía a abrirlas. Se mantienen 4 minutos:
 * menos que los 5 de inactividad tras los que Neon gratis se apaga, para no impedirlo.
 * Con 20 conexiones, las ~20 consultas paralelas del centro no esperan turno.
 */
export function crearClientePrisma(urlConexion: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: urlConexion,
    max: 20,
    idleTimeoutMillis: 240_000,
    connectionTimeoutMillis: 20_000,
  });
  return new PrismaClient({ adapter });
}
