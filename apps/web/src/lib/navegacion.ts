import type { Permiso } from '@nv/shared';

/** Qué contador de pendientes lleva un elemento del menú de la cuenta. */
export type ContadorCuenta =
  'accesos' | 'facturas' | 'soporte' | 'renovaciones' | 'saldo' | ModuloEquipo;
export type IconoCuenta =
  | ModuloEquipo
  | 'centro'
  | 'servicios'
  | 'accesos'
  | 'facturas'
  | 'billetera'
  | 'carrito'
  | 'soporte'
  | 'metodos'
  | 'perfil'
  | 'revendedor'
  | 'vender'
  | 'renovaciones'
  | 'clientes';

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
 * Menú del panel del revendedor (mismo diseño que la cuenta del cliente): el
 * resumen, lo de vender, el dinero, las entregas y, aparte, el perfil.
 */
export const MENU_REVENDEDOR: ElementoCuenta[][] = [
  [{ etiqueta: 'Resumen', href: '/revendedor', icono: 'servicios' }],
  [
    { etiqueta: 'Nueva venta', href: '/revendedor/catalogo', icono: 'vender' },
    {
      etiqueta: 'Renovaciones',
      href: '/revendedor/renovaciones',
      icono: 'renovaciones',
      contador: 'renovaciones',
    },
    { etiqueta: 'Clientes', href: '/revendedor/clientes', icono: 'clientes' },
  ],
  [
    { etiqueta: 'Ventas', href: '/revendedor/ventas', icono: 'carrito' },
    {
      etiqueta: 'Saldo y recargas',
      href: '/revendedor/saldo',
      icono: 'billetera',
      contador: 'saldo',
    },
  ],
  [
    {
      etiqueta: 'Accesos de clientes',
      href: '/revendedor/accesos',
      icono: 'accesos',
      contador: 'accesos',
    },
  ],
  [{ etiqueta: 'Perfil y seguridad', href: '/ajustes', icono: 'perfil' }],
];
/** Rótulo de cada grupo del menú del revendedor (en escritorio); sin rótulo, una línea. */
export const TITULOS_MENU_REVENDEDOR = [null, 'Vender', 'Dinero', 'Entregas', null];

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

/* ───────────────────────── equipo ───────────────────────── */

export type ModuloEquipo =
  | 'cobros'
  | 'soporte'
  | 'entregas'
  | 'revendedores'
  | 'asistente'
  | 'clientes'
  | 'suscripciones'
  | 'cupones'
  | 'catalogo'
  | 'inventario'
  | 'finanzas'
  | 'pasarelas'
  | 'sitio'
  | 'equipo'
  | 'automatizaciones'
  | 'auditoria';

export type GrupoEquipo = 'atender' | 'ventas' | 'tienda' | 'sistema';

export const GRUPOS_EQUIPO: [GrupoEquipo, string][] = [
  ['atender', 'Atender'],
  ['ventas', 'Clientes y ventas'],
  ['tienda', 'Tienda'],
  ['sistema', 'Sistema'],
];

export interface ModuloInfo {
  clave: ModuloEquipo;
  grupo: GrupoEquipo;
  nombre: string;
  descripcion: string;
  /** Color de su orbe. */
  color: string;
  href: string;
  /** Permiso con el que se abre (la API lo vuelve a comprobar). */
  permiso: Permiso;
}

/** Módulos del equipo, en el orden del menú y de la cuadrícula del centro. */
export const MODULOS_EQUIPO: ModuloInfo[] = [
  {
    clave: 'cobros',
    grupo: 'atender',
    nombre: 'Cobros',
    descripcion: 'Pagos por conciliar, recargas de billetera y facturas',
    color: '#4f8dff',
    href: '/admin/cobros',
    permiso: 'facturas.ver',
  },
  {
    clave: 'soporte',
    grupo: 'atender',
    nombre: 'Soporte',
    descripcion: 'Solicitudes de clientes con su plazo de respuesta',
    color: '#22d3ee',
    href: '/admin/soporte',
    permiso: 'tickets.ver',
  },
  {
    clave: 'entregas',
    grupo: 'atender',
    nombre: 'Entregas',
    descripcion: 'Activaciones en curso, pendientes y fallidas',
    color: '#22c55e',
    href: '/admin/entregas',
    permiso: 'entregas.ver',
  },
  {
    clave: 'revendedores',
    grupo: 'atender',
    nombre: 'Revendedores',
    descripcion: 'Solicitudes, niveles, precios mayoristas y recargas',
    color: '#a855f7',
    href: '/admin/revendedores',
    permiso: 'revendedores.ver',
  },
  {
    clave: 'asistente',
    grupo: 'atender',
    nombre: 'Asistente',
    descripcion: 'Pregúntale al sistema y confirma lo que propone',
    color: '#d946ef',
    href: '/admin/asistente',
    permiso: 'asistente.usar',
  },
  {
    clave: 'clientes',
    grupo: 'ventas',
    nombre: 'Clientes',
    descripcion: 'Fichas, notas, billetera y acceso al panel',
    color: '#4f8dff',
    href: '/admin/clientes',
    permiso: 'clientes.ver',
  },
  {
    clave: 'suscripciones',
    grupo: 'ventas',
    nombre: 'Suscripciones',
    descripcion: 'Renovar, pausar, reanudar o cancelar',
    color: '#22d3ee',
    href: '/admin/suscripciones',
    permiso: 'suscripciones.ver',
  },
  {
    clave: 'cupones',
    grupo: 'ventas',
    nombre: 'Cupones',
    descripcion: 'Descuentos con código para la tienda',
    color: '#f59e0b',
    href: '/admin/cupones',
    permiso: 'cupones.ver',
  },
  {
    clave: 'catalogo',
    grupo: 'tienda',
    nombre: 'Catálogo',
    descripcion: 'Proveedores, servicios, planes y precios',
    color: '#4f8dff',
    href: '/admin/catalogo',
    permiso: 'catalogo.ver',
  },
  {
    clave: 'inventario',
    grupo: 'tienda',
    nombre: 'Inventario de códigos',
    descripcion: 'Códigos de activación disponibles por plan',
    color: '#22c55e',
    href: '/admin/inventario',
    permiso: 'inventario.gestionar',
  },
  {
    clave: 'finanzas',
    grupo: 'tienda',
    nombre: 'Monedas y cobro',
    descripcion: 'Tasas del día y métodos de pago',
    color: '#f59e0b',
    href: '/admin/finanzas',
    permiso: 'finanzas.configurar',
  },
  {
    clave: 'pasarelas',
    grupo: 'tienda',
    nombre: 'Pagos en línea',
    descripcion: 'PayPal, Mercado Pago y sus avisos',
    color: '#22d3ee',
    href: '/admin/pagos-en-linea',
    permiso: 'pasarelas.configurar',
  },
  {
    clave: 'sitio',
    grupo: 'tienda',
    nombre: 'Sitio y páginas',
    descripcion: 'Portada, páginas y datos de contacto',
    color: '#d946ef',
    href: '/admin/sitio',
    permiso: 'sitio.editar',
  },
  {
    clave: 'equipo',
    grupo: 'sistema',
    nombre: 'Equipo y usuarios',
    descripcion: 'Cuentas, roles y verificación en dos pasos',
    color: '#a855f7',
    href: '/admin/equipo',
    permiso: 'usuarios.ver',
  },
  {
    clave: 'automatizaciones',
    grupo: 'sistema',
    nombre: 'Automatizaciones',
    descripcion: 'Recordatorios, avisos y tareas programadas',
    color: '#4f8dff',
    href: '/admin/automatizaciones',
    permiso: 'automatizaciones.ver',
  },
  {
    clave: 'auditoria',
    grupo: 'sistema',
    nombre: 'Auditoría',
    descripcion: 'Quién cambió qué y cuándo',
    color: '#94a3b8',
    href: '/admin/auditoria',
    permiso: 'auditoria.ver',
  },
];

/** Los módulos que el rol puede abrir. */
export function modulosDe(permisos: readonly Permiso[]): ModuloInfo[] {
  return MODULOS_EQUIPO.filter((m) => permisos.includes(m.permiso));
}

/**
 * Menú del equipo: el centro, los módulos de su rol por grupo (con su rótulo)
 * y, aparte, el perfil. Los grupos sin módulos para el rol no se muestran.
 */
export function menuEquipo(permisos: readonly Permiso[]): {
  grupos: ElementoCuenta[][];
  titulos: (string | null)[];
} {
  const mios = modulosDe(permisos);
  const grupos = GRUPOS_EQUIPO.map(([g, t]) => ({
    titulo: t,
    elementos: mios
      .filter((m) => m.grupo === g)
      .map((m): ElementoCuenta => ({
        etiqueta: m.nombre,
        href: m.href,
        icono: m.clave,
        contador: m.clave,
      })),
  })).filter((g) => g.elementos.length > 0);
  return {
    grupos: [
      [{ etiqueta: 'Centro de módulos', href: '/admin', icono: 'centro' }],
      ...grupos.map((g) => g.elementos),
      [{ etiqueta: 'Perfil y seguridad', href: '/ajustes', icono: 'perfil' }],
    ],
    titulos: [null, ...grupos.map((g) => g.titulo), null],
  };
}
