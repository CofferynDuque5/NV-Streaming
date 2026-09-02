/*
 * nv-runtime.js — a tiny, dependency-free template runtime for NV Platform.
 *
 * The pages in this project were authored in Claude Design against a small
 * component contract:
 *   - a `<x-dc>` template using {{ }} interpolation, <sc-for>, <sc-if>, <helmet>,
 *     inline event attributes (onClick/onChange/…) and style-hover/focus/active,
 *   - a `class Component extends DCLogic` block (state, setState, getters,
 *     lifecycle) whose `renderVals()` returns the flat object the template binds
 *     against (including handler functions).
 *
 * The original design tool rendered this through React. This file re-implements
 * the exact same contract in plain vanilla JS — no framework, no build step — so
 * every page renders pixel-identically while shipping as ordinary HTML/CSS/JS.
 */
(function () {
  "use strict";

  /* ────────────────────────────────────────────────────────────
   * Path resolver — mirrors the design runtime's `resolve()`.
   * Supports dotted paths and [index]/[key] segments.
   * ──────────────────────────────────────────────────────────── */
  function resolve(vals, expr) {
    if (vals == null) return undefined;
    let cur = vals;
    let i = 0;
    const s = String(expr).trim();
    // fast path: bare identifier
    if (/^[A-Za-z_$][\w$]*$/.test(s)) return cur[s];
    while (i < s.length) {
      // skip leading dots / whitespace
      while (i < s.length && (s[i] === "." || s[i] === " ")) i++;
      if (i >= s.length) break;
      if (s[i] === "[") {
        let depth = 1;
        let j = i + 1;
        for (; j < s.length && depth !== 0; j++) {
          if (s[j] === "[") depth++;
          else if (s[j] === "]") depth--;
        }
        j -= 1;
        if (depth !== 0) return undefined;
        let key = s.slice(i + 1, j).trim();
        // string literal or nested expression
        if (
          (key[0] === '"' && key[key.length - 1] === '"') ||
          (key[0] === "'" && key[key.length - 1] === "'")
        ) {
          key = key.slice(1, -1);
        } else if (/^-?\d+$/.test(key)) {
          key = parseInt(key, 10);
        } else {
          key = resolve(vals, key);
        }
        cur = cur == null ? undefined : cur[key];
        i = j + 1;
      } else {
        // read identifier segment
        let j = i;
        while (j < s.length && s[j] !== "." && s[j] !== "[") j++;
        const key = s.slice(i, j).trim();
        cur = cur == null ? undefined : cur[key];
        i = j;
      }
    }
    return cur;
  }

  /* ────────────────────────────────────────────────────────────
   * Attribute / text interpolation.
   * ──────────────────────────────────────────────────────────── */
  const INTERP = /\{\{([\s\S]+?)\}\}/g;

  // Compile an attribute value string into (vals) => resolvedValue.
  // A value that is a *single* {{ expr }} returns the raw resolved value
  // (may be a function, boolean, number…). Mixed values return a string.
  function compileAttr(raw) {
    const whole = /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(raw);
    if (whole) {
      const path = whole[1];
      const f = (vals) => resolve(vals, path);
      f.whole = true;
      return f;
    }
    if (raw.indexOf("{{") === -1) {
      const f = () => raw;
      f.constant = true;
      return f;
    }
    const parts = raw.split(INTERP);
    return (vals) =>
      parts
        .map((p, i) => {
          if (!(i & 1)) return p;
          const v = resolve(vals, p);
          return v == null ? "" : v;
        })
        .join("");
  }

  /* ────────────────────────────────────────────────────────────
   * Pseudo-class stylesheet (style-hover / style-focus / style-active).
   * Each unique (pseudo, css) pair becomes a generated class.
   * ──────────────────────────────────────────────────────────── */
  const pseudoSheet = (function () {
    const el = document.createElement("style");
    el.setAttribute("data-nv-pseudo", "");
    document.head.appendChild(el);
    const sheet = el.sheet;
    const cache = new Map();
    let n = 0;
    return function (pseudo, css) {
      const key = pseudo + "|" + css;
      let cls = cache.get(key);
      if (cls) return cls;
      cls = "nvp-" + pseudo + "-" + n++;
      try {
        sheet.insertRule("." + cls + ":" + pseudo + "{" + css + "}", sheet.cssRules.length);
      } catch (e) {
        /* ignore malformed */
      }
      cache.set(key, cls);
      return cls;
    };
  })();

  const EVENT_ATTRS = {
    onclick: "click",
    onchange: "change",
    oninput: "input",
    onsubmit: "submit",
    onkeydown: "keydown",
    onkeyup: "keyup",
    onkeypress: "keypress",
    onmousedown: "mousedown",
    onmouseup: "mouseup",
    onmouseenter: "mouseenter",
    onmouseleave: "mouseleave",
    onmouseover: "mouseover",
    onmouseout: "mouseout",
    onfocus: "focus",
    onblur: "blur",
    ondoubleclick: "dblclick",
    oncontextmenu: "contextmenu",
    onscroll: "scroll",
  };

  const SKIP_ATTRS = new Set([
    "list", // consumed by sc-for
    "as",
    "value", // (on sc-if) consumed
    "hint-placeholder-count",
    "hint-placeholder-val",
    "hint-size",
    "sc-name",
    "data-dc-tpl",
  ]);

  /* ────────────────────────────────────────────────────────────
   * Compile the template DOM (the parsed <x-dc> subtree) into builder
   * closures. Each builder: (vals) => Node | Node[] | null.
   * ──────────────────────────────────────────────────────────── */
  function compileChildren(node) {
    const out = [];
    node.childNodes.forEach((c) => {
      const b = compileNode(c);
      if (b) out.push(b);
    });
    return out;
  }

  function looksLikeHTML(v) {
    return typeof v === "string" && /<[a-zA-Z/]/.test(v);
  }

  // Seguridad (anti-XSS): el HTML CRUDO (innerHTML) solo se permite para
  // expresiones de CONFIANZA escritas por el desarrollador — iconos/SVG, cuyo
  // último segmento contiene "icon" o "svg" (p.ej. {{ cat.icon }}, platformIcon).
  // Cualquier otro binding ({{ rev.text }}, nombres, descripciones…) se renderiza
  // como TEXTO escapado aunque su valor parezca HTML, cerrando el XSS almacenado.
  // El atacante controla el VALOR de los datos, nunca el NOMBRE del binding en la
  // plantilla, así que este límite de confianza es robusto.
  function rawPermitido(expr) {
    const seg = String(expr || "").trim().split(".").pop() || "";
    return /icon|svg/i.test(seg);
  }

  function compileNode(node) {
    // TEXT
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.nodeValue || "";
      if (txt.indexOf("{{") === -1) {
        if (!txt.trim()) {
          // preserve whitespace that matters for inline layout
          if (!/[ \t\n]/.test(txt)) return null;
          return { kind: "static-text", text: txt };
        }
        return { kind: "static-text", text: txt };
      }
      const parts = txt.split(INTERP);
      const wholeMatch =
        parts.length === 3 && parts[0].trim() === "" && parts[2].trim() === "";
      return { kind: "text", parts, wholeExpr: wholeMatch ? parts[1] : null };
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.localName;

    if (tag === "helmet") {
      return { kind: "helmet", node };
    }
    if (tag === "sc-for") {
      return {
        kind: "for",
        list: compileAttr(node.getAttribute("list") || ""),
        as: node.getAttribute("as") || "item",
        kids: compileChildren(node),
      };
    }
    if (tag === "sc-if") {
      return {
        kind: "if",
        value: compileAttr(node.getAttribute("value") || ""),
        kids: compileChildren(node),
      };
    }

    // Regular element
    const attrs = [];
    const events = [];
    const pseudos = [];
    for (const a of node.attributes) {
      const name = a.name;
      if (SKIP_ATTRS.has(name)) continue;
      if (name.indexOf("style-") === 0) {
        pseudos.push({ pseudo: name.slice(6), get: compileAttr(a.value) });
        continue;
      }
      const ev = EVENT_ATTRS[name];
      if (ev) {
        events.push({ type: ev, get: compileAttr(a.value) });
        continue;
      }
      attrs.push({ name, get: compileAttr(a.value) });
    }
    const kids = compileChildren(node);
    // detect raw-HTML single-child pattern (e.g. <svg>{{ icon }}</svg>)
    const rawChild =
      kids.length === 1 && kids[0].kind === "text" && kids[0].wholeExpr
        ? kids[0].wholeExpr
        : null;

    return {
      kind: "el",
      ns: node.namespaceURI,
      tag,
      attrs,
      events,
      pseudos,
      kids,
      rawChild,
    };
  }

  /* ────────────────────────────────────────────────────────────
   * Render builders into real DOM.
   * ──────────────────────────────────────────────────────────── */
  function appendBuilt(b, vals, out) {
    const r = renderBuilder(b, vals);
    if (r == null) return;
    if (Array.isArray(r)) r.forEach((n) => n != null && out.push(n));
    else out.push(r);
  }

  function renderChildren(kids, vals) {
    const out = [];
    for (const b of kids) appendBuilt(b, vals, out);
    return out;
  }

  function renderBuilder(b, vals) {
    switch (b.kind) {
      case "static-text":
        return document.createTextNode(b.text);
      case "text": {
        let s = "";
        for (let i = 0; i < b.parts.length; i++) {
          if (!(i & 1)) {
            s += b.parts[i];
          } else {
            const v = resolve(vals, b.parts[i]);
            if (v != null && typeof v !== "boolean") s += v;
          }
        }
        return document.createTextNode(s);
      }
      case "helmet":
        return null; // handled separately at mount
      case "for": {
        const list = b.list(vals);
        if (!Array.isArray(list)) return null;
        const out = [];
        list.forEach((item, i) => {
          const sub = Object.create(vals);
          sub[b.as] = item;
          sub.$index = i;
          for (const k of b.kids) appendBuilt(k, sub, out);
        });
        return out;
      }
      case "if": {
        const v = b.value(vals);
        if (!v) return null;
        return renderChildren(b.kids, vals);
      }
      case "el":
        return renderElement(b, vals);
    }
    return null;
  }

  function renderElement(b, vals) {
    const el = b.ns
      ? document.createElementNS(b.ns, b.tag)
      : document.createElement(b.tag);

    let className = null;
    for (const a of b.attrs) {
      let v = a.get(vals);
      const name = a.name;
      if (v === undefined || v === null || v === false) continue;
      if (name === "class") {
        className = String(v);
        continue;
      }
      if (name === "style") {
        el.style.cssText = String(v);
        continue;
      }
      if (v === true) {
        el.setAttribute(name, "");
        continue;
      }
      if (typeof v === "function" || typeof v === "object") continue;
      el.setAttribute(name, String(v));
    }

    // pseudo-classes
    const pseudoClasses = [];
    for (const p of b.pseudos) {
      const css = p.get(vals);
      if (css) pseudoClasses.push(pseudoSheet(p.pseudo, String(css)));
    }
    if (className != null || pseudoClasses.length) {
      const full = [className, ...pseudoClasses].filter(Boolean).join(" ");
      if (full) el.setAttribute("class", full);
    }

    // events
    const bound = [];
    for (const e of b.events) {
      const fn = e.get(vals);
      if (typeof fn === "function") {
        const handler = function (ev) {
          return fn(ev);
        };
        el.addEventListener(e.type, handler);
        bound.push([e.type, handler]);
      }
    }
    el.__nvEvents = bound;
    el.__nvBuilder = b;

    // children (raw-HTML fast path SOLO para iconos/SVG de confianza)
    if (b.rawChild && rawPermitido(b.rawChild)) {
      const v = resolve(vals, b.rawChild);
      if (looksLikeHTML(v)) {
        el.innerHTML = v;
        return el;
      }
    }
    const kids = renderChildren(b.kids, vals);
    for (const n of kids) el.appendChild(n);
    return el;
  }

  /* ────────────────────────────────────────────────────────────
   * Morph reconciler — patches the live DOM toward a freshly built
   * tree without discarding untouched nodes, so continuous CSS
   * animations and input focus survive re-renders.
   * ──────────────────────────────────────────────────────────── */
  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType === Node.TEXT_NODE) return true;
    if (a.nodeType === Node.ELEMENT_NODE)
      return a.localName === b.localName && a.namespaceURI === b.namespaceURI;
    return false;
  }

  function patchNode(oldN, newN) {
    if (oldN.nodeType === Node.TEXT_NODE) {
      if (oldN.nodeValue !== newN.nodeValue) oldN.nodeValue = newN.nodeValue;
      return oldN;
    }
    // element: sync attributes
    const oldAttrs = oldN.attributes;
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const name = oldAttrs[i].name;
      if (!newN.hasAttribute(name)) oldN.removeAttribute(name);
    }
    for (const a of newN.attributes) {
      if (oldN.getAttribute(a.name) !== a.value) oldN.setAttribute(a.name, a.value);
    }
    // inline style (cssText) — attribute sync above covers `style` attr already,
    // but ensure exact match
    if (oldN.getAttribute("style") !== newN.getAttribute("style")) {
      if (newN.hasAttribute("style")) oldN.style.cssText = newN.style.cssText;
    }
    // re-bind events: drop stale listeners, attach fresh ones (new closures)
    if (oldN.__nvEvents) {
      for (const [type, h] of oldN.__nvEvents) oldN.removeEventListener(type, h);
    }
    if (newN.__nvEvents) {
      for (const [type, h] of newN.__nvEvents) oldN.addEventListener(type, h);
    }
    oldN.__nvEvents = newN.__nvEvents || [];

    // if new node was built via raw innerHTML (icono/SVG de confianza), mirror it
    if (newN.__nvBuilder && newN.__nvBuilder.rawChild && rawPermitido(newN.__nvBuilder.rawChild)) {
      if (oldN.innerHTML !== newN.innerHTML) oldN.innerHTML = newN.innerHTML;
      return oldN;
    }
    morphChildren(oldN, newN.childNodes);
    return oldN;
  }

  function morphChildren(parent, newNodes) {
    // snapshot the desired children into a static array (newNodes may be a
    // live NodeList that mutates as we move nodes into `parent`)
    const desired = Array.prototype.slice.call(newNodes);
    for (let i = 0; i < desired.length; i++) {
      const n = desired[i];
      const o = parent.childNodes[i];
      if (!o) {
        parent.appendChild(n);
      } else if (o === n) {
        // already in place
      } else if (sameNode(o, n)) {
        patchNode(o, n);
      } else {
        parent.insertBefore(n, o);
      }
    }
    // remove any surplus old nodes beyond the desired length
    while (parent.childNodes.length > desired.length) {
      parent.removeChild(parent.lastChild);
    }
  }

  /* ────────────────────────────────────────────────────────────
   * DCLogic base class — the contract page scripts extend.
   * ──────────────────────────────────────────────────────────── */
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
      this.__host = null;
    }
    setState(update, cb) {
      if (this.__host) this.__host.setState(update, cb);
    }
    forceUpdate() {
      if (this.__host) this.__host.rerender();
    }
    componentDidMount() {}
    componentDidUpdate() {}
    componentWillUnmount() {}
    renderVals() {
      return {};
    }
  }

  // Minimal React shim in case a script references `React` (createElement/Fragment).
  const ReactShim = {
    createElement: function () {
      return null;
    },
    Fragment: "fragment",
    createContext: function () {
      return {};
    },
  };

  /* ────────────────────────────────────────────────────────────
   * Mount.
   * ──────────────────────────────────────────────────────────── */
  function extractProps(raw) {
    if (!raw) return {};
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return {};
    }
    const props = {};
    for (const k of Object.keys(parsed)) {
      if (k[0] === "$") continue;
      const v = parsed[k];
      if (v && typeof v === "object" && !Array.isArray(v) && "default" in v) {
        props[k] = v.default;
      } else {
        props[k] = v;
      }
    }
    return props;
  }

  function mountHelmet(dcRoot) {
    const helmet = dcRoot.querySelector("helmet");
    if (!helmet) return;
    // move link/style/meta into <head>
    Array.from(helmet.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        document.head.appendChild(n.cloneNode(true));
      }
    });
    helmet.remove();
  }

  function boot() {
    // The template lives inside an inert <template> so the browser never
    // live-parses its {{ }} markup; read the <x-dc> subtree from its content.
    const tpl = document.querySelector("template[data-nv-template]");
    const root = tpl
      ? tpl.content.querySelector("x-dc") || tpl.content
      : document.querySelector("x-dc");
    if (!root) return;
    const scriptEl = document.querySelector("script[data-dc-script]");

    // Helmet → <head> (fonts + global styles), before we compile.
    mountHelmet(root);

    // Compile the template into builders (helmet already removed).
    const builders = compileChildren(root);

    // Create a mount point where the template sits.
    const anchor = tpl || root;
    const mount = document.createElement("div");
    mount.setAttribute("data-nv-root", "");
    anchor.parentNode.insertBefore(mount, anchor);
    if (tpl) tpl.remove();
    else root.remove();

    // Evaluate the logic class.
    const props = scriptEl
      ? extractProps(scriptEl.getAttribute("data-props"))
      : {};
    let Component = null;
    if (scriptEl && scriptEl.textContent.trim()) {
      try {
        const fn = new Function(
          "DCLogic",
          "StreamableLogic",
          "React",
          scriptEl.textContent +
            '\n;return (typeof Component!=="undefined"&&Component)||undefined;'
        );
        Component = fn(DCLogic, DCLogic, ReactShim);
      } catch (e) {
        console.error("[nv-runtime] logic eval error:", e);
      }
    }
    const instance = new (Component || DCLogic)(props);

    const host = {
      setState(update, cb) {
        const patch = typeof update === "function" ? update(instance.state) : update;
        instance.state = Object.assign({}, instance.state, patch);
        host.rerender();
        if (cb) cb();
        try {
          instance.componentDidUpdate(instance.props);
        } catch (e) {
          console.error(e);
        }
      },
      rerender() {
        let vals;
        try {
          vals = Object.assign({}, props, instance.renderVals() || {});
        } catch (e) {
          console.error("[nv-runtime] renderVals() error:", e);
          vals = Object.assign({}, props);
        }
        // NV bridge hook: let the Firebase data layer (js/bootstrap.js) overlay
        // real Firestore data and inject action handlers before the DOM builds.
        // It's optional — without it the page renders from its static seed.
        if (window.NV && typeof window.NV.decorate === "function") {
          try { window.NV.decorate(window.__NV_PAGE, vals, instance); } catch (e) {
            console.error("[nv-bridge] decorate error:", e);
          }
        }
        const built = [];
        for (const b of builders) appendBuilt(b, vals, built);
        morphChildren(mount, built);
      },
    };
    instance.__host = host;

    // Expose the host/instance so the async Firebase layer can trigger a
    // re-render when a Firestore snapshot updates the store.
    window.__NV_INSTANCE = instance;
    window.__NV_RERENDER = function () { try { host.rerender(); } catch (e) {} };
    if (!window.__NV_PAGE) {
      const b = document.body && document.body.getAttribute("data-nv-page");
      window.__NV_PAGE = b || (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
    }
    window.dispatchEvent(new Event("nv:runtime-ready"));

    host.rerender();
    document.documentElement.setAttribute("data-nv-ready", "");
    try {
      instance.componentDidMount();
    } catch (e) {
      console.error("[nv-runtime] componentDidMount error:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
