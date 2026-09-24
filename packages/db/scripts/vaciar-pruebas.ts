/**
 * Vacía una base de datos DE PRUEBAS antes de las pruebas e2e. Se niega a
 * actuar si la base no se llama *_test o *_e2e, o si NODE_ENV no es "test".
 */
import pg from 'pg';

const url = process.env['DATABASE_URL'];
if (!url || process.env['NODE_ENV'] !== 'test') {
  console.error('Solo se ejecuta con NODE_ENV=test y DATABASE_URL definida.');
  process.exit(1);
}
const nombre = new URL(url).pathname.slice(1);
if (!/_(test|e2e)$/.test(nombre)) {
  console.error(
    `La base "${nombre}" no parece de pruebas (debe terminar en _test o _e2e). No se toca.`,
  );
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  // El registro de auditoría bloquea TRUNCATE: solo aquí, en pruebas, se desactiva un momento.
  await cliente.query('ALTER TABLE auditoria DISABLE TRIGGER USER');
  const { rows } = await cliente.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  const tablas = rows.map((r) => `"${r.tablename}"`).join(', ');
  await cliente.query(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE`);
  await cliente.query('ALTER TABLE auditoria ENABLE TRIGGER USER');
  await cliente.query('COMMIT');
  console.log(`Base de pruebas "${nombre}" vaciada.`);
} catch (e) {
  await cliente.query('ROLLBACK');
  throw e;
} finally {
  await cliente.end();
}
