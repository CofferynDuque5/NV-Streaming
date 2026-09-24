import { describe, expect, it } from 'vitest';
import { exige2fa, PERMISOS, permisosDe, ROLES, rutaInicio, tienePermiso } from '../src/index.js';

describe('matriz de permisos', () => {
  it('el administrador tiene todos los permisos salvo el autoservicio del cliente', () => {
    expect([...permisosDe('admin')].sort()).toEqual(
      PERMISOS.filter((p) => p !== 'autoservicio.usar').sort(),
    );
  });

  it('solo el cliente usa el autoservicio', () => {
    for (const rol of ROLES) expect(tienePermiso(rol, 'autoservicio.usar')).toBe(rol === 'cliente');
  });

  it('solo administración gestiona catálogo, finanzas y anulaciones', () => {
    for (const p of ['catalogo.gestionar', 'finanzas.configurar', 'facturas.anular'] as const) {
      expect(ROLES.filter((r) => tienePermiso(r, p))).toEqual(['admin']);
    }
  });

  it('conciliar pagos es de administración y operación, no de ventas', () => {
    expect(ROLES.filter((r) => tienePermiso(r, 'pagos.gestionar'))).toEqual(['admin', 'operador']);
  });

  it('ventas ve los tickets pero no los gestiona, y puede crear cupones', () => {
    expect(tienePermiso('ventas', 'tickets.ver')).toBe(true);
    expect(tienePermiso('ventas', 'tickets.gestionar')).toBe(false);
    expect(tienePermiso('ventas', 'cupones.gestionar')).toBe(true);
    expect(tienePermiso('operador', 'cupones.gestionar')).toBe(false);
  });

  it('el revendedor y el cliente no ven datos de otros clientes', () => {
    for (const rol of ['revendedor', 'cliente'] as const) {
      for (const p of ['clientes.ver', 'facturas.ver', 'suscripciones.ver', 'tickets.ver'] as const)
        expect(tienePermiso(rol, p)).toBe(false);
    }
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
