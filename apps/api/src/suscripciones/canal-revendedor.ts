import type { ContextoAuth } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';

/**
 * Una suscripción que activó un revendedor con su saldo (`revendedorId`) la
 * gestiona él: su cliente la ve y usa su acceso, pero no la renueva, no la
 * cancela ni paga sus facturas. Lo que el cliente compra directo en la tienda
 * no tiene revendedor y lo gestiona él, como cualquier cliente. El equipo no
 * tiene esta restricción.
 */
export function exigirGestionDelCliente(
  auth: ContextoAuth,
  s: { revendedorId: string | null } | null,
): void {
  if (auth.usuario.rol === 'cliente' && s?.revendedorId) {
    throw new ErrorApp(
      403,
      'GESTIONA_REVENDEDOR',
      'Este servicio lo gestiona tu revendedor: pídele a él la renovación, la cancelación o el pago.',
    );
  }
}
