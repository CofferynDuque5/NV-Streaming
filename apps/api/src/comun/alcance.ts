import type { Prisma } from '@nv/db';
import { limitadoACartera } from '@nv/shared';
import type { ContextoAuth } from './contexto.js';

/** Id que no existe: deja vacía cualquier consulta de un rol sin acceso a clientes. */
const NINGUNO = '00000000-0000-0000-0000-000000000000';

/**
 * Qué clientes puede ver quien hace la petición. Todas las consultas de
 * clientes, suscripciones, facturas, pagos y tickets pasan por aquí, y lo que
 * queda fuera responde 404 (no 403) para no revelar qué existe.
 */
export function alcanceClientes(auth: ContextoAuth): Prisma.ClienteWhereInput {
  const { rol, id } = auth.usuario;
  if (rol === 'cliente') return { usuarioId: id };
  if (limitadoACartera(rol)) return { asignadoAId: id };
  if (rol === 'admin' || rol === 'operador') return {};
  return { id: NINGUNO };
}

export function esEquipoCompleto(auth: ContextoAuth): boolean {
  return auth.usuario.rol === 'admin' || auth.usuario.rol === 'operador';
}
