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
  | 'carrito'
  | 'catalogo'
  | 'compras'
  | 'servicios'
  | 'cupones'
  | 'monedas'
  | 'automatizaciones'
  | 'pasarelas'
  | 'metodos'
  | 'entregas'
  | 'inventario'
  | 'accesos'
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
  { etiqueta: 'Entregas', href: '/admin/entregas', icono: 'entregas', permiso: 'entregas.ver' },
  {
    etiqueta: 'Inventario de códigos',
    href: '/admin/inventario',
    icono: 'inventario',
    permiso: 'inventario.gestionar',
  },
  {
    etiqueta: 'Asistente',
    href: '/admin/asistente',
    icono: 'asistente',
    permiso: 'asistente.usar',
  },
  { etiqueta: 'Catálogo', href: '/admin/catalogo', icono: 'planes', permiso: 'catalogo.ver' },
  { etiqueta: 'Cupones', href: '/admin/cupones', icono: 'cupones', permiso: 'cupones.ver' },
  {
    etiqueta: 'Monedas y cobro',
    href: '/admin/finanzas',
    icono: 'monedas',
    permiso: 'finanzas.configurar',
  },
  {
    etiqueta: 'Pagos en línea',
    href: '/admin/pagos-en-linea',
    icono: 'pasarelas',
    permiso: 'pasarelas.configurar',
  },
  {
    etiqueta: 'Equipo y usuarios',
    href: '/admin/equipo',
    icono: 'equipo',
    permiso: 'usuarios.ver',
  },
  {
    etiqueta: 'Automatizaciones',
    href: '/admin/automatizaciones',
    icono: 'automatizaciones',
    permiso: 'automatizaciones.ver',
  },
  { etiqueta: 'Auditoría', href: '/admin/auditoria', icono: 'auditoria', permiso: 'auditoria.ver' },
  {
    etiqueta: 'Revendedores',
    href: '/admin/revendedores',
    icono: 'revendedores',
    permiso: 'revendedores.ver',
  },
  { etiqueta: 'Editor visual', href: '/admin/sitio', icono: 'editor', permiso: 'sitio.editar' },
];

const REVENDEDOR: ElementoNavegacion[] = [
  { etiqueta: 'Resumen', href: '/revendedor', icono: 'inicio' },
  { etiqueta: 'Saldo y recargas', href: '/revendedor/saldo', icono: 'saldo' },
  { etiqueta: 'Catálogo mayorista', href: '/revendedor/catalogo', icono: 'catalogo' },
  { etiqueta: 'Mis clientes', href: '/revendedor/clientes', icono: 'clientes' },
  { etiqueta: 'Mis compras', href: '/revendedor/compras', icono: 'compras' },
  { etiqueta: 'Accesos de clientes', href: '/revendedor/accesos', icono: 'accesos' },
];

const CLIENTE: ElementoNavegacion[] = [
  { etiqueta: 'Mis servicios', href: '/cuenta', icono: 'servicios' },
  {
    etiqueta: 'Mis accesos',
    href: '/cuenta/accesos',
    icono: 'accesos',
    permiso: 'autoservicio.usar',
  },
  { etiqueta: 'Contratar', href: '/cuenta/planes', icono: 'planes' },
  { etiqueta: 'Carrito y pedidos', href: '/cuenta/carrito', icono: 'carrito' },
  { etiqueta: 'Mi billetera', href: '/cuenta/billetera', icono: 'saldo' },
  { etiqueta: 'Facturas y pagos', href: '/cuenta/facturas', icono: 'cobros' },
  { etiqueta: 'Mis métodos de pago', href: '/cuenta/metodos-pago', icono: 'metodos' },
  { etiqueta: 'Soporte', href: '/cuenta/soporte', icono: 'soporte' },
  {
    etiqueta: 'Ser revendedor',
    href: '/cuenta/revendedor',
    icono: 'revendedores',
    permiso: 'revendedor.solicitar',
  },
];

const AJUSTES: ElementoNavegacion = {
  etiqueta: 'Perfil y seguridad',
  href: '/ajustes',
  icono: 'ajustes',
};

/** Qué contador de pendientes lleva un elemento del menú de la cuenta. */
export type ContadorCuenta = 'accesos' | 'facturas' | 'soporte';
export type IconoCuenta =
  | 'servicios'
  | 'accesos'
  | 'facturas'
  | 'billetera'
  | 'carrito'
  | 'soporte'
  | 'metodos'
  | 'perfil'
  | 'revendedor';

export interface ElementoCuenta {
  etiqueta: string;
  href: string;
  icono: IconoCuenta;
  contador?: ContadorCuenta;
  /** Solo para quien no tiene revendedor: el cliente de un revendedor no lo usa. */
  soloDirecto?: boolean;
  permiso?: Permiso;
}

/** Menú de la cuenta del cliente: lo de todos los días arriba y la cuenta abajo. */
const CUENTA: ElementoCuenta[][] = [
  [
    { etiqueta: 'Mis servicios', href: '/cuenta', icono: 'servicios' },
    { etiqueta: 'Mis accesos', href: '/cuenta/accesos', icono: 'accesos', contador: 'accesos' },
    {
      etiqueta: 'Facturas y pagos',
      href: '/cuenta/facturas',
      icono: 'facturas',
      contador: 'facturas',
    },
    { etiqueta: 'Billetera', href: '/cuenta/billetera', icono: 'billetera' },
    { etiqueta: 'Carrito y pedidos', href: '/cuenta/carrito', icono: 'carrito' },
    { etiqueta: 'Soporte', href: '/cuenta/soporte', icono: 'soporte', contador: 'soporte' },
  ],
  [
    {
      etiqueta: 'Métodos guardados',
      href: '/cuenta/metodos-pago',
      icono: 'metodos',
      soloDirecto: true,
    },
    { etiqueta: 'Perfil y seguridad', href: '/ajustes', icono: 'perfil' },
    {
      etiqueta: 'Ser revendedor',
      href: '/cuenta/revendedor',
      icono: 'revendedor',
      soloDirecto: true,
      permiso: 'revendedor.solicitar',
    },
  ],
];

/**
 * Grupos del menú de la cuenta del cliente. El cliente de un revendedor tiene
 * billetera y carrito como todos, pero no métodos guardados ni «Ser revendedor».
 */
export function navegacionCuenta(
  permisos: readonly Permiso[],
  directo: boolean,
): ElementoCuenta[][] {
  return CUENTA.map((grupo) =>
    grupo.filter(
      (e) => (!e.soloDirecto || directo) && (!e.permiso || permisos.includes(e.permiso)),
    ),
  );
}

export function navegacionDe(rol: Rol, permisos: readonly Permiso[]): ElementoNavegacion[] {
  const base = esEquipo(rol) ? EQUIPO : rol === 'revendedor' ? REVENDEDOR : CLIENTE;
  return [...base.filter((e) => !e.permiso || permisos.includes(e.permiso)), AJUSTES];
}

export function tituloPanel(rol: Rol): string {
  if (esEquipo(rol)) return 'Administración';
  if (rol === 'revendedor') return 'Panel de revendedor';
  return 'Mi cuenta';
}
