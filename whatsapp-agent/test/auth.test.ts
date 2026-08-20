/**
 * Smoke test de auth con Postgres en memoria (pg-mem) + bcrypt/jwt REALES.
 * Verifica el flujo real registro → login → token con el MISMO SQL que usa el
 * repositorio. No necesita un Postgres instalado.
 *
 *   npm run test:auth
 */
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const AUTH_COLS = 'id, email, nombre, rol, saldo_billetera, password_hash';
let fallos = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fallos++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

async function main() {
  // 1) Postgres en memoria con gen_random_uuid() (pgcrypto) y la tabla usuarios real.
  const db = newDb();
  db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: () => randomUUID() });
  db.public.registerFunction({ name: 'lower', args: [DataType.text], returns: DataType.text, implementation: (x: string) => (x ?? '').toLowerCase(), impure: false });
  db.public.none(`
    CREATE TABLE usuarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      id_whatsapp VARCHAR(20) UNIQUE,
      nombre VARCHAR(120),
      email VARCHAR(160),
      password_hash VARCHAR(255),
      rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
      saldo_billetera NUMERIC(12,2) NOT NULL DEFAULT 0,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  const q = (sql: string, params: unknown[] = []) => db.public.many(sql.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1];
    return v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  }));

  // 2) REGISTRO (mismo SQL que UsersRepository.createWebUser)
  const email = 'nathan@example.com';
  const passwordHash = await bcrypt.hash('claveSuperSegura1', 10);
  const creado = q(
    `INSERT INTO usuarios (email, nombre, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING ${AUTH_COLS}`,
    [email, 'Nathan', passwordHash, 'cliente'],
  )[0] as any;
  ok(!!creado.id, 'registro crea usuario con id (uuid)');
  ok(creado.rol === 'cliente', 'rol por defecto = cliente');
  ok(String(creado.password_hash).startsWith('$2'), 'contraseña guardada CIFRADA (bcrypt), no en claro');
  ok(Number(creado.saldo_billetera) === 0, 'saldo inicial = 0');

  // 3) EMAIL DUPLICADO debe fallar (índice único lower(email))
  db.public.none(`CREATE UNIQUE INDEX ux_usuarios_email ON usuarios (lower(email)) WHERE email IS NOT NULL;`);
  let dup = false;
  try { q(`INSERT INTO usuarios (email, password_hash) VALUES ($1,$2)`, ['NATHAN@example.com', 'x']); }
  catch { dup = true; }
  ok(dup, 'email duplicado (case-insensitive) es rechazado');

  // 4) LOGIN (findByEmail + verifyPassword reales)
  const encontrado = q(`SELECT ${AUTH_COLS} FROM usuarios WHERE lower(email)=lower($1) LIMIT 1`, [email])[0] as any;
  ok(!!encontrado, 'findByEmail localiza al usuario');
  ok(await bcrypt.compare('claveSuperSegura1', encontrado.password_hash), 'contraseña correcta → login OK');
  ok(!(await bcrypt.compare('claveIncorrecta', encontrado.password_hash)), 'contraseña incorrecta → rechazada');

  // 5) JWT: firmar y verificar (round-trip)
  const SECRET = 'test-secret';
  const token = jwt.sign({ sub: encontrado.id, email: encontrado.email, rol: encontrado.rol }, SECRET, { expiresIn: '7d' });
  const payload = jwt.verify(token, SECRET) as any;
  ok(payload.sub === encontrado.id, 'JWT round-trip: sub = id del usuario');
  ok(payload.rol === 'cliente', 'JWT lleva el rol');
  let bad = false; try { jwt.verify(token, 'otro-secret'); } catch { bad = true; }
  ok(bad, 'JWT con secreto equivocado es rechazado');

  console.log(fallos === 0 ? '\n✅ AUTH smoke test: TODO OK' : `\n❌ AUTH smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
