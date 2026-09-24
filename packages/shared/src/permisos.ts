import type { Rol } from './roles.js';

/**
 * Catálogo de permisos. La API los comprueba en cada ruta; la web solo los usa
 * para decidir qué mostrar. Cada fase añade los permisos de sus módulos.
 */
export const PERMISOS = [
  'panel.ver',
  'usuarios.ver',
  'usuarios.gestionar',
  'auditoria.ver',
  'cuenta.gestionar',
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const DESCRIPCION_PERMISO: Record<Permiso, string> = {
  'panel.ver': 'Ver el panel de su rol',
  'usuarios.ver': 'Ver usuarios y equipo',
  'usuarios.gestionar':
    'Invitar, cambiar rol, suspender y restablecer la verificación en dos pasos',
  'auditoria.ver': 'Ver el registro de auditoría',
  'cuenta.gestionar': 'Gestionar su propia cuenta y seguridad',
};

const MATRIZ: Record<Rol, readonly Permiso[]> = {
  admin: ['panel.ver', 'usuarios.ver', 'usuarios.gestionar', 'auditoria.ver', 'cuenta.gestionar'],
  operador: ['panel.ver', 'usuarios.ver', 'cuenta.gestionar'],
  ventas: ['panel.ver', 'cuenta.gestionar'],
  revendedor: ['panel.ver', 'cuenta.gestionar'],
  cliente: ['panel.ver', 'cuenta.gestionar'],
};

export function permisosDe(rol: Rol): readonly Permiso[] {
  return MATRIZ[rol];
}

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
