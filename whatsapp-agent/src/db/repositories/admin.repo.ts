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

    const [kpi, cms, roles, rev, pedidos, recargas] = await Promise.all([kpiQ, cmsQ, rolesQ, revQ, pedidosAct, recargasAct]);

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
    };
  },
};

export default AdminRepository;
