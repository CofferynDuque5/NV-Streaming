/**
 * pricing.engine.js — Motor de Precios Dinámicos (POO · SOLID).
 *
 * Responsabilidad ÚNICA (SRP): resolver el precio final en USD de un servicio o
 * combo aplicando la REGLA DE NEGOCIO por rol de la base de datos:
 *
 *   · rol "revendedor" (o "admin") → tarifa preferencial   (`precio_rev`)
 *   · cualquier otro rol / anónimo → precio estándar        (`precio`, con oferta)
 *
 * El rol se lee SIEMPRE de la sesión real (colección `usuarios.rol`), nunca del
 * cliente ni de un parámetro suelto. La resolución se inyecta por dependencia
 * (`sesionProvider` / `ofertasProvider`) para poder probar el motor de forma
 * aislada (DIP). Un único punto de verdad para todo cálculo de precio: catálogo,
 * carrito, combos y checkout consumen esta clase.
 */

import NVCore from "../core.js";

const { Store, Utils } = NVCore;

/** Roles que reciben tarifa preferencial de revendedor. */
const ROLES_PREFERENCIALES = Object.freeze(["revendedor", "admin", "distribuidor"]);

export class MotorPrecios {
  /**
   * @param {object} deps
   * @param {() => object|null} deps.sesionProvider  Devuelve el usuario autenticado (o null).
   * @param {() => Array}        deps.ofertasProvider Devuelve las ofertas activas.
   */
  constructor({ sesionProvider, ofertasProvider } = {}) {
    this._sesion = sesionProvider || (() => (Store.get("sesion") || {}).usuario || null);
    this._ofertas = ofertasProvider || (() => (Store.get("ofertas") || []).filter((o) => o.activo));
  }

  /** Rol efectivo del usuario en sesión (minúsculas, "invitado" si anónimo). */
  rolActual() {
    const u = this._sesion();
    return u && u.rol ? String(u.rol).toLowerCase() : "invitado";
  }

  /** ¿El usuario en sesión tiene derecho a tarifa de revendedor? */
  esPreferencial() {
    return ROLES_PREFERENCIALES.includes(this.rolActual());
  }

  /**
   * Tipo de precio aplicable ("rev" | "detal"). Si se fuerza un tipo explícito
   * (p. ej. una simulación en el panel), se respeta; si no, se deriva del rol.
   */
  tipoAplicable(forzar) {
    if (forzar === "rev" || forzar === "detal") return forzar;
    return this.esPreferencial() ? "rev" : "detal";
  }

  /** Oferta pública activa para un servicio (o null). */
  ofertaDe(servicio) {
    if (!servicio) return null;
    const id = servicio.id_servicio || servicio.id;
    return this._ofertas().find((o) => o.id_servicio === id) || null;
  }

  /**
   * Precio final en USD de un SERVICIO según la regla de negocio.
   * - Revendedor: `precio_rev` (tarifa contratada; no compite con ofertas públicas).
   * - Estándar: `precio_oferta` si hay oferta activa; si no, `precio`.
   * @param {object} servicio  Servicio normalizado.
   * @param {"rev"|"detal"} [forzar]  Fuerza un tipo (opcional).
   */
  precioServicioUSD(servicio, forzar) {
    if (!servicio) return 0;
    const tipo = this.tipoAplicable(forzar);
    if (tipo === "rev") {
      const rev = Utils.num(servicio.precio_rev);
      return rev > 0 ? rev : Utils.num(servicio.precio);
    }
    const oferta = this.ofertaDe(servicio);
    if (oferta) return Utils.num(oferta.precio_oferta);
    return Utils.num(servicio.precio);
  }

  /** Precio final en USD de un COMBO según la regla de negocio. */
  precioComboUSD(combo, forzar) {
    if (!combo) return 0;
    const tipo = this.tipoAplicable(forzar);
    if (tipo === "rev") {
      const rev = Utils.num(combo.precio_revendedor_combo);
      return rev > 0 ? rev : Utils.num(combo.precio_publico_combo);
    }
    return Utils.num(combo.precio_publico_combo);
  }

  /**
   * Desglose para la UI (precio vigente + precio tachado + ahorro + etiqueta).
   * Útil para pintar "precio revendedor" o "-33%" de forma coherente.
   */
  desgloseServicio(servicio, forzar) {
    const tipo = this.tipoAplicable(forzar);
    const base = Utils.num(servicio && servicio.precio);
    const final = this.precioServicioUSD(servicio, forzar);
    const oferta = tipo === "detal" ? this.ofertaDe(servicio) : null;
    const precioAnterior = tipo === "rev"
      ? (base > final ? base : 0)
      : (oferta ? Utils.num(oferta.precio_normal) || base : 0);
    return {
      tipo,
      esPreferencial: tipo === "rev",
      final,
      anterior: precioAnterior > final ? precioAnterior : 0,
      ahorro: precioAnterior > final ? precioAnterior - final : 0,
      etiqueta: tipo === "rev" ? "PRECIO REVENDEDOR" : (oferta ? "-" + Utils.num(oferta.descuento_pct) + "%" : ""),
    };
  }
}

/** Instancia única compartida (consumida por catálogo, carrito y bridge). */
export const motorPrecios = new MotorPrecios();

export default MotorPrecios;
