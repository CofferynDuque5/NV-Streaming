/**
 * admin-overview.js — Alimenta el panel de administración con el resumen REAL
 * del negocio (GET /api/admin/overview): KPIs, conteos por módulo, reparto de
 * roles y actividad reciente. Lo deja en el Store ("adminOverview") para que el
 * presentador del panel (bridge.decorateAdmin) lo pinte. Sin datos inventados:
 * si el backend no responde, el panel usa lo que ya haya en el Store.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";

const { Store, Bus } = NVCore;

function esAdmin() {
  return (typeof window !== "undefined" && (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page")))) === "admin";
}

let cargando = false;
async function cargar() {
  if (cargando) return;
  cargando = true;
  try {
    // 1) Resumen (KPIs, roles, actividad) → panel principal.
    const resumen = await NVApi.adminOverview();
    if (resumen) Store.set("adminOverview", resumen); // dispara store:changed → repinta
    // 2) Conjuntos reales para las tablas del back office (Usuarios, Suscripciones,
    //    Recargas, Inventario) — así TODAS las secciones se alimentan de PostgreSQL.
    const datos = await NVApi.adminDatos();
    if (datos) {
      if (Array.isArray(datos.usuarios)) Store.set("usuarios", datos.usuarios);
      if (Array.isArray(datos.suscripciones)) Store.set("suscripciones", datos.suscripciones);
      if (Array.isArray(datos.recargas)) Store.set("recargasBilletera", datos.recargas);
      if (Array.isArray(datos.cuentas)) Store.set("inventario", datos.cuentas);
    }
  } catch (_) {
    // Sin sesión admin / offline: se conserva lo que haya (o queda vacío).
  } finally {
    cargando = false;
  }
}

export function instalarAdminOverview() {
  if (typeof document === "undefined" || !esAdmin() || window.__NV_ADMIN_OVERVIEW) return;
  window.__NV_ADMIN_OVERVIEW = true;
  cargar();
  // Re-carga cuando cambian los datos que afectan a los KPIs (aprobar/rechazar).
  if (Bus && Bus.on) { Bus.on("app:ready", cargar); Bus.on("catalogo:real", cargar); }
  if (Store && Store.subscribe) {
    Store.subscribe("pedidos", cargar);
    Store.subscribe("recargasBilletera", cargar);
    Store.subscribe("sesion", cargar);
  }
}

export default { instalarAdminOverview };
