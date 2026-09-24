import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/** Crea un cliente de Prisma conectado con el driver oficial `pg`. */
export function crearClientePrisma(urlConexion: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: urlConexion });
  return new PrismaClient({ adapter });
}
