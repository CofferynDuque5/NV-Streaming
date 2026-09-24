import { describe, expect, it } from 'vitest';
import { exige2fa, PERMISOS, permisosDe, ROLES, rutaInicio, tienePermiso } from '../src/index.js';

describe('matriz de permisos', () => {
  it('el administrador tiene todos los permisos', () => {
    expect([...permisosDe('admin')].sort()).toEqual([...PERMISOS].sort());
  });

  it('solo administración gestiona usuarios y ve la auditoría', () => {
    for (const rol of ROLES) {
      expect(tienePermiso(rol, 'usuarios.gestionar')).toBe(rol === 'admin');
      expect(tienePermiso(rol, 'auditoria.ver')).toBe(rol === 'admin');
    }
  });

  it('todos pueden gestionar su propia cuenta', () => {
    for (const rol of ROLES) expect(tienePermiso(rol, 'cuenta.gestionar')).toBe(true);
  });

  it('exige 2FA a todos menos a los clientes', () => {
    expect(ROLES.filter(exige2fa)).toEqual(['admin', 'operador', 'ventas', 'revendedor']);
  });

  it('cada rol tiene su panel de inicio', () => {
    expect(rutaInicio('admin')).toBe('/admin');
    expect(rutaInicio('ventas')).toBe('/admin');
    expect(rutaInicio('revendedor')).toBe('/revendedor');
    expect(rutaInicio('cliente')).toBe('/cuenta');
  });
});
