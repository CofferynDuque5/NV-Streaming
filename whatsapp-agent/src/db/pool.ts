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

// Umbral (ms) a partir del cual una consulta se registra como LENTA (observabilidad).
const CONSULTA_LENTA_MS = 500;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Timeouts del lado del cliente: ninguna consulta puede colgar el pool.
  statement_timeout: 15_000,
  query_timeout: 15_000,
});

pool.on('error', (err) => logger.error({ err }, 'Error inesperado en el pool de PostgreSQL'));

/**
 * Espera a que la BD acepte conexiones, con reintentos y backoff exponencial.
 * Se llama al arrancar para no caer si Postgres tarda en levantar (Docker/CI).
 */
export async function esperarConexion(reintentos = 8, esperaMs = 500): Promise<void> {
  for (let intento = 1; intento <= reintentos; intento++) {
    try { await pool.query('SELECT 1'); return; }
    catch (err) {
      if (intento === reintentos) throw err;
      const espera = esperaMs * 2 ** (intento - 1);
      logger.warn({ intento, espera }, 'BD no disponible aún; reintentando…');
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

/** Ejecuta una consulta parametrizada y devuelve las filas tipadas. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const inicio = Date.now();
  const res = await pool.query<T>(text, params as unknown[]);
  const ms = Date.now() - inicio;
  const traza = { sql: text.split('\n')[0]!.trim(), ms, filas: res.rowCount };
  if (ms >= CONSULTA_LENTA_MS) logger.warn(traza, 'consulta lenta');
  else logger.debug(traza, 'query');
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
