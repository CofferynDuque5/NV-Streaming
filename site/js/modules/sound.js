/**
 * sound.js — Feedback auditivo (síntesis Web Audio + archivos locales).
 *
 * Estrategia robusta y 100% offline:
 *   1. Si `window.NV_CONFIG.sonido.pistas[nombre]` apunta a un archivo existente
 *      (.mp3/.wav en web/assets/sounds/), lo reproduce.
 *   2. Si no hay archivo o el navegador lo bloquea, SINTETIZA el sonido con la
 *      Web Audio API (osciladores) → siempre suena, sin 404 ni dependencias.
 *
 * Respeta `sonido.habilitado` y `sonido.volumen`. Nunca lanza ni congela la UI
 * (política de autoplay: se desbloquea con el primer gesto del usuario).
 */

const cache = {};
let desbloqueado = false;
let actx = null;

function cfg() { return (typeof window !== "undefined" && window.NV_CONFIG && window.NV_CONFIG.sonido) || {}; }
function habilitado() { const c = cfg(); return c.habilitado === undefined ? true : !!c.habilitado; }
function pistas() { return cfg().pistas || {}; }
function volumen() { const v = cfg().volumen; return typeof v === "number" ? v : 0.35; }

/* ─────────────────  SÍNTESIS (fallback garantizado)  ───────────────── */
function ctx() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { actx = new AC(); } catch (_) { actx = null; }
  return actx;
}
// Envolvente/nota simple. `notas`: [{f, t, d, tipo}]
function tono(notas) {
  const ac = ctx();
  if (!ac) return false;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const vol = Math.min(0.5, volumen());
  const t0 = ac.currentTime;
  for (const n of notas) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.tipo || "sine";
    osc.frequency.value = n.f;
    const ini = t0 + (n.t || 0);
    const fin = ini + (n.d || 0.08);
    g.gain.setValueAtTime(0.0001, ini);
    g.gain.exponentialRampToValueAtTime(vol, ini + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, fin);
    osc.connect(g); g.connect(ac.destination);
    osc.start(ini); osc.stop(fin + 0.02);
  }
  return true;
}
const SINTESIS = {
  click: () => tono([{ f: 420, d: 0.05, tipo: "triangle" }]),
  notify: () => tono([{ f: 660, d: 0.07, tipo: "sine" }, { f: 880, t: 0.06, d: 0.08, tipo: "sine" }]),
  success: () => tono([{ f: 523, d: 0.09 }, { f: 659, t: 0.09, d: 0.09 }, { f: 784, t: 0.18, d: 0.16 }]),
  error: () => tono([{ f: 300, d: 0.12, tipo: "sawtooth" }, { f: 180, t: 0.1, d: 0.16, tipo: "sawtooth" }]),
};

/* ─────────────────  ARCHIVOS (si existen)  ───────────────── */
function precargar() {
  if (typeof Audio === "undefined") return;
  const p = pistas();
  for (const nombre of Object.keys(p)) {
    if (cache[nombre]) continue;
    try { const a = new Audio(p[nombre]); a.preload = "auto"; a.volume = volumen(); cache[nombre] = a; } catch (_) {}
  }
}

/** Reproduce por nombre: intenta archivo; si falla, sintetiza. */
export function reproducir(nombre) {
  if (!habilitado()) return;
  const ruta = pistas()[nombre];
  let usoArchivo = false;
  if (ruta && typeof Audio !== "undefined") {
    try {
      const base = cache[nombre] || new Audio(ruta);
      const a = base.cloneNode ? base.cloneNode(true) : new Audio(ruta);
      a.volume = volumen();
      const pr = a.play();
      usoArchivo = true;
      if (pr && typeof pr.catch === "function") pr.catch(() => { (SINTESIS[nombre] || SINTESIS.click)(); }); // archivo bloqueado/ausente → sintetiza
    } catch (_) { usoArchivo = false; }
  }
  if (!usoArchivo) (SINTESIS[nombre] || SINTESIS.click)();
}

/** Vincula el desbloqueo de audio al primer gesto del usuario. */
export function instalarSonido() {
  if (typeof document === "undefined") return;
  precargar();
  const desbloquear = () => {
    if (desbloqueado) return;
    desbloqueado = true;
    try { const ac = ctx(); if (ac && ac.state === "suspended") ac.resume().catch(() => {}); } catch (_) {}
    try { const p = pistas().click; if (p && typeof Audio !== "undefined") { const a = new Audio(p); a.volume = 0; a.play().then(() => a.pause()).catch(() => {}); } } catch (_) {}
    document.removeEventListener("pointerdown", desbloquear);
    document.removeEventListener("keydown", desbloquear);
  };
  document.addEventListener("pointerdown", desbloquear, { once: false });
  document.addEventListener("keydown", desbloquear, { once: false });
  window.NVSound = { reproducir };
}

export default { instalarSonido, reproducir };
