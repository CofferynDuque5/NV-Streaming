/**
 * nv-ui-state.js — Estandariza los estados de datos de una vista:
 *   cargando → skeleton · vacío → empty state · error → reintento · listo → render.
 *
 * Usa las clases del sistema de diseño (nv-skeleton, nv-empty…). Sin
 * dependencias. Pensado para envolver cualquier contenedor que se llena tras
 * una llamada a red.
 *
 * Uso:
 *   import { cargarEn } from './nv-ui-state.js';
 *   cargarEn(el, () => NVApi.resellerClients(), {
 *     vacio: (v) => v.length === 0,
 *     empty: { titulo: 'Aún no tienes clientes', desc: 'Comparte tu enlace…' },
 *     render: (data) => pintarTabla(el, data),
 *   });
 */

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Devuelve el HTML de un bloque de skeletons (n filas). */
export function skeletonHTML(filas) {
  const n = filas || 3;
  let out = '<div class="nv-enter" aria-hidden="true">';
  for (let i = 0; i < n; i++) {
    out += '<div class="nv-skeleton nv-skeleton--line" style="width:' + (60 + ((i * 13) % 35)) + '%"></div>' +
           '<div class="nv-skeleton nv-skeleton--text"></div>';
  }
  return out + '</div>';
}

const ICONO_EMPTY = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>';

export function emptyHTML(cfg) {
  const c = cfg || {};
  return '<div class="nv-empty nv-enter">' +
    '<div class="nv-empty__orb">' + (c.icono || ICONO_EMPTY) + '</div>' +
    '<div class="nv-empty__title">' + esc(c.titulo || 'Nada por aquí todavía') + '</div>' +
    (c.desc ? '<div class="nv-empty__desc">' + esc(c.desc) + '</div>' : '') +
    (c.accion ? '<button type="button" class="nv-btn nv-btn--aurora" data-nv-empty-action style="margin-top:6px;">' + esc(c.accion.label) + '</button>' : '') +
    '</div>';
}

export function errorHTML(cfg) {
  const c = cfg || {};
  return '<div class="nv-empty nv-enter" style="border-color:var(--nv-danger-a12,rgba(255,77,109,.12));">' +
    '<div class="nv-empty__orb" style="color:var(--nv-danger,#FF4D6D);box-shadow:none;border-color:var(--nv-danger-a12,rgba(255,77,109,.12));background:var(--nv-danger-a12,rgba(255,77,109,.12));">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>' +
    '</div>' +
    '<div class="nv-empty__title">' + esc(c.titulo || 'No pudimos cargar esto') + '</div>' +
    '<div class="nv-empty__desc">' + esc(c.desc || 'Revisa tu conexión e inténtalo de nuevo.') + '</div>' +
    '<button type="button" class="nv-btn nv-btn--ghost" data-nv-retry style="margin-top:6px;">Reintentar</button>' +
    '</div>';
}

/**
 * Orquesta el ciclo de vida de carga sobre `el`.
 * @param {HTMLElement} el  contenedor destino.
 * @param {() => Promise<any>} cargar  función que trae los datos.
 * @param {object} o  { filas, vacio(data)->bool, empty{}, error{}, render(data,el) }
 */
export async function cargarEn(el, cargar, o) {
  if (!el) return;
  const opts = o || {};
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = skeletonHTML(opts.filas);
  try {
    const data = await cargar();
    el.setAttribute('aria-busy', 'false');
    const vacio = opts.vacio ? opts.vacio(data) : (Array.isArray(data) && data.length === 0);
    if (vacio) {
      el.innerHTML = emptyHTML(opts.empty);
      const act = el.querySelector('[data-nv-empty-action]');
      if (act && opts.empty && opts.empty.accion) act.addEventListener('click', opts.empty.accion.onClick);
      return;
    }
    el.innerHTML = '';
    if (opts.render) opts.render(data, el);
  } catch (err) {
    el.setAttribute('aria-busy', 'false');
    el.innerHTML = errorHTML(opts.error);
    const retry = el.querySelector('[data-nv-retry]');
    if (retry) retry.addEventListener('click', () => cargarEn(el, cargar, o));
    // El toast global ya avisó del fallo de red; aquí solo dejamos el reintento.
  }
}

export function instalarUiState() {
  if (typeof window !== 'undefined') window.NVState = { cargarEn, skeletonHTML, emptyHTML, errorHTML };
}

export default { cargarEn, skeletonHTML, emptyHTML, errorHTML, instalarUiState };
