/**
 * admin.repo.ts — Datos REALES para el panel de administración (Back Office).
 *
 * Responsabilidad única: calcular, desde PostgreSQL, los KPIs, los conteos por
 * módulo, el reparto de roles y la actividad reciente que consume el panel. No
 * inventa nada: si una tabla está vacía, devuelve 0 / lista vacía.
 */
import { query } from '../pool.js';

export type AdminOverview = {
  kpis: {
    ventasAprobadas: number;
    pedidosAprobados: number;
    pedidosPendientes: number;
    usuarios: number;
    suscripcionesActivas: number;
    recargasPendientes: number;
    cuentasStock: number;
    planes: number;
  };
  // Conteos por colección/entidad, para las tarjetas de módulo (clave → total).
  conteos: Record<string, number>;
  // Reparto real de usuarios por rol.
  roles: Array<{ rol: string; total: number }>;
  // Actividad reciente real (pedidos y recargas), ya ordenada y formateada.
  actividad: Array<{ tipo: string; actor: string; accion: string; modulo: string; estado: string; cuando: string }>;
  // Serie de 14 días (ventas + pedidos por día) para el gráfico del dashboard.
  serie: Array<{ dia: string; ventas: number; pedidos: number }>;
  // Top de servicios por ingresos reales.
  topServicios: Array<{ servicio: string; ventas: number; ingresos: number }>;
};

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export const AdminRepository = {
  async overview(): Promise<AdminOverview> {
    const kpiQ = query<{
      ventas_aprobadas: string; pedidos_aprobados: string; pedidos_pendientes: string;
      usuarios: string; suscripciones_activas: string; recargas_pendientes: string;
      cuentas_stock: string; planes: string;
    }>(`
      SELECT
        (SELECT COALESCE(SUM(precio),0) FROM pedidos WHERE estado IN ('aprobado','entregado')) AS ventas_aprobadas,
        (SELECT COUNT(*) FROM pedidos WHERE estado IN ('aprobado','entregado'))               AS pedidos_aprobados,
        (SELECT COUNT(*) FROM pedidos WHERE estado='pendiente')                                AS pedidos_pendientes,
        (SELECT COUNT(*) FROM usuarios)                                                        AS usuarios,
        (SELECT COUNT(*) FROM suscripciones WHERE estado='activa')                             AS suscripciones_activas,
        (SELECT COUNT(*) FROM recargas_billetera WHERE estado='pendiente')                     AS recargas_pendientes,
        (SELECT COUNT(*) FROM cuentas_streaming)                                               AS cuentas_stock,
        (SELECT COUNT(*) FROM planes)                                                          AS planes
    `);

    const cmsQ = query<{ coleccion: string; total: string }>(
      `SELECT coleccion, COUNT(*)::int AS total FROM cms_documentos GROUP BY coleccion`,
    );
    const rolesQ = query<{ rol: string; total: string }>(
      `SELECT COALESCE(NULLIF(rol,''),'cliente') AS rol, COUNT(*)::int AS total FROM usuarios GROUP BY 1 ORDER BY 2 DESC`,
    );
    const revQ = query<{ total: string }>(`SELECT COUNT(*)::int AS total FROM usuarios WHERE rol='revendedor'`);
    const pedidosAct = query<{ id: string; actor: string | null; ref: string; estado: string; cuando: string }>(
      `SELECT id::text, nombre_cliente AS actor, id_servicio AS ref, estado, to_char(creado_en,'YYYY-MM-DD"T"HH24:MI:SSOF') AS cuando
         FROM pedidos ORDER BY creado_en DESC LIMIT 6`,
    );
    const recargasAct = query<{ id: string; monto: string; estado: string; cuando: string }>(
      `SELECT id::text, monto, estado, to_char(creado_en,'YYYY-MM-DD"T"HH24:MI:SSOF') AS cuando
         FROM recargas_billetera ORDER BY creado_en DESC LIMIT 6`,
    );

    // Serie de los últimos 14 días (ventas aprobadas + pedidos por día).
    const serieQ = query<{ dia: string; ventas: string; pedidos: string }>(
      `SELECT to_char(d::date,'YYYY-MM-DD') AS dia,
              COALESCE((SELECT SUM(precio) FROM pedidos WHERE estado IN ('aprobado','entregado') AND creado_en::date = d::date),0) AS ventas,
              COALESCE((SELECT COUNT(*)    FROM pedidos WHERE creado_en::date = d::date),0) AS pedidos
         FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        ORDER BY d`,
    );
    // Top servicios por ingresos (pedidos aprobados/entregados).
    const topQ = query<{ servicio: string; ventas: string; ingresos: string }>(
      `SELECT id_servicio AS servicio, COUNT(*)::int AS ventas, COALESCE(SUM(precio),0) AS ingresos
         FROM pedidos WHERE estado IN ('aprobado','entregado')
        GROUP BY id_servicio ORDER BY ingresos DESC LIMIT 6`,
    );

    const [kpi, cms, roles, rev, pedidos, recargas, serie, top] = await Promise.all([kpiQ, cmsQ, rolesQ, revQ, pedidosAct, recargasAct, serieQ, topQ]);

    const k = kpi[0] || ({} as Record<string, string>);
    const conteos: Record<string, number> = {};
    for (const r of cms) conteos[r.coleccion] = num(r.total);
    conteos['pedidos'] = num(k.pedidos_aprobados) + num(k.pedidos_pendientes);
    conteos['pedidos_pendientes'] = num(k.pedidos_pendientes);
    conteos['usuarios'] = num(k.usuarios);
    conteos['revendedores'] = num(rev[0]?.total);
    conteos['suscripciones'] = num(k.suscripciones_activas);
    conteos['recargas_pendientes'] = num(k.recargas_pendientes);
    conteos['cuentas'] = num(k.cuentas_stock);
    conteos['planes'] = num(k.planes);

    // Actividad real: mezcla pedidos + recargas, orden descendente por fecha.
    const actividad = [
      ...pedidos.map((p) => ({
        tipo: 'pedido', actor: p.actor || 'Cliente',
        accion: `pedido de ${p.ref}`, modulo: 'Órdenes', estado: p.estado, cuando: p.cuando,
      })),
      ...recargas.map((r) => ({
        tipo: 'recarga', actor: 'Billetera',
        accion: `recarga de $${num(r.monto).toFixed(2)}`, modulo: 'Recargas', estado: r.estado, cuando: r.cuando,
      })),
    ].sort((a, b) => (a.cuando < b.cuando ? 1 : -1)).slice(0, 8);

    return {
      kpis: {
        ventasAprobadas: num(k.ventas_aprobadas),
        pedidosAprobados: num(k.pedidos_aprobados),
        pedidosPendientes: num(k.pedidos_pendientes),
        usuarios: num(k.usuarios),
        suscripcionesActivas: num(k.suscripciones_activas),
        recargasPendientes: num(k.recargas_pendientes),
        cuentasStock: num(k.cuentas_stock),
        planes: num(k.planes),
      },
      conteos,
      roles: roles.map((r) => ({ rol: r.rol, total: num(r.total) })),
      actividad,
      serie: serie.map((s) => ({ dia: s.dia, ventas: num(s.ventas), pedidos: num(s.pedidos) })),
      topServicios: top.map((t) => ({ servicio: t.servicio, ventas: num(t.ventas), ingresos: num(t.ingresos) })),
    };
  },

  /**
   * Lista REAL de revendedores para el back office: cada usuario que es
   * revendedor (o que ya generó comisiones / tiene referidos), con su red y sus
   * comisiones agregadas. Solo lectura, solo admin.
   */
  async revendedores(): Promise<Array<Record<string, unknown>>> {
    const rows = await query<{
      id: string; nombre: string | null; email: string | null; codigo_ref: string | null;
      comision_pct: string; saldo: string; clientes: string; ventas: string;
      comision_total: string; pendiente: string; pagada: string;
    }>(`
      SELECT u.id::text, u.nombre, u.email, u.codigo_ref, u.comision_pct,
             COALESCE(u.saldo_billetera,0) AS saldo,
             (SELECT COUNT(*) FROM usuarios r WHERE r.referido_por = u.id)                                    AS clientes,
             (SELECT COUNT(*) FROM comisiones c WHERE c.revendedor_id = u.id)                                 AS ventas,
             COALESCE((SELECT SUM(monto) FROM comisiones c WHERE c.revendedor_id = u.id),0)                   AS comision_total,
             COALESCE((SELECT SUM(monto) FROM comisiones c WHERE c.revendedor_id = u.id AND c.estado='pendiente'),0) AS pendiente,
             COALESCE((SELECT SUM(monto) FROM comisiones c WHERE c.revendedor_id = u.id AND c.estado='pagada'),0)    AS pagada
        FROM usuarios u
       WHERE u.rol = 'revendedor'
          OR EXISTS (SELECT 1 FROM comisiones c WHERE c.revendedor_id = u.id)
          OR EXISTS (SELECT 1 FROM usuarios r WHERE r.referido_por = u.id)
       ORDER BY comision_total DESC, clientes DESC
       LIMIT 200
    `);
    return rows.map((r) => ({
      id: r.id, nombre: r.nombre || '', email: r.email || '', codigo: r.codigo_ref || '',
      comisionPct: num(r.comision_pct), saldo: num(r.saldo), clientes: num(r.clientes),
      ventas: num(r.ventas), comisionTotal: num(r.comision_total),
      pendiente: num(r.pendiente), pagada: num(r.pagada),
    }));
  },

  /**
   * Actualiza campos administrables de un usuario (rol, saldo, % de comisión).
   * Solo admin. Devuelve el usuario ya actualizado, o null si el id no existe.
   */
  async actualizarUsuario(
    id: string,
    patch: { rol?: string; saldoBilletera?: number; comisionPct?: number },
  ): Promise<Record<string, unknown> | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    const ROLES = new Set(['cliente', 'revendedor', 'admin']);
    if (patch.rol != null && ROLES.has(patch.rol)) { sets.push(`rol=$${i++}`); vals.push(patch.rol); }
    if (patch.saldoBilletera != null && Number.isFinite(patch.saldoBilletera) && patch.saldoBilletera >= 0) {
      sets.push(`saldo_billetera=$${i++}`); vals.push(patch.saldoBilletera);
    }
    if (patch.comisionPct != null && Number.isFinite(patch.comisionPct) && patch.comisionPct >= 0 && patch.comisionPct <= 1) {
      sets.push(`comision_pct=$${i++}`); vals.push(patch.comisionPct);
    }
    if (!sets.length) return null;
    vals.push(id);
    const rows = await query<{ id: string; nombre: string | null; email: string | null; rol: string; saldo_billetera: string; comision_pct: string }>(
      `UPDATE usuarios SET ${sets.join(', ')}, actualizado_en=now() WHERE id=$${i}
        RETURNING id::text, nombre, email, rol, saldo_billetera, comision_pct`,
      vals,
    );
    const u = rows[0];
    if (!u) return null;
    return { id: u.id, nombre: u.nombre || '', email: u.email || '', rol: u.rol, saldoBilletera: num(u.saldo_billetera), comisionPct: num(u.comision_pct) };
  },

  /**
   * Conjuntos de datos REALES para las tablas del back office (Usuarios,
   * Suscripciones, Recargas, Inventario). Cada fila ya viene con la forma que
   * espera la tabla del front (sin normalizar aparte). Solo lectura, solo admin.
   */
  async tablas(): Promise<{
    usuarios: unknown[]; suscripciones: unknown[]; recargas: unknown[]; cuentas: unknown[];
  }> {
    const usuariosQ = query<{ id: string; nombre: string | null; email: string | null; rol: string; saldo: string; id_whatsapp: string | null }>(
      `SELECT id::text, nombre, email, COALESCE(NULLIF(rol,''),'cliente') AS rol,
              COALESCE(saldo_billetera,0) AS saldo, id_whatsapp
         FROM usuarios ORDER BY creado_en DESC LIMIT 500`,
    );
    const subsQ = query<{ id: string; cliente: string | null; servicio: string | null; correo: string | null; perfil: string | null; estado: string; precio: string; vence: string | null }>(
      `SELECT s.id::text, u.nombre AS cliente, s.plataforma_id::text AS servicio,
              c.correo AS correo, c.perfil AS perfil, s.estado,
              COALESCE(pl.precio,0) AS precio,
              to_char(s.fecha_vencimiento,'YYYY-MM-DD') AS vence
         FROM suscripciones s
         LEFT JOIN usuarios u          ON u.id = s.usuario_id
         LEFT JOIN cuentas_streaming c ON c.id = s.cuenta_streaming_id
         LEFT JOIN planes pl           ON pl.id = s.plan_id
        ORDER BY s.creado_en DESC LIMIT 500`,
    );
    const recargasQ = query<{ id: string; email: string | null; monto: string; estado: string; metodo_pago: string | null; aprobado_por: string | null; creado_en: string }>(
      `SELECT r.id::text, u.email AS email, r.monto, r.estado, r.metodo_pago,
              r.aprobado_por::text AS aprobado_por,
              to_char(r.creado_en,'YYYY-MM-DD') AS creado_en
         FROM recargas_billetera r
         LEFT JOIN usuarios u ON u.id = r.uid_usuario
        ORDER BY r.creado_en DESC LIMIT 500`,
    );
    const cuentasQ = query<{ id: string; id_servicio: string | null; estado: string; correo: string | null; perfil: string | null; pin: string | null }>(
      `SELECT id::text, plataforma_id::text AS id_servicio, estado, correo, perfil, pin
         FROM cuentas_streaming ORDER BY creado_en DESC LIMIT 500`,
    );
    const [usuarios, subs, recargas, cuentas] = await Promise.all([usuariosQ, subsQ, recargasQ, cuentasQ]);

    return {
      usuarios: usuarios.map((u) => ({
        id: u.id, nombre: u.nombre || '', email: u.email || '', rol: u.rol,
        saldoBilletera: num(u.saldo), telefono: u.id_whatsapp || '', activo: true, baneado: false,
      })),
      suscripciones: subs.map((s) => ({
        id: s.id, nombre: s.cliente || '', servicio: s.servicio || '', correo: s.correo || '',
        perfil: s.perfil || '', estado: s.estado, precioVenta: num(s.precio), vence: s.vence || '',
      })),
      recargas: recargas.map((r) => ({
        id: r.id, email: r.email || '', monto: num(r.monto), estado: r.estado,
        metodo_pago: r.metodo_pago || '', aprobadoPor: r.aprobado_por || '', creadoEn: r.creado_en,
      })),
      cuentas: cuentas.map((c) => ({
        id: c.id, id_servicio: c.id_servicio || '', estado: c.estado,
        credenciales: { usuario: c.correo || '', perfil: c.perfil || '', pin: c.pin || '' },
      })),
    };
  },
};

export default AdminRepository;
