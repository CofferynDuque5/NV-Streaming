/**
 * nv-toast.js — Sistema de notificaciones (toasts) global y no bloqueante.
 *
 * Complementa a NVUI (modales bloqueantes): los toasts informan sin interrumpir
 * (éxito, error de red, avisos). Autocontenido, en la estética NV (usa los
 * tokens de nv-tokens.css con fallback), accesible (región aria-live) y
 * respetuoso con prefers-reduced-motion.
 *
 * API:  window.NVToast.show({ type, title, msg, timeout, action })
 *       window.NVToast.success(title, msg) · .error() · .info() · .warn()
 * Eventos que escucha en `window`:
 *   · 'nv:toast'    detail = { type, title, msg }        → muestra un toast
 *   · 'nv:neterror' detail = { status, message }         → toast de error de red
 * Desacoplado del resto (no importa Core): la capa de red emite CustomEvents.
 */

let host = null;
let styled = false;

function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'nv-toast-style';
  s.textContent = `
    .nv-toast-host{position:fixed;z-index:2147483000;top:auto;bottom:20px;right:20px;display:flex;
      flex-direction:column;gap:10px;max-width:min(92vw,380px);pointer-events:none;}
    @media(max-width:560px){.nv-toast-host{left:12px;right:12px;bottom:12px;max-width:none;}}
    .nv-toast{pointer-events:auto;display:flex;gap:11px;align-items:flex-start;padding:13px 14px;
      background:var(--nv-glass-bg,rgba(12,14,40,.92));border:1px solid var(--nv-line,rgba(80,100,200,.2));
      border-left-width:3px;border-radius:var(--nv-radius-md,12px);
      box-shadow:var(--nv-shadow-lg,0 22px 50px rgba(0,0,30,.55));
      -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
      color:var(--nv-ink,#EEF2FF);font-family:var(--nv-font-body,'DM Sans',sans-serif);
      transform:translateX(120%);opacity:0;transition:transform .32s cubic-bezier(.32,.72,0,1),opacity .32s;}
    .nv-toast.on{transform:translateX(0);opacity:1;}
    .nv-toast.out{transform:translateX(120%);opacity:0;}
    .nv-toast__ic{flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;margin-top:1px;}
    .nv-toast__bd{flex:1;min-width:0;}
    .nv-toast__t{font-family:var(--nv-font-display,'Syne',sans-serif);font-weight:700;font-size:13.5px;line-height:1.25;}
    .nv-toast__m{font-size:12.5px;color:var(--nv-ink-soft,rgba(200,215,255,.72));line-height:1.45;margin-top:2px;word-wrap:break-word;}
    .nv-toast__x{flex-shrink:0;width:22px;height:22px;border:none;background:transparent;cursor:pointer;
      color:var(--nv-ink-muted,rgba(200,215,255,.46));border-radius:6px;display:flex;align-items:center;justify-content:center;
      transition:background .15s,color .15s;}
    .nv-toast__x:hover{background:rgba(255,255,255,.06);color:var(--nv-ink,#EEF2FF);}
    .nv-toast__act{margin-top:8px;}
    .nv-toast__act button{font:600 12px var(--nv-font-body,'DM Sans',sans-serif);cursor:pointer;
      padding:6px 12px;border-radius:8px;border:1px solid var(--nv-cyan-a24,rgba(0,207,255,.24));
      background:var(--nv-cyan-a08,rgba(0,207,255,.08));color:var(--nv-cyan,#00CFFF);}
    .nv-toast--success{border-left-color:var(--nv-success,#00D4A0);} .nv-toast--success .nv-toast__ic{color:var(--nv-success,#00D4A0);}
    .nv-toast--error{border-left-color:var(--nv-danger,#FF4D6D);}    .nv-toast--error .nv-toast__ic{color:var(--nv-danger,#FF4D6D);}
    .nv-toast--warn{border-left-color:var(--nv-warning,#FFB23E);}    .nv-toast--warn .nv-toast__ic{color:var(--nv-warning,#FFB23E);}
    .nv-toast--info{border-left-color:var(--nv-cyan,#00CFFF);}       .nv-toast--info .nv-toast__ic{color:var(--nv-cyan,#00CFFF);}
    @media(prefers-reduced-motion:reduce){.nv-toast{transition:opacity .2s;transform:none;}
      .nv-toast.out{transform:none;}}
  `;
  document.head.appendChild(s);
}

function ensureHost() {
  ensureStyle();
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'nv-toast-host';
  // Región viva para lectores de pantalla: los toasts se anuncian sin robar foco.
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Notificaciones');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

const ICONOS = {
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  warn:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};
const TIMEOUT_POR_TIPO = { success: 4000, info: 4500, warn: 6000, error: 7000 };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function quitar(el) {
  if (!el || el.__removing) return;
  el.__removing = true;
  clearTimeout(el.__timer);
  el.classList.add('out'); el.classList.remove('on');
  const fin = () => { el.remove(); };
  el.addEventListener('transitionend', fin, { once: true });
  setTimeout(fin, 400); // salvavidas si transitionend no dispara
}

/** Muestra un toast. Devuelve una función para cerrarlo antes de tiempo. */
function show(opts) {
  if (typeof document === 'undefined') return () => {};
  const o = typeof opts === 'string' ? { msg: opts } : (opts || {});
  const type = ICONOS[o.type] ? o.type : 'info';
  const h = ensureHost();

  const el = document.createElement('div');
  el.className = 'nv-toast nv-toast--' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML =
    '<div class="nv-toast__ic">' + ICONOS[type] + '</div>' +
    '<div class="nv-toast__bd">' +
      (o.title ? '<div class="nv-toast__t">' + esc(o.title) + '</div>' : '') +
      (o.msg ? '<div class="nv-toast__m">' + esc(o.msg) + '</div>' : '') +
      (o.action && o.action.label ? '<div class="nv-toast__act"><button type="button">' + esc(o.action.label) + '</button></div>' : '') +
    '</div>' +
    '<button class="nv-toast__x" type="button" aria-label="Cerrar notificación">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
    '</button>';

  el.querySelector('.nv-toast__x').addEventListener('click', () => quitar(el));
  const actBtn = el.querySelector('.nv-toast__act button');
  if (actBtn) actBtn.addEventListener('click', () => { try { o.action.onClick(); } catch (_) {} quitar(el); });

  h.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));

  const ms = o.timeout != null ? o.timeout : TIMEOUT_POR_TIPO[type];
  if (ms > 0) {
    el.__timer = setTimeout(() => quitar(el), ms);
    // Pausa el autocierre mientras el puntero está encima (buena UX).
    el.addEventListener('mouseenter', () => clearTimeout(el.__timer));
    el.addEventListener('mouseleave', () => { el.__timer = setTimeout(() => quitar(el), 1600); });
  }
  return () => quitar(el);
}

export const NVToast = {
  show,
  success: (title, msg, o) => show({ type: 'success', title, msg, ...(o || {}) }),
  error:   (title, msg, o) => show({ type: 'error', title, msg, ...(o || {}) }),
  warn:    (title, msg, o) => show({ type: 'warn', title, msg, ...(o || {}) }),
  info:    (title, msg, o) => show({ type: 'info', title, msg, ...(o || {}) }),
};

// Evita spamear el mismo error de red repetido (polling que falla en bucle).
let ultimoNetErr = 0;
function onNetError(ev) {
  const d = (ev && ev.detail) || {};
  const ahora = Date.now();
  if (ahora - ultimoNetErr < 4000) return; // colapsa ráfagas
  ultimoNetErr = ahora;
  if (d.status === 401) {
    NVToast.warn('Sesión expirada', 'Vuelve a iniciar sesión para continuar.');
  } else if (d.status === 0 || d.status == null) {
    NVToast.error('Sin conexión', 'No pudimos contactar el servidor. Revisa tu red e inténtalo de nuevo.');
  } else if (d.status >= 500) {
    NVToast.error('Error del servidor', d.message || 'Algo falló de nuestro lado. Reintenta en un momento.');
  } else if (d.status === 429) {
    NVToast.warn('Demasiadas solicitudes', 'Espera unos segundos antes de reintentar.');
  }
}

/** Se llama una vez desde bootstrap. Registra los listeners globales. */
export function instalarToasts() {
  if (typeof window === 'undefined' || window.__NV_TOASTS) return NVToast;
  window.__NV_TOASTS = true;
  window.NVToast = NVToast;
  window.addEventListener('nv:toast', (e) => show((e && e.detail) || {}));
  window.addEventListener('nv:neterror', onNetError);
  return NVToast;
}

export default NVToast;
