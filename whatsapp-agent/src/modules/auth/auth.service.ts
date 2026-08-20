/**
 * auth.service.ts — Lógica de autenticación web (registro/login/JWT).
 *
 * - Contraseñas cifradas con bcrypt (nunca en claro).
 * - Sesión sin estado mediante JWT firmado con `JWT_SECRET`.
 * - En PRODUCCIÓN el secreto es obligatorio (fail-fast si falta).
 */
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env, isProd } from '../../config/env.js';
import { UsersRepository, type UsuarioAuth } from '../../db/repositories/users.repo.js';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en producción (define un secreto fuerte).');
}
const SECRET: string = env.JWT_SECRET || 'nv-dev-secret-NO-USAR-EN-PROD';

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export type SesionPublica = { id: string; email: string | null; nombre: string | null; rol: string; saldo: number };
export type TokenPayload = { sub: string; email: string | null; rol: string };

const publico = (u: UsuarioAuth): SesionPublica =>
  ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, saldo: u.saldo_billetera });

export function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 10); }
export function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash); }

export function signToken(u: UsuarioAuth): string {
  const payload: TokenPayload = { sub: u.id, email: u.email, rol: u.rol };
  const opts: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as unknown as NonNullable<SignOptions['expiresIn']> };
  return jwt.sign(payload, SECRET, opts);
}
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function register(input: { email?: string; password?: string; nombre?: string | null }) {
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
