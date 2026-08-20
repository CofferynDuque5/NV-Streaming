/**
 * Pool de conexiones a PostgreSQL (única instancia compartida).
 *
 * Toda la app accede a la BD a través de `query()` con consultas
 * PARAMETRIZADAS. La IA nunca construye SQL (regla de negocio 2): son los
 * repositorios, con parámetros posicionales, quienes tocan la base.
 */
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => logger.error({ err }, 'Error inesperado en el pool de PostgreSQL'));

/** Ejecuta una consulta parametrizada y devuelve las filas tipadas. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const started = Date.now();
  const res = await pool.query<T>(text, params as unknown[]);
  logger.debug({ sql: text.split('\n')[0], ms: Date.now() - started, filas: res.rowCount }, 'query');
  return res.rows;
}

/** Ejecuta `fn` dentro de una transacción (BEGIN/COMMIT, ROLLBACK ante error). */
export async function withTransaction<T>(
  fn: (q: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: readonly unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = async <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: readonly unknown[] = []) =>
      (await client.query<R>(text, params as unknown[])).rows;
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
