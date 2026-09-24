import { esEquipo, type Permiso, type Rol } from '@nv/shared';

export type NombreIcono =
  | 'inicio'
  | 'equipo'
  | 'auditoria'
  | 'clientes'
  | 'planes'
  | 'suscripciones'
  | 'cobros'
  | 'soporte'
  | 'revendedores'
  | 'editor'
  | 'asistente'
  | 'saldo'
  | 'catalogo'
  | 'compras'
  | 'servicios'
  | 'cupones'
  | 'monedas'
  | 'ajustes';

export interface ElementoNavegacion {
  etiqueta: string;
  href?: string;
  icono: NombreIcono;
  permiso?: Permiso;
  /** Fase del plan en la que llega el módulo. */
  fase?: number;
}

const EQUIPO: ElementoNavegacion[] = [
  { etiqueta: 'Resumen', href: '/admin', icono: 'inicio' },
  { etiqueta: 'Clientes', href: '/admin/clientes', icono: 'clientes', permiso: 'clientes.ver' },
  {
    etiqueta: 'Suscripciones',
    href: '/admin/suscripciones',
    icono: 'suscripciones',
    permiso: 'suscripciones.ver',
  },
  { etiqueta: 'Cobros', href: '/admin/cobros', icono: 'cobros', permiso: 'facturas.ver' },
  { etiqueta: 'Soporte', href: '/admin/soporte', icono: 'soporte', permiso: 'tickets.ver' },
  { etiqueta: 'Catálogo', href: '/admin/catalogo', icono: 'planes', permiso: 'catalogo.ver' },
  { etiqueta: 'Cupones', href: '/admin/cupones', icono: 'cupones', permiso: 'cupones.ver' },
  {
    etiqueta: 'Monedas y cobro',
    href: '/admin/finanzas',
    icono: 'monedas',
    permiso: 'finanzas.configurar',
  },
  {
    etiqueta: 'Equipo y usuarios',
    href: '/admin/equipo',
    icono: 'equipo',
    permiso: 'usuarios.ver',
  },
  { etiqueta: 'Auditoría', href: '/admin/auditoria', icono: 'auditoria', permiso: 'auditoria.ver' },
  { etiqueta: 'Revendedores', icono: 'revendedores', fase: 2 },
  { etiqueta: 'Editor visual', icono: 'editor', fase: 2 },
  { etiqueta: 'Asistente IA', icono: 'asistente', fase: 5 },
];

const REVENDEDOR: ElementoNavegacion[] = [
  { etiqueta: 'Resumen', href: '/revendedor', icono: 'inicio' },
  { etiqueta: 'Saldo y recargas', icono: 'saldo', fase: 2 },
  { etiqueta: 'Catálogo mayorista', icono: 'catalogo', fase: 2 },
  { etiqueta: 'Mis compras', icono: 'compras', fase: 2 },
];

const CLIENTE: ElementoNavegacion[] = [
  { etiqueta: 'Mis servicios', href: '/cuenta', icono: 'servicios' },
  { etiqueta: 'Contratar', href: '/cuenta/planes', icono: 'planes' },
  { etiqueta: 'Facturas y pagos', href: '/cuenta/facturas', icono: 'cobros' },
  { etiqueta: 'Soporte', href: '/cuenta/soporte', icono: 'soporte' },
];

const AJUSTES: ElementoNavegacion = {
  etiqueta: 'Perfil y seguridad',
  href: '/ajustes',
  icono: 'ajustes',
};

export function navegacionDe(rol: Rol, permisos: readonly Permiso[]): ElementoNavegacion[] {
  const base = esEquipo(rol) ? EQUIPO : rol === 'revendedor' ? REVENDEDOR : CLIENTE;
  return [...base.filter((e) => !e.permiso || permisos.includes(e.permiso)), AJUSTES];
}

export function tituloPanel(rol: Rol): string {
  if (esEquipo(rol)) return 'Administración';
  if (rol === 'revendedor') return 'Panel de revendedor';
  return 'Mi cuenta';
}
