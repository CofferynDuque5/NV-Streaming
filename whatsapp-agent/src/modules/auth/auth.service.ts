/**
 * auth.service.ts — Lógica de autenticación web (registro/login/JWT).
 *
 * - Contraseñas cifradas con bcrypt (nunca en claro).
 * - Sesión sin estado mediante JWT firmado con `JWT_SECRET`.
 * - En PRODUCCIÓN el secreto es obligatorio (fail-fast si falta).
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { UsersRepository, type UsuarioAuth } from '../../db/repositories/users.repo.js';
import { ResellerRepository } from '../../db/repositories/reseller.repo.js';
import { AppError } from '../../core/errors.js';

// Algoritmo de firma FIJO: al verificar solo se acepta HS256, evitando ataques de
// confusión de algoritmo (p. ej. forzar 'none' o cambiar a RS/HS).
const JWT_ALG = 'HS256' as const;

// El secreto debe ser fuerte en producción. En desarrollo, si no se define, se
// usa uno ALEATORIO efímero (nunca un literal fijo forjable): así un despliegue
// sin NODE_ENV=production no queda con tokens falsificables.
if (isProd && (env.JWT_SECRET || '').length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción (genera uno fuerte).');
}
const SECRET: string = env.JWT_SECRET || crypto.randomBytes(48).toString('base64');
if (!env.JWT_SECRET) logger.warn('JWT_SECRET ausente: usando un secreto EFÍMERO de desarrollo (no válido en producción).');

const ESTADO_AUTH: Readonly<Record<string, number>> = {
  email_en_uso: 409, credenciales: 401, email_invalido: 400, password_debil: 400,
};

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super({ code, message, statusCode: ESTADO_AUTH[code] ?? 400 });
  }
}

export type SesionPublica = { id: string; email: string | null; nombre: string | null; rol: string; saldo: number };
export type TokenPayload = { sub: string; email: string | null; rol: string };

const publico = (u: UsuarioAuth): SesionPublica =>
  ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, saldo: u.saldo_billetera });

export function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 10); }
export function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash); }

export function signToken(u: UsuarioAuth): string {
  const payload: TokenPayload = { sub: u.id, email: u.email, rol: u.rol };
  const opts: SignOptions = {
    algorithm: JWT_ALG,
    expiresIn: env.JWT_EXPIRES_IN as unknown as NonNullable<SignOptions['expiresIn']>,
  };
  return jwt.sign(payload, SECRET, opts);
}
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET, { algorithms: [JWT_ALG] }) as unknown as TokenPayload;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function register(input: { email?: string; password?: string; nombre?: string | null; ref?: string | null }) {
  const email = (input.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthError('email_invalido', 'Correo electrónico no válido.');
  if (!input.password || input.password.length < 8) {
    throw new AuthError('password_debil', 'La contraseña debe tener al menos 8 caracteres.');
  }
  if (await UsersRepository.findByEmail(email)) {
    throw new AuthError('email_en_uso', 'Ese correo ya está registrado.');
  }
  const passwordHash = await hashPassword(input.password);
  const u = await UsersRepository.createWebUser({ email, nombre: (input.nombre || '').trim() || null, passwordHash });
  // Referido: si llegó con un ?ref=CODE válido, lo vinculamos al revendedor (una
  // sola vez). Best-effort: nunca hace fallar el registro.
  const ref = (input.ref || '').trim();
  if (ref) { try { await ResellerRepository.marcarReferido(u.id, ref); } catch { /* ignora ref inválido */ } }
  return { usuario: publico(u), token: signToken(u) };
}

export async function login(input: { email?: string; password?: string }) {
  const email = (input.email || '').trim().toLowerCase();
  const u = await UsersRepository.findByEmail(email);
  // Mismo mensaje para usuario inexistente o contraseña incorrecta (no filtra cuáles emails existen).
  if (!u || !u.password_hash || !(await verifyPassword(input.password || '', u.password_hash))) {
    throw new AuthError('credenciales', 'Correo o contraseña incorrectos.');
  }
  return { usuario: publico(u), token: signToken(u) };
}

export async function sesionDeId(id: string): Promise<SesionPublica | null> {
  const u = await UsersRepository.findById(id);
  return u ? publico(u) : null;
}
