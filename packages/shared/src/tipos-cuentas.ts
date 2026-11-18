import type { EstadoCuentaServicio, EstadoPerfil, ModoCuenta } from './esquemas/cuentas.js';
import type { EstadoSuscripcion } from './esquemas/suscripciones.js';
import type { TipoPlataforma } from './plataformas.js';
import type { Pagina } from './tipos.js';
import type { Referencia } from './tipos-negocio.js';

/** Cuenta de un servicio sin secretos: el correo va como pista («ma•••@gmail.com»). */
export interface CuentaServicioResumen {
  id: string;
  servicio: Referencia;
  pista: string;
  modo: ModoCuenta;
  estado: EstadoCuentaServicio;
  plan: string | null;
  pais: string | null;
  /** Lo que cobra el proveedor en cada ciclo. */
  costoUsd: string;
  cicloMeses: number;
  facturaEn: string | null;
  /** Cuándo queda libre (cuentas sin anotar). */
  liberacionEn: string | null;
  metodoPago: string | null;
  proveedor: string | null;
  /** Notas de la cuenta (sin secretos). */
  notas: string | null;
  perfiles: {
    total: number;
    libres: number;
    asignados: number;
    bloqueados: number;
    /** Libres guardados para reponer caídas. */
    respaldos: number;
  };
  creadoEn: string;
}

export interface AsignacionPerfil {
  suscripcionId: string;
  estado: EstadoSuscripcion;
  venceEn: string | null;
  cliente: Referencia;
  plan: Referencia;
  /** La suscripción ya terminó: conviene liberar el perfil. */
  terminada: boolean;
}

export interface PerfilCuentaPublico {
  id: string;
  numero: number;
  nombre: string;
  estado: EstadoPerfil;
  tienePin: boolean;
  /** Plan familiar: el cupo tiene correo propio del miembro. */
  tieneMiembro: boolean;
  nota: string | null;
  asignacion: AsignacionPerfil | null;
}

export interface CuentaServicioDetalle extends CuentaServicioResumen {
  notas: string | null;
  creadoPor: Referencia | null;
  listaPerfiles: PerfilCuentaPublico[];
}

/** Solo con `cuentas.revelar`, y queda en la auditoría. */
export interface CredencialesCuenta {
  usuario: string;
  clave: string;
  perfiles: {
    numero: number;
    nombre: string;
    pin: string | null;
    /** Plan familiar: correo y clave propios del miembro del cupo. */
    usuarioMiembro: string | null;
    claveMiembro: string | null;
  }[];
}

/** Mensaje con los datos de la cuenta para cada cliente que la usa (se envía a mano). */
export interface AvisoCuenta {
  perfilId: string;
  numero: number;
  perfil: string;
  cliente: Referencia;
  estado: EstadoSuscripcion;
  texto: string;
  whatsapp: string | null;
  correo: string | null;
  /** Usuario de Telegram (sin @): el texto se copia y se abre el chat. */
  telegram: string | null;
}

export interface AvisosCuenta {
  servicio: string;
  pista: string;
  avisos: AvisoCuenta[];
}

/** Lugar libre donde se puede mover a un cliente. */
export interface DestinoMover {
  cuentaId: string;
  pista: string;
  plan: string | null;
  facturaEn: string | null;
  modo: ModoCuenta;
  perfiles: { id: string; numero: number; nombre: string; respaldo: boolean }[];
}

/** Suscripción del mismo servicio que puede recibir un perfil. */
export interface SuscripcionAsignable {
  id: string;
  estado: EstadoSuscripcion;
  venceEn: string | null;
  cliente: Referencia;
  plan: Referencia;
}

export type PaginaCuentas = Pagina<CuentaServicioResumen>;

/** Pago hecho al proveedor de una cuenta. */
export interface PagoCuentaPublico {
  id: string;
  montoUsd: string;
  pagadoEl: string;
  facturaCubierta: string | null;
  siguienteCobro: string;
  metodoPago: string | null;
  nota: string | null;
  registradoPor: Referencia;
  creadoEn: string;
  anulacion: { en: string; por: Referencia | null; motivo: string } | null;
  /** Último pago vigente y la cuenta sigue con su fecha: anularlo devuelve el cobro anterior. */
  revierteCobro: boolean;
}

/** Cuenta con un cobro del proveedor atrasado o cercano. */
export interface CuentaPorPagar {
  cuenta: { id: string; pista: string; servicio: Referencia; proveedor: string | null };
  costoUsd: string;
  facturaEn: string;
  /** Negativo: días de atraso. */
  dias: number;
  metodoPago: string | null;
}

export interface PorPagar {
  atrasadas: CuentaPorPagar[];
  proximas: CuentaPorPagar[];
  totalAtrasadoUsd: string;
  totalProximoUsd: string;
}

/** Un pago a un proveedor registrado en el día. */
export interface PagoProveedorDia {
  cuenta: { id: string; pista: string; servicio: Referencia };
  montoUsd: string;
}

/**
 * Cuentas y ganancia de un día, en USD. «Ganancia de lo vendido» descuenta el
 * costo de cada plan vendido (el que tiene escrito en el catálogo); «Queda»
 * resta además lo que se pagó a proveedores ese día y lo que falta pagar.
 */
export interface GananciaDia {
  dia: string;
  ventasClientesUsd: string;
  ventasRevendedoresUsd: string;
  reembolsosUsd: string;
  /** Suma del costo de los planes vendidos. */
  costoVendidoUsd: string;
  /** Planes vendidos sin costo escrito en el catálogo (no se pueden descontar). */
  vendidosSinCosto: number;
  gananciaVentasUsd: string;
  pagadoProveedoresUsd: string;
  pagosProveedor: PagoProveedorDia[];
  /** Cobros del proveedor que vencen ese día o antes y siguen sin pagar. */
  porPagar: CuentaPorPagar[];
  porPagarUsd: string;
  /** Ventas − reembolsos − pagado a proveedores − por pagar. */
  quedaUsd: string;
}

/**
 * Balance del período en USD. Ventas: facturas con pago confirmado (como en
 * Métricas) y compras de revendedores; las recargas de saldo no cuentan hasta
 * que se gastan. Costos: pagos al proveedor de las cuentas.
 */
export interface BalancePeriodo {
  desde: string;
  hasta: string;
  ventasClientesUsd: string;
  pagosClientes: number;
  ventasRevendedoresUsd: string;
  comprasRevendedores: number;
  reembolsosUsd: string;
  costosProveedorUsd: string;
  pagosProveedor: number;
  netoUsd: string;
  /** Costos por servicio, de mayor a menor. */
  costosPorServicio: { servicio: Referencia; montoUsd: string; pagos: number }[];
  /** Hoy: lo que los clientes deben (facturas emitidas sin pagar). */
  porCobrar: { facturas: number; vencidas: number; totalUsd: string };
  porPagar: PorPagar;
  /** Lo que cuestan al mes las cuentas activas (costo ÷ ciclo). */
  costoMensualCuentasUsd: string;
  /** Ingreso mensual recurrente de las suscripciones activas. */
  ingresoMensualRecurrenteUsd: string;
}

/** Perfil de una cuenta compartida asignado a una suscripción del cliente («Mis accesos»). */
export interface PerfilDelCliente {
  suscripcionId: string;
  servicio: Referencia;
  plan: Referencia;
  estado: EstadoSuscripcion;
  venceEn: string | null;
  perfil: { numero: number; nombre: string; tienePin: boolean };
  /** Por perfiles, plan familiar o correo con código (según el servicio). */
  tipo: TipoPlataforma;
  /** «perfiles» o la cuenta entera. */
  modo: ModoCuenta;
  /** La cuenta está activa: se pueden ver los datos. Si está caída, el equipo la está revisando. */
  disponible: boolean;
  /** El servicio tiene asuntos de códigos y hay un buzón activo: puede pedir su código. */
  pideCodigos: boolean;
}

/** Datos para entrar al perfil. Solo los ve su dueño mientras la suscripción está vigente. */
export interface PerfilRevelado {
  usuario: string;
  /** Vacía si el miembro de un plan familiar no dejó su clave guardada. */
  clave: string;
  perfil: string;
  pin: string | null;
  /** Por perfiles, plan familiar o correo con código (según el servicio). */
  tipo: TipoPlataforma;
  /** Plan familiar: entra con su propio correo (miembro del plan), no con el de la cuenta. */
  miembro: boolean;
}

/** Mensaje que arma el equipo para enviar a mano. Nunca se envía solo. */
export interface MensajePerfil {
  texto: string;
  /** Enlace para abrir WhatsApp con el texto, si el cliente dio su WhatsApp y aceptó mensajes. */
  whatsapp: string | null;
  /** Enlace «mailto:» si el cliente tiene correo. */
  correo: string | null;
  /** Usuario de Telegram (sin @), si lo dio. */
  telegram: string | null;
}

// ── Verificar e importar la lista del proveedor ──────────────────────────────

/**
 * nueva: no está guardada y trae clave. sin_clave: no está y no trae clave
 * (no se puede importar). existe: ya está en este servicio. otro_servicio:
 * ese correo ya está guardado en otro servicio.
 */
export type EstadoFilaRevisada = 'nueva' | 'sin_clave' | 'existe' | 'otro_servicio';

export interface CuentaEncontrada {
  id: string;
  pista: string;
  servicio: Referencia;
  estado: EstadoCuentaServicio;
  facturaEn: string | null;
  proveedor: string | null;
}

export interface FilaRevisada {
  /** Posición en las filas enviadas. */
  indice: number;
  estado: EstadoFilaRevisada;
  cuenta: CuentaEncontrada | null;
  /** El archivo trae otro próximo cobro. */
  fechaDistinta: boolean;
  /** El archivo trae un cobro posterior al guardado (el proveedor la renovó). */
  fechaPosterior: boolean;
  /** La clave del archivo no es la guardada. Nunca se devuelve ninguna de las dos. */
  claveDistinta: boolean;
}

export interface RevisionImportacion {
  filas: FilaRevisada[];
  /** Cuentas del servicio (y del proveedor, si se indicó) que no vienen en el archivo. */
  noEstan: CuentaEncontrada[];
  conteo: {
    nuevas: number;
    sinClave: number;
    existen: number;
    otroServicio: number;
    fechaDistinta: number;
    claveDistinta: number;
    noEstan: number;
  };
}

export interface ResultadoImportacion {
  creadas: number;
  actualizadas: number;
}

// ── Inventario (todas las cuentas y sus perfiles, como en el Gestor) ─────────

export interface PerfilInventario {
  id: string;
  numero: number;
  nombre: string;
  estado: EstadoPerfil;
  tienePin: boolean;
  nota: string | null;
  /** Suscripción que lo usa, con su cliente y vencimiento. */
  cliente: Referencia | null;
  suscripcionId: string | null;
  estadoSuscripcion: EstadoSuscripcion | null;
  venceEn: string | null;
}

export interface CuentaInventario {
  id: string;
  pista: string;
  modo: ModoCuenta;
  estado: EstadoCuentaServicio;
  plan: string | null;
  pais: string | null;
  facturaEn: string | null;
  costoUsd: string;
  proveedor: string | null;
  perfiles: PerfilInventario[];
}

export interface ServicioInventario {
  servicio: Referencia & { logoUrl: string | null };
  cuentas: CuentaInventario[];
  conteo: {
    cuentas: number;
    caidas: number;
    perfiles: number;
    libres: number;
    ocupados: number;
    bloqueados: number;
    respaldos: number;
    /** Perfiles ocupados que vencen en los próximos 3 días. */
    porVencer: number;
    /** Perfiles ocupados con la suscripción vencida o cancelada (conviene liberarlos). */
    vencidos: number;
  };
}

export interface Inventario {
  servicios: ServicioInventario[];
  /** Fecha de hoy en Venezuela (AAAA-MM-DD), para calcular días. */
  hoy: string;
}

/** Perfil ocupado en una cuenta caída: el cliente espera que le den otro. */
export interface PerfilPorReponer {
  perfilId: string;
  cuentaId: string;
  /** «ma•••@gmail.com» de la cuenta caída. */
  cuentaPista: string;
  perfil: { numero: number; nombre: string };
  servicio: { id: string; nombre: string };
  suscripcion: {
    id: string;
    cliente: { id: string; nombre: string };
    estado: string;
    venceEn: string | null;
  };
  /** Cuándo se marcó caída la cuenta (null si fue antes de guardarse la fecha). */
  caidaEn: string | null;
  /** Días completos sin servicio, para compensarlos al reponer. */
  diasPerdidos: number;
  /** Perfiles libres en cuentas activas del mismo servicio. */
  libres: number;
}

export interface ResultadoReposicion {
  /** Cuenta y perfil nuevos del cliente. */
  cuentaId: string;
  cuentaPista: string;
  perfil: { numero: number; nombre: string };
  /** Días sumados a su vencimiento (0 si no se compensó). */
  diasCompensados: number;
}

/** Una caída de una cuenta: cuándo se marcó y, si ya volvió, cuándo. */
export interface CaidaCuenta {
  cuenta: { id: string; pista: string; servicio: Referencia; proveedor: string | null };
  caidaEn: string;
  /** null: sigue caída. */
  resueltaEn: string | null;
  /** Horas sin servicio (hasta ahora si sigue caída). */
  horas: number;
  /** Perfiles con cliente que tiene hoy la cuenta. */
  clientes: number;
}

export interface GrupoCaidas {
  nombre: string;
  caidas: number;
  horas: number;
}

/** Reporte de caídas de un período: cada caída y los totales por plataforma y por proveedor. */
export interface ReporteCaidas {
  desde: string;
  hasta: string;
  caidas: CaidaCuenta[];
  porServicio: GrupoCaidas[];
  porProveedor: GrupoCaidas[];
  /** Cuentas caídas en este momento. */
  sinResolver: number;
}

/** Lo que devuelve el alta desde un perfil libre. */
export interface ResultadoAltaPerfil {
  cuenta: CuentaServicioDetalle;
  clienteId: string;
  suscripcionId: string;
  /** Factura pagada de la venta (null si no se indicó cómo pagó). */
  facturaId: string | null;
}

/** Una plataforma (servicio) con todas sus cuentas, como en el Gestor. */
export interface PlataformaCuentas {
  servicio: Referencia & { logoUrl: string | null };
  tipo: TipoPlataforma;
  /** Activas, caídas y sin anotar (las retiradas no). */
  cuentas: CuentaServicioDetalle[];
  /** Fecha de hoy en Venezuela (AAAA-MM-DD). */
  hoy: string;
}
