/**
 * nv-perf.js — Optimización de assets del cliente (rendimiento).
 *
 * nv-runtime pinta e inyecta imágenes dinámicamente (logos de servicios,
 * carteleras…). Este módulo aplica carga diferida a TODAS las imágenes —
 * presentes y futuras — sin tocar el markup:
 *   · loading="lazy"    → el navegador no descarga imágenes fuera de viewport.
 *   · decoding="async"  → la decodificación no bloquea el hilo principal.
 * Se puede excluir una imagen crítica (above-the-fold) marcándola con
 * `data-nv-eager` para no penalizar el LCP.
 *
 * Barato y seguro: un único MutationObserver debounced, idempotente.
 */

function optimizarImagen(img) {
  if (!img || img.__nvPerf) return;
  img.__nvPerf = true;
  if (img.hasAttribute('data-nv-eager')) { img.setAttribute('fetchpriority', 'high'); return; }
  if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
  if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
}

function barrer(raiz) {
  const scope = raiz && raiz.querySelectorAll ? raiz : document;
  scope.querySelectorAll('img').forEach(optimizarImagen);
}

export function instalarPerf() {
  if (typeof document === 'undefined' || window.__NV_PERF) return;
  window.__NV_PERF = true;
  barrer(document);

  let pendiente = false;
  const obs = new MutationObserver((muts) => {
    // Optimiza al vuelo cualquier <img> nueva sin re-barrer todo el árbol.
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') optimizarImagen(n);
        else if (n.querySelector && n.querySelector('img') && !pendiente) {
          pendiente = true;
          requestAnimationFrame(() => { pendiente = false; barrer(document); });
        }
      }
    }
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('nv:runtime-ready', () => barrer(document));
}

export default { instalarPerf };
