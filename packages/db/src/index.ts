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
 *
 * Cuántas conexiones abre cada proceso lo fija `maxConexiones` (10 por defecto). La API
 * y el trabajador abren cada uno las suyas, y su suma debe quedar por debajo del tope
 * del proveedor: el «Session pooler» del plan gratis de Supabase deja unas 15. Si se
 * pasa, la base rechaza consultas y el panel se queda cargando o sin datos.
 *
 * Por la misma distancia, una transacción con muchas consultas (crear un pedido:
 * cliente, plan, stock, suscripción, factura, auditoría…) pasa de los 5 s que
 * Prisma da por defecto y se cortaba con «error inesperado». Se les dan 30 s, y
 * 10 s para conseguir conexión.
 */
export function crearClientePrisma(urlConexion: string, maxConexiones = 10): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: urlConexion,
    max: maxConexiones,
    idleTimeoutMillis: 240_000,
    connectionTimeoutMillis: 20_000,
  });
  return new PrismaClient({
    adapter,
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
  });
}
