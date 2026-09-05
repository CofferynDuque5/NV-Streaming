/**
 * detalle-nav.js — Navegación a la ficha REAL del producto.
 *
 * Cualquier tarjeta de servicio de la tienda lleva `data-nv-id="<id_servicio>"`.
 * Al hacer clic, llevamos al usuario a `detalles.html?id=<id>`, para que la ficha
 * muestre ESE producto (bridge.decorateDetalles lo resuelve del catálogo real).
 *
 * No intercepta paneles internos (admin/editor/revendedor), enlaces `data-nv-link`
 * ni controles de navegación propios, para no pisar otros comportamientos.
 */
function paginaActual() {
  return (typeof window !== "undefined" && window.__NV_PAGE) ||
    (document.body && document.body.getAttribute("data-nv-page")) || "";
}

export function instalarDetalleNav() {
  if (typeof document === "undefined" || window.__NV_DETALLE_NAV) return;
  const page = paginaActual();
  if (["admin", "editor", "revendedor"].includes(page)) return; // paneles internos no
  window.__NV_DETALLE_NAV = true;

  document.addEventListener("click", (ev) => {
    const card = ev.target.closest("[data-nv-id]");
    if (!card) return;
    const id = card.getAttribute("data-nv-id");
    // Ignora placeholders, ids sin resolver o tarjetas de estado vacío.
    if (!id || id === "__vacio__" || id.indexOf("{{") !== -1) return;
    // No pisar enlaces/navegación explícitos dentro de la tarjeta.
    if (ev.target.closest("[data-nv-link], a[href], nav, header")) return;
    ev.preventDefault();
    window.location.assign("detalles.html?id=" + encodeURIComponent(id));
  }, false);
}

export default { instalarDetalleNav };
