/** Roles de NV Streaming. El orden importa solo para mostrarlos en pantalla. */
export const ROLES = ['admin', 'operador', 'ventas', 'revendedor', 'cliente'] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETAS_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  operador: 'Operador / soporte',
  ventas: 'Ventas',
  revendedor: 'Revendedor',
  cliente: 'Cliente',
};

/** Roles del equipo interno (acceden al panel administrativo). */
export const ROLES_EQUIPO = ['admin', 'operador', 'ventas'] as const satisfies readonly Rol[];

/** Roles que deben tener la verificación en dos pasos activada para operar. */
export const ROLES_CON_2FA_OBLIGATORIO: readonly Rol[] = [
  'admin',
  'operador',
  'ventas',
  'revendedor',
];

export function exige2fa(rol: Rol): boolean {
  return ROLES_CON_2FA_OBLIGATORIO.includes(rol);
}

export function esEquipo(rol: Rol): boolean {
  return (ROLES_EQUIPO as readonly Rol[]).includes(rol);
}

/** Ruta de inicio de cada rol en la web. */
export function rutaInicio(rol: Rol): string {
  if (esEquipo(rol)) return '/admin';
  if (rol === 'revendedor') return '/revendedor';
  return '/cuenta';
}
