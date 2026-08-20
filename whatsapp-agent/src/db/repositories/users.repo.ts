/**
 * Repositorio de Usuarios. Único lugar que consulta la tabla `usuarios`.
 * Consultas parametrizadas (anti-inyección). La IA nunca llega aquí: llama a
 * funciones del backend que, a su vez, usan estos métodos.
 */
import { query } from '../pool.js';
import type { Usuario } from '../models.js';

type UsuarioRow = {
  id: string;
  id_whatsapp: string;
  nombre: string | null;
  email: string | null;
  creado_en: Date;
  actualizado_en: Date;
};

const toUsuario = (r: UsuarioRow): Usuario => ({
  id: r.id,
  id_whatsapp: r.id_whatsapp,
  nombre: r.nombre,
  email: r.email,
  creado_en: r.creado_en,
  actualizado_en: r.actualizado_en,
});

/** Vista del usuario para autenticación web (email + contraseña + rol + saldo). */
export type UsuarioAuth = {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: string;
  saldo_billetera: number;
  password_hash: string | null;
};
type AuthRow = {
  id: string; email: string | null; nombre: string | null;
  rol: string; saldo_billetera: string; password_hash: string | null;
};
const toAuth = (r: AuthRow): UsuarioAuth => ({
  id: r.id, email: r.email, nombre: r.nombre, rol: r.rol,
  saldo_billetera: Number(r.saldo_billetera), password_hash: r.password_hash,
});
const AUTH_COLS = 'id, email, nombre, rol, saldo_billetera, password_hash';

export const UsersRepository = {
  /** Busca un cliente por su número de WhatsApp. */
  async findByWhatsapp(idWhatsapp: string): Promise<Usuario | null> {
    const rows = await query<UsuarioRow>(
      `SELECT * FROM usuarios WHERE id_whatsapp = $1 LIMIT 1`,
      [idWhatsapp],
    );
    return rows[0] ? toUsuario(rows[0]) : null;
  },

  /**
   * Garantiza que exista el usuario para ese WhatsApp (lo crea si es nuevo).
   * Se llama al recibir el primer mensaje de un número desconocido.
   */
  async upsertByWhatsapp(idWhatsapp: string, nombre?: string | null): Promise<Usuario> {
    const rows = await query<UsuarioRow>(
      `INSERT INTO usuarios (id_whatsapp, nombre)
       VALUES ($1, $2)
       ON CONFLICT (id_whatsapp)
       DO UPDATE SET nombre = COALESCE(EXCLUDED.nombre, usuarios.nombre)
       RETURNING *`,
      [idWhatsapp, nombre ?? null],
    );
    // El INSERT ... RETURNING siempre devuelve una fila.
    return toUsuario(rows[0]!);
  },

  /** Busca un usuario web por email (case-insensitive). */
  async findByEmail(email: string): Promise<UsuarioAuth | null> {
    const rows = await query<AuthRow>(
      `SELECT ${AUTH_COLS} FROM usuarios WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return rows[0] ? toAuth(rows[0]) : null;
  },

  /** Busca un usuario por su id (para reconstruir la sesión desde el token). */
  async findById(id: string): Promise<UsuarioAuth | null> {
    const rows = await query<AuthRow>(
      `SELECT ${AUTH_COLS} FROM usuarios WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? toAuth(rows[0]) : null;
  },

  /** Cambia el rol de un usuario por email. Devuelve true si existía. */
  async setRol(email: string, rol: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE usuarios SET rol = $1 WHERE lower(email) = lower($2) RETURNING id`, [rol, email]);
    return rows.length > 0;
  },

  /** Crea un usuario web (email + contraseña ya cifrada). id_whatsapp queda NULL. */
  async createWebUser(p: { email: string; nombre: string | null; passwordHash: string; rol?: string }): Promise<UsuarioAuth> {
    const rows = await query<AuthRow>(
      `INSERT INTO usuarios (email, nombre, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING ${AUTH_COLS}`,
      [p.email, p.nombre, p.passwordHash, p.rol ?? 'cliente'],
    );
    return toAuth(rows[0]!);
  },

  /**
   * Fija el WhatsApp del cliente SOLO si aún no tenía uno (checkout web). Necesario
   * para que el OTP y los avisos puedan alcanzarlo. Devuelve true si lo guardó.
   * `id_whatsapp` es UNIQUE: si el número ya lo usa otro usuario, devuelve false.
   */
  async setWhatsappIfEmpty(uid: string, idWhatsapp: string): Promise<boolean> {
    try {
      const rows = await query<{ id: string }>(
        `UPDATE usuarios SET id_whatsapp = $2, actualizado_en = now()
         WHERE id = $1 AND (id_whatsapp IS NULL OR id_whatsapp = '')
         RETURNING id`,
        [uid, idWhatsapp],
      );
      return rows.length > 0;
    } catch { return false; } // choque de UNIQUE u otro → no bloquea la compra
  },
};
