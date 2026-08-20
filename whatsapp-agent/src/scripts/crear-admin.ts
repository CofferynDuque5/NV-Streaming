/**
 * Crea (o promueve) un usuario administrador. Imprescindible tras la migración:
 * sin un admin nadie puede gestionar contenido ni aprobar recargas.
 *
 *   npm run crear-admin -- <email> [password]
 *
 * - Si el email YA existe → lo promueve a rol 'admin'.
 * - Si NO existe → lo crea con la contraseña indicada (>= 8 caracteres).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { UsersRepository } from '../db/repositories/users.repo.js';
import { closePool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email) {
    console.error('Uso: npm run crear-admin -- <email> [password]');
    process.exitCode = 1; return;
  }
  const existente = await UsersRepository.findByEmail(email);
  if (existente) {
    await UsersRepository.setRol(email, 'admin');
    logger.info(`✅ Usuario ${email} promovido a administrador.`);
    return;
  }
  if (!password || password.length < 8) {
    console.error('Para crear un admin nuevo indica una contraseña de al menos 8 caracteres.');
    process.exitCode = 1; return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await UsersRepository.createWebUser({ email: email.toLowerCase(), nombre: 'Administrador', passwordHash, rol: 'admin' });
  logger.info(`✅ Administrador ${email} creado. Ya puedes iniciar sesión y gestionar la tienda.`);
}

main()
  .catch((err) => { logger.error({ err }, '❌ No se pudo crear el admin'); process.exitCode = 1; })
  .finally(() => closePool());
