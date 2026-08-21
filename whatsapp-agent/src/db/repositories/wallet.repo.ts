/**
 * Repositorio de Billetera. El dinero se mueve SIEMPRE dentro de una transacción
 * con bloqueo de fila del usuario (SELECT … FOR UPDATE): aprobar una recarga
 * acredita el saldo y escribe el asiento en el libro mayor de forma atómica; si
 * algo falla, todo se revierte. Nunca hay crédito sin asiento ni saldo negativo.
 */
import { query, withTransaction } from '../pool.js';

export class WalletError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** Redondea dinero a 2 decimales (evita ruido de coma flotante en las respuestas). */
const money2 = (n: number): number => Math.round(n * 100) / 100;

export type Movimiento = {
  id: string; tipo: 'ingreso' | 'egreso'; monto: number;
  descripcion: string | null; referencia: string | null; saldo_posterior: number; creado_en: Date;
};
export type Recarga = {
  id: string; uid_usuario: string; monto: number; metodo_pago: string | null;
  comprobante: string | null; estado: string; creado_en: Date;
};

const numMov = (r: Record<string, unknown>): Movimiento => ({
  id: r.id as string, tipo: r.tipo as 'ingreso' | 'egreso', monto: Number(r.monto),
  descripcion: (r.descripcion as string) ?? null, referencia: (r.referencia as string) ?? null,
  saldo_posterior: Number(r.saldo_posterior), creado_en: r.creado_en as Date,
});
const numRec = (r: Record<string, unknown>): Recarga => ({
  id: r.id as string, uid_usuario: r.uid_usuario as string, monto: Number(r.monto),
  metodo_pago: (r.metodo_pago as string) ?? null, comprobante: (r.comprobante as string) ?? null,
  estado: r.estado as string, creado_en: r.creado_en as Date,
});

export const WalletRepository = {
  async saldo(uid: string): Promise<number> {
    const rows = await query<{ saldo_billetera: string }>(`SELECT saldo_billetera FROM usuarios WHERE id = $1`, [uid]);
    return rows[0] ? Number(rows[0].saldo_billetera) : 0;
  },

  async movimientos(uid: string, limite = 50): Promise<Movimiento[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM movimientos_billetera WHERE uid_usuario = $1 ORDER BY creado_en DESC LIMIT $2`,
      [uid, limite],
    );
    return rows.map(numMov);
  },

  /**
   * Estadísticas secundarias de la billetera, todas calculadas en la BD:
   *  - reservado: recargas del usuario aún `pendiente` (dinero en tránsito, no acreditado).
   *  - gastadoMes: suma de egresos del mes en curso.
   *  - totalMovimientos: nº total de asientos del usuario (para el "X de N").
   */
  async estadisticas(uid: string): Promise<{ reservado: number; gastadoMes: number; totalMovimientos: number }> {
    const rows = await query<{ reservado: string; gastado_mes: string; total_mov: string }>(
      `SELECT
         COALESCE((SELECT SUM(monto) FROM recargas_billetera
                    WHERE uid_usuario = $1 AND estado = 'pendiente'), 0)          AS reservado,
         COALESCE((SELECT SUM(monto) FROM movimientos_billetera
                    WHERE uid_usuario = $1 AND tipo = 'egreso'
                      AND creado_en >= date_trunc('month', now())), 0)            AS gastado_mes,
         COALESCE((SELECT COUNT(*) FROM movimientos_billetera
                    WHERE uid_usuario = $1), 0)                                   AS total_mov`,
      [uid],
    );
    const r = rows[0]!;
    return {
      reservado: Number(r.reservado),
      gastadoMes: Number(r.gastado_mes),
      totalMovimientos: Number(r.total_mov),
    };
  },

  async crearRecarga(p: { uid: string; monto: number; metodoPago?: string; comprobante?: string }): Promise<Recarga> {
    const rows = await query<Record<string, unknown>>(
      `INSERT INTO recargas_billetera (uid_usuario, monto, metodo_pago, comprobante)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [p.uid, p.monto, p.metodoPago ?? null, p.comprobante ?? null],
    );
    return numRec(rows[0]!);
  },

  async recargasDeUsuario(uid: string): Promise<Recarga[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM recargas_billetera WHERE uid_usuario = $1 ORDER BY creado_en DESC`, [uid]);
    return rows.map(numRec);
  },

  async recargasPendientes(): Promise<Recarga[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM recargas_billetera WHERE estado = 'pendiente' ORDER BY creado_en ASC`);
    return rows.map(numRec);
  },

  /** ATÓMICO: aprueba una recarga pendiente → acredita el saldo + asiento. */
  async aprobarRecarga(recargaId: string, adminId: string): Promise<{ saldo: number; movimiento: Movimiento }> {
    return withTransaction(async (q) => {
      const rec = (await q<Record<string, unknown>>(
        `SELECT * FROM recargas_billetera WHERE id = $1 AND estado = 'pendiente' FOR UPDATE`, [recargaId]))[0];
      if (!rec) throw new WalletError('recarga_no_pendiente', 'La recarga no existe o ya fue procesada.');
      const uid = rec.uid_usuario as string;
      const monto = Number(rec.monto);
      const u = (await q<{ saldo_billetera: string }>(
        `SELECT saldo_billetera FROM usuarios WHERE id = $1 FOR UPDATE`, [uid]))[0];
      if (!u) throw new WalletError('usuario_no_encontrado', 'Usuario no encontrado.');
      const nuevoSaldo = money2(Number(u.saldo_billetera) + monto);
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoSaldo, uid]);
      await q(`UPDATE recargas_billetera SET estado = 'aprobado', aprobado_por = $1 WHERE id = $2`, [adminId, recargaId]);
      const mov = (await q<Record<string, unknown>>(
        `INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
         VALUES ($1, 'ingreso', $2, $3, $4, $5) RETURNING *`,
        [uid, monto, 'Recarga de saldo aprobada', recargaId, nuevoSaldo]))[0];
      return { saldo: nuevoSaldo, movimiento: numMov(mov!) };
    });
  },

  async rechazarRecarga(recargaId: string, adminId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE recargas_billetera SET estado = 'rechazado', aprobado_por = $1
       WHERE id = $2 AND estado = 'pendiente' RETURNING id`, [adminId, recargaId]);
    return rows.length > 0;
  },

  /** ATÓMICO: debita saldo (p.ej. pagar con billetera). Falla si no alcanza. */
  async debitar(uid: string, monto: number, descripcion: string, referencia?: string): Promise<number> {
    if (!(monto > 0)) throw new WalletError('monto_invalido', 'El monto debe ser mayor que 0.');
    return withTransaction(async (q) => {
      const u = (await q<{ saldo_billetera: string }>(
        `SELECT saldo_billetera FROM usuarios WHERE id = $1 FOR UPDATE`, [uid]))[0];
      if (!u) throw new WalletError('usuario_no_encontrado', 'Usuario no encontrado.');
      const saldo = Number(u.saldo_billetera);
      if (saldo < monto) throw new WalletError('saldo_insuficiente', 'Saldo insuficiente.');
      const nuevoSaldo = money2(saldo - monto);
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoSaldo, uid]);
      await q(`INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
               VALUES ($1, 'egreso', $2, $3, $4, $5)`, [uid, monto, descripcion, referencia ?? null, nuevoSaldo]);
      return nuevoSaldo;
    });
  },

  /** ATÓMICO: acredita saldo (p.ej. reembolso por falta de stock). */
  async acreditar(uid: string, monto: number, descripcion: string, referencia?: string): Promise<number> {
    if (!(monto > 0)) throw new WalletError('monto_invalido', 'El monto debe ser mayor que 0.');
    return withTransaction(async (q) => {
      const u = (await q<{ saldo_billetera: string }>(
        `SELECT saldo_billetera FROM usuarios WHERE id = $1 FOR UPDATE`, [uid]))[0];
      if (!u) throw new WalletError('usuario_no_encontrado', 'Usuario no encontrado.');
      const nuevoSaldo = money2(Number(u.saldo_billetera) + monto);
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoSaldo, uid]);
      await q(`INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
               VALUES ($1, 'ingreso', $2, $3, $4, $5)`, [uid, monto, descripcion, referencia ?? null, nuevoSaldo]);
      return nuevoSaldo;
    });
  },

  /**
   * ATÓMICO: transfiere saldo de un usuario a otro (por correo). Bloquea ambas
   * filas en orden determinista (por id) para evitar interbloqueos, valida saldo
   * y escribe los dos asientos (egreso del origen, ingreso del destino).
   */
  async transferir(uidOrigen: string, emailDestino: string, monto: number, descripcion?: string): Promise<{ saldoOrigen: number; destino: { id: string; email: string | null; nombre: string | null } }> {
    if (!(monto > 0)) throw new WalletError('monto_invalido', 'El monto debe ser mayor que 0.');
    return withTransaction(async (q) => {
      const dest = (await q<{ id: string; email: string | null; nombre: string | null }>(
        `SELECT id, email, nombre FROM usuarios WHERE lower(email) = lower($1) LIMIT 1`, [emailDestino]))[0];
      if (!dest) throw new WalletError('destino_no_encontrado', 'No existe un usuario con ese correo.');
      if (dest.id === uidOrigen) throw new WalletError('destino_invalido', 'No puedes transferirte a ti mismo.');
      // Bloquea ambas filas a la vez, en orden de id (evita deadlocks).
      const filas = await q<{ id: string; saldo_billetera: string }>(
        `SELECT id, saldo_billetera FROM usuarios WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`, [uidOrigen, dest.id]);
      const oRow = filas.find((f) => f.id === uidOrigen);
      const dRow = filas.find((f) => f.id === dest.id);
      if (!oRow || !dRow) throw new WalletError('usuario_no_encontrado', 'Usuario no encontrado.');
      const saldoOrigen = Number(oRow.saldo_billetera);
      if (saldoOrigen < monto) throw new WalletError('saldo_insuficiente', 'Saldo insuficiente para la transferencia.');
      const nuevoOrigen = money2(saldoOrigen - monto);
      const nuevoDestino = money2(Number(dRow.saldo_billetera) + monto);
      const desc = descripcion || 'Transferencia';
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoOrigen, uidOrigen]);
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoDestino, dest.id]);
      await q(`INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
               VALUES ($1, 'egreso', $2, $3, $4, $5)`, [uidOrigen, monto, `${desc} → ${dest.email ?? dest.id}`, dest.id, nuevoOrigen]);
      await q(`INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
               VALUES ($1, 'ingreso', $2, $3, $4, $5)`, [dest.id, monto, `${desc} recibida`, uidOrigen, nuevoDestino]);
      return { saldoOrigen: nuevoOrigen, destino: { id: dest.id, email: dest.email, nombre: dest.nombre } };
    });
  },
};
