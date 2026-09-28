'use client';

import { REGLAS_COBRO } from '@nv/shared';
import { useSyncExternalStore } from 'react';

/**
 * Carrito en el navegador: solo los ids de los planes elegidos. Los precios
 * nunca se guardan aquí; siempre se cotizan en la API al pagar.
 */
const CLAVE = 'nv-carrito';
const EVENTO = 'nv-carrito';
const VACIO: string[] = [];
let cache: { crudo: string | null; planes: string[] } = { crudo: null, planes: VACIO };

function leer(): string[] {
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(CLAVE);
  } catch {
    return VACIO;
  }
  if (crudo === cache.crudo) return cache.planes;
  let planes: string[] = VACIO;
  try {
    const v: unknown = crudo ? JSON.parse(crudo) : [];
    if (Array.isArray(v)) {
      planes = [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(
        0,
        REGLAS_COBRO.articulosPorPedido,
      );
    }
  } catch {
    planes = VACIO;
  }
  cache = { crudo, planes };
  return planes;
}

function guardar(planes: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(planes));
  } catch {
    // Sin almacenamiento (modo privado estricto): el carrito vive solo en esta vista.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', aviso);
  };
}

export const MAX_CARRITO = REGLAS_COBRO.articulosPorPedido;

/* Último plan agregado (para marcarlo como «Recién agregado» en el carrito lateral). */
const EVENTO_RECIENTE = 'nv-carrito-reciente';
let reciente: string | null = null;

function suscribirReciente(aviso: () => void) {
  window.addEventListener(EVENTO_RECIENTE, aviso);
  return () => window.removeEventListener(EVENTO_RECIENTE, aviso);
}

function marcarReciente(id: string | null) {
  reciente = id;
  window.dispatchEvent(new Event(EVENTO_RECIENTE));
}

export function useRecienAgregado(): string | null {
  return useSyncExternalStore(
    suscribirReciente,
    () => reciente,
    () => null,
  );
}

/** Evento que abre el carrito lateral desde cualquier parte de la tienda. */
export const EVENTO_ABRIR_CARRITO = 'nv-abrir-carrito';

export function abrirCarrito() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_CARRITO));
}

export function useCarrito() {
  const planes = useSyncExternalStore(suscribir, leer, () => VACIO);
  return {
    planes,
    lleno: planes.length >= MAX_CARRITO,
    tiene: (id: string) => planes.includes(id),
    agregar(id: string) {
      const actuales = leer();
      if (actuales.includes(id) || actuales.length >= MAX_CARRITO) return;
      guardar([...actuales, id]);
      marcarReciente(id);
    },
    /** Vuelve a poner un plan en su posición (deshacer). */
    insertar(id: string, indice: number) {
      const actuales = leer();
      if (actuales.includes(id) || actuales.length >= MAX_CARRITO) return;
      guardar([...actuales.slice(0, indice), id, ...actuales.slice(indice)]);
    },
    /** Cambia un plan por otro del mismo servicio sin moverlo de lugar. */
    cambiar(viejo: string, nuevo: string): boolean {
      const actuales = leer();
      if (actuales.includes(nuevo)) return false;
      guardar(actuales.map((x) => (x === viejo ? nuevo : x)));
      if (reciente === viejo) marcarReciente(nuevo);
      return true;
    },
    quitar(id: string) {
      guardar(leer().filter((x) => x !== id));
      if (reciente === id) marcarReciente(null);
    },
    vaciar() {
      guardar([]);
    },
  };
}
