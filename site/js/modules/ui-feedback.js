/**
 * ui-feedback.js — Microinteracciones: spinner de carga y modales de
 * confirmación/éxito/error. Autocontenido (inyecta su CSS una vez), en la
 * estética NV. Diseñado para NO congelarse: usa transiciones CSS, limpia el DOM
 * al cerrar y expone una API simple en `window.NVUI`.
 */

let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'nv-ui-style';
  s.textContent = `
    .nv-ov{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;
      background:rgba(4,4,12,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .2s ease;padding:20px;}
    .nv-ov.on{opacity:1;}
    .nv-spin{width:52px;height:52px;border-radius:50%;border:3px solid rgba(0,207,255,.18);
      border-top-color:#00CFFF;animation:nvSpin .8s linear infinite;}
    @keyframes nvSpin{to{transform:rotate(360deg);}}
    .nv-spin-txt{position:absolute;margin-top:92px;color:#cfe3ff;font:500 13.5px 'DM Sans',sans-serif;}
    .nv-modal{max-width:400px;width:100%;background:#0b0b18;border:1px solid rgba(80,100,200,.22);
      border-radius:16px;padding:26px 24px;text-align:center;color:#EEF2FF;font-family:'DM Sans',sans-serif;
      transform:translateY(16px) scale(.98);opacity:0;transition:transform .24s cubic-bezier(.32,.72,0,1),opacity .24s;
      box-shadow:0 24px 70px rgba(0,0,40,.6);}
    .nv-ov.on .nv-modal{transform:translateY(0) scale(1);opacity:1;}
    .nv-modal .nv-ic{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      margin:0 auto 14px;font-size:28px;}
    .nv-ic.ok{background:rgba(0,212,160,.12);border:1px solid rgba(0,212,160,.4);color:#00D4A0;}
    .nv-ic.err{background:rgba(255,68,102,.12);border:1px solid rgba(255,68,102,.4);color:#FF4466;}
    .nv-ic.ask{background:rgba(0,207,255,.1);border:1px solid rgba(0,207,255,.36);color:#00CFFF;}
    .nv-modal h3{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-bottom:6px;}
    .nv-modal p{font-size:13.5px;color:rgba(200,215,255,.7);line-height:1.5;margin-bottom:18px;}
    .nv-modal .nv-html{margin-bottom:16px;}
    .nv-modal.wide{max-width:440px;}
    .nv-acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
    .nv-btn{padding:10px 18px;border-radius:10px;font:600 13.5px 'DM Sans',sans-serif;cursor:pointer;border:1px solid transparent;transition:transform .15s,box-shadow .15s;}
    .nv-btn:hover{transform:translateY(-1px);}
    .nv-btn.primary{background:linear-gradient(135deg,#0A3AAE,#1A8FFF);color:#fff;box-shadow:0 4px 16px rgba(0,100,255,.3);}
    .nv-btn.ghost{background:transparent;border-color:rgba(80,100,200,.3);color:rgba(200,215,255,.75);}
    @media (prefers-reduced-motion: reduce){.nv-ov,.nv-modal,.nv-spin{transition:none;animation-duration:.01ms;}}
  `;
  document.head.appendChild(s);
}

function overlay() {
  ensureStyle();
  const ov = document.createElement('div');
  ov.className = 'nv-ov';
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  return ov;
}
function cerrar(ov) {
  if (!ov || !ov.parentNode) return;
  ov.classList.remove('on');
  const kill = () => ov.parentNode && ov.parentNode.removeChild(ov);
  ov.addEventListener('transitionend', kill, { once: true });
  setTimeout(kill, 400); // salvavidas: nunca queda colgado
}

let spinnerOv = null;
/** Muestra u oculta un spinner de pantalla completa. */
export function spinner(mostrar, texto) {
  if (mostrar) {
    if (spinnerOv) return;
    spinnerOv = overlay();
    spinnerOv.innerHTML = `<div class="nv-spin"></div>${texto ? `<div class="nv-spin-txt">${String(texto)}</div>` : ''}`;
  } else {
    cerrar(spinnerOv); spinnerOv = null;
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Modal genérico. `tipo`: ok | err | ask. Devuelve Promise<boolean>. */
export function modal(opts) {
  ensureStyle();
  const o = opts || {};
  return new Promise((resolve) => {
    const ov = overlay();
    const iconos = { ok: '✓', err: '!', ask: '?' };
    const tipo = o.tipo || 'ok';
    const acciones = o.acciones || (tipo === 'ask'
      ? [{ label: 'Cancelar', ghost: true, val: false }, { label: o.confirmLabel || 'Confirmar', val: true }]
      : [{ label: o.closeLabel || 'Entendido', val: true }]);
    // Campo de texto opcional (para pedir un dato, p.ej. el WhatsApp en checkout).
    const inp = o.input
      ? `<input class="nv-inp" type="${esc(o.input.type || 'text')}" inputmode="${esc(o.input.inputmode || 'text')}"
           placeholder="${esc(o.input.placeholder || '')}" value="${esc(o.input.valor || '')}"
           style="width:100%;box-sizing:border-box;margin-bottom:14px;padding:11px 13px;background:rgba(255,255,255,.04);
                  border:1px solid rgba(0,207,255,.3);border-radius:9px;color:#EEF2FF;font-size:14px;font-family:'DM Sans',sans-serif;
                  caret-color:#00CFFF;outline:none;" />`
      : '';
    // Cuerpo: `html` se inserta tal cual (contenido confiable de la propia app);
    // `mensaje` se escapa. Si hay `html` no se pinta el <p> del mensaje.
    const cuerpo = o.html ? `<div class="nv-html">${o.html}</div>` : `<p>${esc(o.mensaje || '')}</p>`;
    ov.innerHTML = `<div class="nv-modal" role="dialog" aria-modal="true">
      <div class="nv-ic ${tipo}">${o.icono || iconos[tipo] || 'i'}</div>
      <h3>${esc(o.titulo || '')}</h3>
      ${cuerpo}
      ${inp}
      <div class="nv-acts">${acciones.map((a, i) => `<button class="nv-btn ${a.ghost ? 'ghost' : 'primary'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    const campo = ov.querySelector('.nv-inp');
    if (campo) setTimeout(() => campo.focus(), 60);
    // Con input: una acción "confirmar" (val truthy) resuelve con el TEXTO; cancelar → null.
    const resolver = (val) => (o.input ? (val ? String(campo && campo.value || '').trim() : null) : val);
    const finish = (val) => { cerrar(ov); resolve(resolver(val)); };
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (b) return finish(acciones[Number(b.getAttribute('data-i'))].val);
      if (ev.target === ov && o.cerrarAlFondo !== false) finish(o.input ? false : false); // backdrop → cancelar
    });
    if (campo) campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } });
  });
}

export const NVUI = {
  spinner,
  modal,
  confirmar: (titulo, mensaje, confirmLabel) => modal({ tipo: 'ask', titulo, mensaje, confirmLabel }),
  exito: (titulo, mensaje) => modal({ tipo: 'ok', titulo, mensaje }),
  info: (titulo, mensaje) => modal({ tipo: 'ask', titulo, mensaje, icono: 'i' }),
  error: (titulo, mensaje) => modal({ tipo: 'err', titulo, mensaje }),
  /** Pide un dato de texto. Devuelve el string (trim) o null si se cancela. */
  pedir: (titulo, mensaje, input, confirmLabel) => modal({ tipo: 'ask', titulo, mensaje, input: input || {}, confirmLabel: confirmLabel || 'Continuar' }),
};

export function instalarUI() {
  ensureStyle();
  if (typeof window !== 'undefined') window.NVUI = NVUI;
}

export default { instalarUI, spinner, modal, NVUI };
