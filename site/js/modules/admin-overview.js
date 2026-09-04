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
    const resumen = await NVApi.adminOverview();
    if (resumen) Store.set("adminOverview", resumen); // dispara store:changed → repinta
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
