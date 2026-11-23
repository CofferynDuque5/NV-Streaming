import type { Prisma } from '@nv/db';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';

/** Qué datos de acceso cambiaron (nunca sus valores). */
export type CambioAcceso = 'correo' | 'clave' | 'pin' | 'correo_miembro' | 'clave_miembro';

/**
 * Encola el aviso a los clientes de que cambiaron sus datos de acceso, en la
 * misma transacción del cambio: si el cambio no se guarda, no sale el aviso.
 * Sin perfil, es un cambio de la cuenta (lo reciben todos los que la usan).
 */
export async function encolarAvisoDatos(
  tx: Prisma.TransactionClient,
  cuentaId: string,
  perfilId: string | null,
  cambios: CambioAcceso[],
): Promise<void> {
  if (!cambios.length) return;
  await encolarTrabajo(tx, {
    tipo: TRABAJO.avisoDatosAcceso,
    carga: { cuentaId, ...(perfilId ? { perfilId } : {}), cambios },
  });
}
