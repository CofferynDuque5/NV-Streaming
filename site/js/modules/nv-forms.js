/**
 * nv-forms.js — Validación de formularios en TIEMPO REAL del lado del cliente.
 *
 * Progresivo y declarativo: no toca el submit existente ni las vinculaciones de
 * nv-runtime; se activa marcando los inputs con `data-nv-rules`. Da feedback
 * visual inmediato (clase .nv-input--invalid del sistema de diseño), mensaje
 * accesible (aria-invalid + aria-describedby) y puede deshabilitar el botón de
 * envío hasta que todo sea válido.
 *
 * Uso en el markup:
 *   <input data-nv-rules="required|email" ... />
 *   <input data-nv-rules="required|min:8" ... />
 *   <input data-nv-rules="match:password" data-nv-label="La confirmación" ... />
 *   <button data-nv-submit-for="miFormId">Entrar</button>   (opcional)
 *
 * Reglas soportadas: required · email · min:N · max:N · match:<name> · tel · numeric
 */

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_TEL = /^[+\d][\d\s()-]{6,}$/;

/** Diccionario de validadores puros: (valor, arg, form) → true | mensaje. */
const REGLAS = {
  required: (v) => (String(v).trim().length > 0) || "Este campo es obligatorio.",
  email:    (v) => (!v || RE_EMAIL.test(v)) || "Escribe un correo válido.",
  tel:      (v) => (!v || RE_TEL.test(v)) || "Escribe un teléfono válido.",
  numeric:  (v) => (!v || /^\d+([.,]\d+)?$/.test(v)) || "Solo números.",
  min:      (v, n) => (!v || String(v).length >= +n) || ("Mínimo " + n + " caracteres."),
  max:      (v, n) => (String(v).length <= +n) || ("Máximo " + n + " caracteres."),
  match:    (v, otro, form) => {
    const ref = form && form.querySelector('[name="' + otro + '"]');
    return (!ref || v === ref.value) || "Los valores no coinciden.";
  },
};

function parseReglas(str) {
  return String(str || "").split("|").map((s) => s.trim()).filter(Boolean).map((token) => {
    const [nombre, arg] = token.split(":");
    return { nombre, arg };
  });
}

/** Valida UN campo. Devuelve null si es válido, o el mensaje de error. */
function validarCampo(input, form) {
  const reglas = parseReglas(input.getAttribute("data-nv-rules"));
  const valor = input.value;
  for (const { nombre, arg } of reglas) {
    const fn = REGLAS[nombre];
    if (!fn) continue;
    const r = fn(valor, arg, form);
    if (r !== true) return r;
  }
  return null;
}

function idMensaje(input, i) {
  if (!input.id) input.id = "nvf-" + i + "-" + Math.random().toString(36).slice(2, 7);
  return input.id + "-err";
}

function pintarEstado(input, mensaje, msgEl) {
  const invalido = mensaje != null;
  input.classList.toggle("nv-input--invalid", invalido);
  input.setAttribute("aria-invalid", invalido ? "true" : "false");
  if (msgEl) {
    msgEl.textContent = mensaje || "";
    msgEl.style.display = invalido ? "block" : "none";
  }
}

function asegurarMsgEl(input, idx) {
  const id = idMensaje(input, idx);
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "nv-input-error";
    el.setAttribute("role", "alert");
    el.style.cssText = "display:none;color:var(--nv-danger,#FF4D6D);font-size:12px;margin-top:5px;font-family:var(--nv-font-body,'DM Sans',sans-serif);";
    input.insertAdjacentElement("afterend", el);
  }
  input.setAttribute("aria-describedby", id);
  return el;
}

/**
 * Conecta un formulario. `form` = elemento <form> o contenedor con inputs
 * [data-nv-rules]. Opciones: { submitBtn } botón a deshabilitar hasta validez.
 * Devuelve { validarTodo, destruir }.
 */
export function conectarFormulario(form, opciones) {
  if (!form) return { validarTodo: () => false, destruir: () => {} };
  const opts = opciones || {};
  const campos = Array.from(form.querySelectorAll("[data-nv-rules]"));
  const submitBtn = opts.submitBtn || form.querySelector("[data-nv-submit]");
  const limpiezas = [];

  campos.forEach((input, idx) => {
    const msgEl = asegurarMsgEl(input, idx);
    let tocado = false;

    const revisar = (forzar) => {
      const msg = validarCampo(input, form);
      // No molestamos hasta que el usuario "tocó" el campo (mejor UX),
      // salvo en una validación forzada (submit).
      if (tocado || forzar) pintarEstado(input, msg, msgEl);
      sincronizarBoton();
      return msg == null;
    };

    const onInput = () => { if (tocado) revisar(false); else sincronizarBoton(); };
    const onBlur = () => { tocado = true; revisar(false); };

    input.addEventListener("input", onInput);
    input.addEventListener("blur", onBlur);
    limpiezas.push(() => { input.removeEventListener("input", onInput); input.removeEventListener("blur", onBlur); });
    input.__nvRevisar = revisar;
  });

  function formularioValido() {
    return campos.every((input) => validarCampo(input, form) == null);
  }
  function sincronizarBoton() {
    if (!submitBtn) return;
    const ok = formularioValido();
    submitBtn.disabled = !ok;
    submitBtn.classList.toggle("nv-btn--disabled", !ok);
    submitBtn.setAttribute("aria-disabled", ok ? "false" : "true");
  }

  /** Fuerza la validación de todo (para el submit). Devuelve true si todo ok. */
  function validarTodo() {
    let ok = true;
    campos.forEach((input) => { if (input.__nvRevisar && !input.__nvRevisar(true)) ok = false; });
    if (!ok) {
      const primero = campos.find((i) => validarCampo(i, form) != null);
      if (primero) primero.focus();
    }
    return ok;
  }

  sincronizarBoton();
  form.__nvForm = { validarTodo, formularioValido };
  return { validarTodo, formularioValido, destruir: () => limpiezas.forEach((f) => f()) };
}

/** Escanea el documento y conecta todo [data-nv-form] no conectado aún. */
export function instalarForms() {
  if (typeof document === "undefined") return;
  const conectarTodos = () => {
    document.querySelectorAll("[data-nv-form]").forEach((form) => {
      if (form.__nvForm) return;
      const sel = form.getAttribute("data-nv-submit-btn");
      conectarFormulario(form, { submitBtn: sel ? form.querySelector(sel) : null });
    });
  };
  conectarTodos();
  // nv-runtime pinta el cuerpo tras el arranque y repinta por morph al cambiar
  // el estado. Reconectamos cuando el runtime está listo y, de forma
  // debounced, cuando el árbol cambia (nodos de formulario reemplazados).
  window.addEventListener("nv:runtime-ready", conectarTodos);
  let t = null;
  const obs = new MutationObserver(() => {
    if (t) return;
    t = setTimeout(() => { t = null; conectarTodos(); }, 120);
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  window.__NV_FORMS = { conectarFormulario, conectarTodos };
}

export default { conectarFormulario, instalarForms };
