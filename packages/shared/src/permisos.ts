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
  // Fase 1
  'metricas.ver',
  'clientes.ver',
  'clientes.gestionar',
  'clientes.notas',
  'catalogo.ver',
  'catalogo.gestionar',
  'finanzas.configurar',
  'suscripciones.ver',
  'suscripciones.crear',
  'suscripciones.gestionar',
  'facturas.ver',
  'facturas.anular',
  'pagos.gestionar',
  'cupones.ver',
  'cupones.gestionar',
  'tickets.ver',
  'tickets.gestionar',
  'autoservicio.usar',
  // Fase 2
  'revendedores.ver',
  'revendedores.gestionar',
  'revendedor.solicitar',
  'reventa.usar',
  'sitio.editar',
  'sitio.publicar',
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const DESCRIPCION_PERMISO: Record<Permiso, string> = {
  'panel.ver': 'Ver el panel de su rol',
  'usuarios.ver': 'Ver usuarios y equipo',
  'usuarios.gestionar':
    'Invitar, cambiar rol, suspender y restablecer la verificación en dos pasos',
  'auditoria.ver': 'Ver el registro de auditoría',
  'cuenta.gestionar': 'Gestionar su propia cuenta y seguridad',
  'metricas.ver': 'Ver métricas (ventas: solo las de su cartera)',
  'clientes.ver': 'Ver clientes (ventas: solo los asignados)',
  'clientes.gestionar': 'Crear, editar y archivar clientes (ventas: solo los asignados)',
  'clientes.notas': 'Leer y escribir notas internas de clientes',
  'catalogo.ver': 'Ver el catálogo completo, incluidos los planes ocultos',
  'catalogo.gestionar': 'Crear y editar proveedores, servicios, planes y precios',
  'finanzas.configurar': 'Registrar tasas de cambio y configurar los métodos de cobro',
  'suscripciones.ver': 'Ver suscripciones (ventas: solo de su cartera)',
  'suscripciones.crear': 'Crear y renovar suscripciones',
  'suscripciones.gestionar': 'Pausar, reanudar y cancelar suscripciones',
  'facturas.ver': 'Ver facturas (ventas: solo de su cartera)',
  'facturas.anular': 'Anular facturas',
  'pagos.gestionar': 'Registrar pagos y conciliar comprobantes',
  'cupones.ver': 'Ver cupones',
  'cupones.gestionar': 'Crear y desactivar cupones (ventas: con límite de descuento)',
  'tickets.ver': 'Ver tickets de soporte',
  'tickets.gestionar': 'Responder, asignar y cerrar tickets',
  'autoservicio.usar': 'Contratar, pagar y pedir soporte desde su panel',
  'revendedores.ver': 'Ver revendedores, su saldo, recargas y compras',
  'revendedores.gestionar':
    'Aprobar o suspender revendedores, asignar nivel, fijar precios mayoristas, ajustar saldo y reembolsar compras',
  'revendedor.solicitar': 'Solicitar ser revendedor',
  'reventa.usar': 'Recargar saldo, comprar activaciones y gestionar su cartera de clientes',
  'sitio.editar': 'Editar borradores de las páginas del sitio',
  'sitio.publicar': 'Publicar páginas, volver a versiones anteriores y cambiar el tema del sitio',
};

const SOLO_CLIENTES: readonly Permiso[] = ['autoservicio.usar', 'revendedor.solicitar', 'reventa.usar'];

const MATRIZ: Record<Rol, readonly Permiso[]> = {
  admin: PERMISOS.filter((p) => !SOLO_CLIENTES.includes(p)),
  operador: [
    'panel.ver',
    'usuarios.ver',
    'cuenta.gestionar',
    'metricas.ver',
    'clientes.ver',
    'clientes.gestionar',
    'clientes.notas',
    'catalogo.ver',
    'suscripciones.ver',
    'suscripciones.crear',
    'suscripciones.gestionar',
    'facturas.ver',
    'pagos.gestionar',
    'tickets.ver',
    'tickets.gestionar',
    'revendedores.ver',
    'sitio.editar',
  ],
  ventas: [
    'panel.ver',
    'cuenta.gestionar',
    'metricas.ver',
    'clientes.ver',
    'clientes.gestionar',
    'clientes.notas',
    'catalogo.ver',
    'suscripciones.ver',
    'suscripciones.crear',
    'facturas.ver',
    'cupones.ver',
    'cupones.gestionar',
    'tickets.ver',
  ],
  revendedor: ['panel.ver', 'cuenta.gestionar', 'reventa.usar'],
  cliente: ['panel.ver', 'cuenta.gestionar', 'autoservicio.usar', 'revendedor.solicitar'],
};

/** Descuento máximo (en %) que ventas puede dar con un cupón. Solo porcentaje. */
export const DESCUENTO_MAXIMO_VENTAS = 15;

/** Ventas solo ve y gestiona su cartera (clientes asignados a su usuario). */
export function limitadoACartera(rol: Rol): boolean {
  return rol === 'ventas';
}

export function permisosDe(rol: Rol): readonly Permiso[] {
  return MATRIZ[rol];
}

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
