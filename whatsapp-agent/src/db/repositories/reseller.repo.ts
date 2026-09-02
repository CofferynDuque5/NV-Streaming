/**
 * reseller.repo.ts — Programa de revendedores (referidos + comisiones REALES).
 *
 * Todo se calcula/mueve en PostgreSQL, nunca en el cliente:
 *   · Código de referido único por usuario (enlace ?ref=CODE).
 *   · `referido_por` se fija UNA vez al registrarse con un ?ref válido.
 *   · Cada pedido APROBADO de un referido genera UNA comisión (idempotente por
 *     pedido_id) = precio × comision_pct del revendedor.
 *   · Un retiro mueve las comisiones disponibles → 'pagada' y acredita el saldo
 *     del revendedor, con asiento en el libro mayor, todo en una transacción.
 */
import { query, withTransaction } from '../pool.js';
import { AppError } from '../../core/errors.js';

const ESTADO_RESELLER: Readonly<Record<string, number>> = {
  sin_comisiones: 409, usuario_no_encontrado: 404, codigo_no_generado: 500,
};

export class ResellerError extends AppError {
  constructor(code: string, message: string) {
    super({ code, message, statusCode: ESTADO_RESELLER[code] ?? 400 });
  }
}

const money2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => Number(v) || 0;

// Código de referido legible (sin caracteres ambiguos 0/O/1/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generarCodigo(): string {
  let s = 'NV';
  for (let i = 0; i < 5; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

export type PuntoSerie = { label: string; ventas: number; comision: number };
export type TopServicio = { servicio: string; ventas: number; comision: number };
export type NivelReseller = { nombre: string; siguiente: string | null; pct: number; faltante: number; base: number; hasta: number | null };
export type ResumenReseller = {
  codigo: string; ventas: number; ingresos: number; comisionTotal: number;
  pendiente: number; disponible: number; pagada: number; pagadaMes: number;
  clientes: number; saldo: number; comisionPct: number;
  serie: PuntoSerie[]; topServicios: TopServicio[]; nivel: NivelReseller;
};

// Niveles por comisión ACUMULADA real (USD). Umbrales fijos y transparentes.
const NIVELES = [
  { nombre: 'Bronce',   base: 0,    hasta: 50 as number | null,   siguiente: 'Plata' as string | null },
  { nombre: 'Plata',    base: 50,   hasta: 150 as number | null,  siguiente: 'Oro' as string | null },
  { nombre: 'Oro',      base: 150,  hasta: 400 as number | null,  siguiente: 'Platino' as string | null },
  { nombre: 'Platino',  base: 400,  hasta: 1000 as number | null, siguiente: 'Diamante' as string | null },
  { nombre: 'Diamante', base: 1000, hasta: null,                  siguiente: null },
];
const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function calcularNivel(comisionTotal: number): NivelReseller {
  let cur = NIVELES[0]!;
  for (const n of NIVELES) { if (comisionTotal >= n.base) cur = n; }
  const pct = cur.hasta == null ? 100 : Math.max(0, Math.min(100, Math.round(((comisionTotal - cur.base) / (cur.hasta - cur.base)) * 100)));
  const faltante = cur.hasta == null ? 0 : Math.max(0, Math.round((cur.hasta - comisionTotal) * 100) / 100);
  return { nombre: cur.nombre, siguiente: cur.siguiente, pct, faltante, base: cur.base, hasta: cur.hasta };
}

export type ClienteReferido = {
  id: string; nombre: string | null; email: string | null; whatsapp: string | null;
  desde: Date; pedidos: number; total: number; ultimo: Date | null;
  activas: number; proximoVence: Date | null;
};

export type ComisionRow = {
  id: string; monto: number; pct: number; montoVenta: number; servicio: string | null;
  estado: string; estadoUI: 'Pendiente' | 'Disponible' | 'Pagada' | 'Anulada';
  clienteNombre: string | null; clienteEmail: string | null;
  disponibleEn: Date; creadoEn: Date; pagadaEn: Date | null;
};

export const ResellerRepository = {
  /** Devuelve el codigo_ref del usuario, generándolo (único) si aún no tiene. */
  async asegurarCodigo(uid: string): Promise<string> {
    const cur = (await query<{ codigo_ref: string | null }>(
      `SELECT codigo_ref FROM usuarios WHERE id = $1`, [uid]))[0];
    if (cur?.codigo_ref) return cur.codigo_ref;
    for (let i = 0; i < 10; i++) {
      const code = generarCodigo();
      const rows = await query<{ codigo_ref: string }>(
        `UPDATE usuarios SET codigo_ref = $2
           WHERE id = $1 AND codigo_ref IS NULL
             AND NOT EXISTS (SELECT 1 FROM usuarios WHERE upper(codigo_ref) = upper($2))
         RETURNING codigo_ref`, [uid, code]);
      if (rows[0]) return rows[0].codigo_ref;
      const again = (await query<{ codigo_ref: string | null }>(
        `SELECT codigo_ref FROM usuarios WHERE id = $1`, [uid]))[0];
      if (again?.codigo_ref) return again.codigo_ref;   // set por otra petición
    }
    throw new ResellerError('codigo_no_generado', 'No se pudo generar el código de referido.');
  },

  /** Resuelve un código de referido → revendedor (id + % de comisión). */
  async resolverReferente(codigo: string): Promise<{ id: string; comisionPct: number } | null> {
    const c = String(codigo || '').trim();
    if (!c) return null;
    const rows = await query<{ id: string; comision_pct: string }>(
      `SELECT id, comision_pct FROM usuarios WHERE upper(codigo_ref) = upper($1) LIMIT 1`, [c]);
    return rows[0] ? { id: rows[0].id, comisionPct: num(rows[0].comision_pct) } : null;
  },

  /**
   * Fija `referido_por` UNA sola vez (al registrarse). No se puede auto-referir
   * ni cambiar el referente una vez asignado. Devuelve true si lo guardó.
   */
  async marcarReferido(clienteId: string, codigo: string): Promise<boolean> {
    const ref = await this.resolverReferente(codigo);
    if (!ref || ref.id === clienteId) return false;
    const rows = await query<{ id: string }>(
      `UPDATE usuarios SET referido_por = $2
         WHERE id = $1 AND referido_por IS NULL
       RETURNING id`, [clienteId, ref.id]);
    return rows.length > 0;
  },

  /**
   * Acredita la comisión de UN pedido si su comprador fue referido y el pedido
   * está aprobado/entregado. Idempotente (índice único por pedido_id): llamar
   * varias veces no duplica. Una sola sentencia = atómico.
   */
  async acreditarPorPedido(pedidoId: string): Promise<{ creada: boolean }> {
    const rows = await query<{ id: string }>(
      `INSERT INTO comisiones (revendedor_id, cliente_id, pedido_id, id_servicio, monto_venta, pct, monto)
       SELECT u.referido_por, p.uid_cliente, p.id, p.id_servicio, p.precio,
              ref.comision_pct, round(p.precio * ref.comision_pct, 2)
         FROM pedidos p
         JOIN usuarios u   ON u.id  = p.uid_cliente
         JOIN usuarios ref ON ref.id = u.referido_por
        WHERE p.id = $1
          AND p.estado IN ('aprobado','entregado')
          AND u.referido_por IS NOT NULL
       ON CONFLICT (pedido_id) DO NOTHING
       RETURNING id`, [pedidoId]);
    return { creada: rows.length > 0 };
  },

  /** Resumen del panel: identidad, KPIs y cubos de comisión (todo real). */
  async resumen(uid: string): Promise<ResumenReseller> {
    const codigo = await this.asegurarCodigo(uid);
    const r = (await query<Record<string, unknown>>(
      `SELECT
         COALESCE((SELECT COUNT(*)          FROM comisiones WHERE revendedor_id = $1), 0) AS ventas,
         COALESCE((SELECT SUM(monto_venta)  FROM comisiones WHERE revendedor_id = $1), 0) AS ingresos,
         COALESCE((SELECT SUM(monto)        FROM comisiones WHERE revendedor_id = $1), 0) AS comision_total,
         COALESCE((SELECT SUM(monto)        FROM comisiones WHERE revendedor_id = $1 AND estado = 'pendiente' AND disponible_en >  now()), 0) AS pendiente,
         COALESCE((SELECT SUM(monto)        FROM comisiones WHERE revendedor_id = $1 AND estado = 'pendiente' AND disponible_en <= now()), 0) AS disponible,
         COALESCE((SELECT SUM(monto)        FROM comisiones WHERE revendedor_id = $1 AND estado = 'pagada'), 0) AS pagada,
         COALESCE((SELECT SUM(monto)        FROM comisiones WHERE revendedor_id = $1 AND estado = 'pagada' AND pagada_en >= date_trunc('month', now())), 0) AS pagada_mes,
         COALESCE((SELECT COUNT(*)          FROM usuarios   WHERE referido_por  = $1), 0) AS clientes,
         COALESCE((SELECT saldo_billetera   FROM usuarios   WHERE id = $1), 0) AS saldo,
         COALESCE((SELECT comision_pct      FROM usuarios   WHERE id = $1), 0.25) AS comision_pct`,
      [uid]))[0]!;

    // Serie temporal: últimos 6 meses (ventas = monto de venta; comisión = ganancia).
    const serieRows = await query<Record<string, unknown>>(
      `SELECT to_char(g.mes, 'MM') AS mm,
              COALESCE(SUM(c.monto_venta), 0) AS ventas,
              COALESCE(SUM(c.monto), 0)       AS comision
         FROM generate_series(date_trunc('month', now()) - interval '5 months',
                              date_trunc('month', now()), interval '1 month') AS g(mes)
         LEFT JOIN comisiones c ON c.revendedor_id = $1 AND date_trunc('month', c.creado_en) = g.mes
        GROUP BY g.mes ORDER BY g.mes`, [uid]);
    const serie: PuntoSerie[] = serieRows.map((s) => ({
      label: MESES_ES[(Number(s.mm) || 1) - 1] || String(s.mm),
      ventas: money2(num(s.ventas)),
      comision: money2(num(s.comision)),
    }));

    // Top servicios por comisión generada.
    const topRows = await query<Record<string, unknown>>(
      `SELECT id_servicio AS servicio, COUNT(*) AS ventas, COALESCE(SUM(monto), 0) AS comision
         FROM comisiones WHERE revendedor_id = $1 AND id_servicio IS NOT NULL
        GROUP BY id_servicio ORDER BY comision DESC LIMIT 5`, [uid]);
    const topServicios: TopServicio[] = topRows.map((t) => ({
      servicio: t.servicio as string,
      ventas: num(t.ventas),
      comision: money2(num(t.comision)),
    }));

    const comisionTotal = money2(num(r.comision_total));
    return {
      codigo,
      ventas: num(r.ventas),
      ingresos: money2(num(r.ingresos)),
      comisionTotal,
      pendiente: money2(num(r.pendiente)),
      disponible: money2(num(r.disponible)),
      pagada: money2(num(r.pagada)),
      pagadaMes: money2(num(r.pagada_mes)),
      clientes: num(r.clientes),
      saldo: money2(num(r.saldo)),
      comisionPct: num(r.comision_pct),
      serie, topServicios,
      nivel: calcularNivel(comisionTotal),
    };
  },

  /** CRM: los clientes que este revendedor refirió, con su actividad real. */
  async clientes(uid: string, limite = 50): Promise<ClienteReferido[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT c.id, c.nombre, c.email, c.id_whatsapp, c.creado_en,
              COALESCE(ped.n, 0)     AS pedidos,
              COALESCE(ped.total, 0) AS total,
              ped.ultimo,
              COALESCE(sub.activas, 0) AS activas,
              sub.prox_venc
         FROM usuarios c
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS n, SUM(precio) AS total, MAX(creado_en) AS ultimo
             FROM pedidos WHERE uid_cliente = c.id AND estado IN ('aprobado','entregado')
         ) ped ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS activas, MIN(fecha_vencimiento) AS prox_venc
             FROM suscripciones WHERE usuario_id = c.id AND estado = 'activa'
         ) sub ON true
        WHERE c.referido_por = $1
        ORDER BY c.creado_en DESC
        LIMIT $2`, [uid, limite]);
    return rows.map((r) => ({
      id: r.id as string,
      nombre: (r.nombre as string) ?? null,
      email: (r.email as string) ?? null,
      whatsapp: (r.id_whatsapp as string) ?? null,
      desde: r.creado_en as Date,
      pedidos: num(r.pedidos),
      total: money2(num(r.total)),
      ultimo: (r.ultimo as Date) ?? null,
      activas: num(r.activas),
      proximoVence: (r.prox_venc as Date) ?? null,
    }));
  },

  /** Libro de comisiones del revendedor (con estado calculado para la UI). */
  async comisiones(uid: string, limite = 50): Promise<ComisionRow[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT co.id, co.monto, co.pct, co.monto_venta, co.id_servicio, co.estado,
              co.disponible_en, co.creado_en, co.pagada_en,
              cli.nombre AS cliente_nombre, cli.email AS cliente_email
         FROM comisiones co
         LEFT JOIN usuarios cli ON cli.id = co.cliente_id
        WHERE co.revendedor_id = $1
        ORDER BY co.creado_en DESC
        LIMIT $2`, [uid, limite]);
    const ahora = Date.now();
    return rows.map((r) => {
      const estado = r.estado as string;
      const estadoUI: ComisionRow['estadoUI'] =
        estado === 'pagada' ? 'Pagada'
        : estado === 'anulada' ? 'Anulada'
        : (new Date(r.disponible_en as Date).getTime() <= ahora ? 'Disponible' : 'Pendiente');
      return {
        id: r.id as string,
        monto: money2(num(r.monto)),
        pct: num(r.pct),
        montoVenta: money2(num(r.monto_venta)),
        servicio: (r.id_servicio as string) ?? null,
        estado, estadoUI,
        clienteNombre: (r.cliente_nombre as string) ?? null,
        clienteEmail: (r.cliente_email as string) ?? null,
        disponibleEn: r.disponible_en as Date,
        creadoEn: r.creado_en as Date,
        pagadaEn: (r.pagada_en as Date) ?? null,
      };
    });
  },

  /**
   * ATÓMICO: retira todas las comisiones DISPONIBLES → las marca 'pagada' y
   * acredita ese total al saldo del revendedor (con asiento en el libro mayor).
   * Falla si no hay nada disponible.
   */
  async retirar(uid: string, metodo?: string): Promise<{ retirado: number; saldo: number; retiroId: string }> {
    return withTransaction(async (q) => {
      const disp = await q<{ id: string; monto: string }>(
        `SELECT id, monto FROM comisiones
          WHERE revendedor_id = $1 AND estado = 'pendiente' AND disponible_en <= now()
          FOR UPDATE`, [uid]);
      const ids = disp.map((d) => d.id);
      const total = money2(disp.reduce((a, d) => a + num(d.monto), 0));
      if (!ids.length || total <= 0) {
        throw new ResellerError('sin_comisiones', 'No tienes comisiones disponibles para retirar.');
      }
      await q(`UPDATE comisiones SET estado = 'pagada', pagada_en = now() WHERE id = ANY($1::uuid[])`, [ids]);
      const u = (await q<{ saldo_billetera: string }>(
        `SELECT saldo_billetera FROM usuarios WHERE id = $1 FOR UPDATE`, [uid]))[0];
      if (!u) throw new ResellerError('usuario_no_encontrado', 'Usuario no encontrado.');
      const nuevoSaldo = money2(num(u.saldo_billetera) + total);
      await q(`UPDATE usuarios SET saldo_billetera = $1 WHERE id = $2`, [nuevoSaldo, uid]);
      await q(
        `INSERT INTO movimientos_billetera (uid_usuario, tipo, monto, descripcion, referencia, saldo_posterior)
         VALUES ($1, 'ingreso', $2, $3, $4, $5)`,
        [uid, total, 'Retiro de comisiones a billetera', 'comisiones', nuevoSaldo]);
      const ret = (await q<{ id: string }>(
        `INSERT INTO retiros_comision (revendedor_id, monto, metodo, estado)
         VALUES ($1, $2, $3, 'pagado') RETURNING id`, [uid, total, metodo || 'billetera']))[0]!;
      return { retirado: total, saldo: nuevoSaldo, retiroId: ret.id };
    });
  },
};

export default ResellerRepository;
