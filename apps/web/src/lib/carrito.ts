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
    },
    quitar(id: string) {
      guardar(leer().filter((x) => x !== id));
    },
    vaciar() {
      guardar([]);
    },
  };
}
