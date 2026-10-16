import type { CatalogoMayorista, ResumenRevendedor, RevendedorDetalle } from '@nv/shared';
import { cache } from 'react';
import { leerApi } from './api-servidor';

/**
 * Resumen del revendedor (saldo, nivel, límite, pendientes). El marco del
 * panel y cada página lo leen en la misma petición: se pide una sola vez.
 * `estado` 404: la cuenta tiene el rol pero no su ficha de revendedor.
 */
export const leerResumenRevendedor = cache(() => leerApi<ResumenRevendedor>('/revendedor/resumen'));

/** Planes y precios del nivel del revendedor. */
export const leerCatalogoMayorista = cache(async (): Promise<CatalogoMayorista | null> => {
  const { datos } = await leerApi<CatalogoMayorista>('/revendedor/catalogo');
  return datos;
});

/**
 * Por qué el revendedor no puede comprar, renovar ni recargar ahora (cuenta
 * suspendida o no activa), o null si puede. La API lo vuelve a comprobar.
 */
export function bloqueoCuenta(r: Pick<RevendedorDetalle, 'estado'>): string | null {
  if (r.estado === 'suspendido') {
    return 'Tu cuenta está suspendida: puedes ver todo, pero no vender, renovar ni recargar.';
  }
  if (r.estado !== 'aprobado') return 'Tu cuenta de revendedor no está activa.';
  return null;
}

/** Por qué no puede vender ni renovar: lo de la cuenta y, además, no tener nivel. */
export function bloqueoVenta(r: Pick<RevendedorDetalle, 'estado' | 'nivel'>): string | null {
  return (
    bloqueoCuenta(r) ??
    (r.nivel ? null : 'Aún no tienes nivel asignado: el equipo te lo asigna para ver tus precios.')
  );
}
