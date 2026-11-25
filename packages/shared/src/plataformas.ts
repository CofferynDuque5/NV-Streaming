/**
 * Cómo se reparte una cuenta según la plataforma (igual que en el Gestor):
 * - `perfiles`: perfiles numerados con PIN (Netflix, Disney+, HBO Max…).
 * - `familiar`: plan familiar con cupos y sin PIN; el cupo 1 es el titular y
 *   los demás entran con su propio correo (Spotify, YouTube, Google One…).
 * - `correo`: se entra con el correo y un código de un solo uso, sin PIN (Canva).
 * Se decide por el nombre del servicio, sin guardar nada nuevo.
 */
export type TipoPlataforma = 'perfiles' | 'familiar' | 'correo';

const FAMILIAR = [
  'spotify',
  'youtube',
  'google one',
  'gemini',
  'office',
  'microsoft 365',
  'deezer',
  'tidal',
];
const CORREO = ['canva'];

const normalizar = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Cómo se nombra un perfil ante el cliente y el equipo. En las plataformas por
 * perfiles manda su ubicación en la cuenta (1, 2, 3…), no el nombre guardado,
 * para que coincida siempre con el orden real de la cuenta.
 */
export function etiquetaPerfil(tipo: TipoPlataforma, numero: number, nombre: string): string {
  if (tipo === 'perfiles') return `Perfil ${numero}`;
  // Las cuentas de un solo cliente se guardaban como «Cuenta completa»: son individuales.
  return normalizar(nombre).trim() === 'cuenta completa' ? 'Cuenta individual' : nombre;
}

export function tipoPlataforma(nombreServicio: string): TipoPlataforma {
  const n = normalizar(nombreServicio);
  if (FAMILIAR.some((p) => n.includes(p))) return 'familiar';
  if (CORREO.some((p) => n.includes(p))) return 'correo';
  return 'perfiles';
}

export interface TextosPlataforma {
  /** «Perfil» o «Cupo». */
  lugar: string;
  lugares: string;
  usaPin: boolean;
  /** Una línea para el panel de la cuenta. */
  descripcion: string;
}

export const TEXTOS_PLATAFORMA: Record<TipoPlataforma, TextosPlataforma> = {
  perfiles: {
    lugar: 'Perfil',
    lugares: 'Perfiles',
    usaPin: true,
    descripcion:
      'Plataforma por perfiles: el cliente entra con el correo y la clave de la cuenta, a su perfil y con su PIN.',
  },
  familiar: {
    lugar: 'Cupo',
    lugares: 'Cupos',
    usaPin: false,
    descripcion:
      'Plan familiar, sin PIN: el cupo 1 es el titular (alquiler, entra con los datos de la cuenta) y en los demás cupos cada miembro entra con su propio correo.',
  },
  correo: {
    lugar: 'Cupo',
    lugares: 'Cupos',
    usaPin: false,
    descripcion:
      'Se entra con el correo de la cuenta y un código de un solo uso que llega a ese correo. Sin PIN.',
  },
};

/** El cupo 1 de un plan familiar es el titular (usa el correo de la cuenta). */
export const esTitular = (tipo: TipoPlataforma, numero: number) =>
  tipo === 'familiar' && numero === 1;

/**
 * Lugares que la web entrega sola, como los modos del Gestor: en las
 * plataformas por perfiles, un perfil de una cuenta compartida o una cuenta
 * individual (se entrega primero el perfil compartido); en las
 * familiares (Spotify, YouTube, Gemini, Google One, Office…), la cuenta
 * principal (cupo titular) o una cuenta individual; en las de correo, cualquiera.
 */
export function sirveVentaWeb(tipo: TipoPlataforma, individual: boolean, numero: number): boolean {
  if (tipo === 'familiar') return individual || esTitular(tipo, numero);
  return true;
}

function aleatorios(n: number): Uint32Array {
  const a = new Uint32Array(n);
  // Web Crypto existe en el navegador y en Node 20+ (el paquete no carga los tipos del DOM).
  (
    globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }
  ).crypto.getRandomValues(a);
  return a;
}

/** Clave nueva para una cuenta: sin letras que se confunden (l, 1, O, 0). */
export function generarClave(largo = 12): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(aleatorios(largo), (x) => letras[x % letras.length]).join('');
}

/** PIN de 4 cifras. */
export function generarPin(): string {
  return Array.from(aleatorios(4), (x) => String(x % 10)).join('');
}

/* ─────────────────────── Contrato (igual que el Gestor) ─────────────────────── */

export interface DatosContrato {
  servicio: string;
  /** Correo o usuario con el que entra el cliente. */
  correo: string;
  clave: string;
  /** En una cuenta compartida, el nombre del cliente; vacío en individuales. */
  perfil: string;
  /** Vacío si la plataforma no usa PIN (se escribe «NO APLICA» si se pide). */
  pin: string;
  /** «dd/mm/aaaa». */
  vence: string;
}

export const CONDICIONES_CONTRATO = [
  '*El servicio es válido únicamente para 1 dispositivo.*',
  '*Las descargas deben realizarse solo en un mismo dispositivo*',
  '*No modificar perfiles, nombres ni configuraciones.*',
  '*No abrir la cuenta en más de un dispositivo.*',
  '*No compartir credenciales con terceros.*',
  '*El cliente debe reportar fallas de inmediato. Si no se informa a tiempo, no se repondrán días perdidos.*',
  '*No se realizan reembolsos ni cambios de suscripcion, excepto en casos de falla técnica sin solución.*',
  '*El incumplimiento de las condiciones resultara en la suspensión inmediata del servicio sin derecho a reclamo.*',
];

/** El texto «CONTRATO – FACTURA DE SERVICIO» que recibe el cliente al subirlo (formato del Gestor). */
export function contratoServicio(d: DatosContrato): string {
  const v = (x: string) => x.trim() || '—';
  return [
    'CONTRATO – FACTURA DE SERVICIO',
    '',
    `Servicio: ${v(d.servicio)}`,
    `Correo: ${v(d.correo)}`,
    `Contraseña: ${v(d.clave)}`,
    ...(d.perfil.trim() ? [`Perfil: ${d.perfil.trim()}`] : []),
    `Pin: ${d.pin.trim() || 'NO APLICA'}`,
    `Fecha vencimiento: ${v(d.vence)}`,
    '',
    'CONDICIONES DE USO DEL SERVICIO',
    '',
    ...CONDICIONES_CONTRATO,
    '',
    'ATENCIÓN AL CLIENTE',
    '',
    'Horario: 11:00 AM a 11:30 PM.',
    '',
    'Al recibir el servicio, el cliente acepta todas las condiciones.',
  ].join('\n');
}

/** «AAAA-MM-DD» → «dd/mm/aaaa». */
export function fechaContrato(dia: string): string {
  const [a, m, d] = dia.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '—';
}

export interface CandidatoLugar {
  cuentaId: string;
  perfilId: string;
  /** Próximo pago al proveedor («AAAA-MM-DD»), o null si no se le paga a nadie. */
  facturaEn: string | null;
}

/**
 * El lugar que mejor conviene, como en el Gestor: el de la cuenta que vence
 * más tarde (la que menos deja al cliente sin servicio). `cubre` dice si esa
 * cuenta alcanza para todo el plazo del cliente.
 */
export function recomendarLugar<T extends CandidatoLugar>(
  libres: T[],
  venceCliente: string,
): { lugar: T; cubre: boolean } | null {
  if (libres.length === 0) return null;
  const fecha = (c: T) => c.facturaEn ?? '9999-12-31';
  const lugar = [...libres].sort((a, b) => fecha(b).localeCompare(fecha(a)))[0]!;
  return { lugar, cubre: fecha(lugar) >= venceCliente };
}

/* ─────────────────────── Cuentas individuales y completas ─────────────────────── */

/**
 * Cuenta individual (en el Gestor): la cuenta entera es de un solo cliente.
 * Es la de modo «completa» y también la que tiene un solo perfil o cupo.
 * Una cuenta con varios perfiles que se venden por separado NO es individual.
 */
/**
 * ¿Se puede poner un cliente en esta cuenta? Solo si está activa (no caída ni
 * retirada) y vigente: con fecha de factura y que no haya pasado (`hoy` es el
 * día de Venezuela, AAAA-MM-DD). Las cuentas sin fecha no se venden.
 */
export const cuentaVigente = (c: { estado: string; facturaEn: string | null }, hoy: string) =>
  c.estado === 'activa' && c.facturaEn !== null && c.facturaEn.slice(0, 10) >= hoy;

export const esCuentaIndividual = (modo: 'perfiles' | 'completa', perfiles: number) =>
  modo === 'completa' || perfiles <= 1;

/** Un nombre para comparar: sin tildes, mayúsculas, puntos ni espacios de más. */
export function nombreComparable(nombre: string): string {
  return normalizar(nombre)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cuenta de varios perfiles con TODOS ocupados por la misma persona (por
 * ejemplo, un revendedor como «Danyelis Str.» en los 5 perfiles). Se trata
 * como una cuenta completa: un solo contrato, un solo vencimiento y un solo
 * corte. Si falta un perfil por ocupar o hay otro nombre, no cuenta (aunque
 * sea cliente del mismo responsable). Devuelve el nombre o null.
 */
export function unaPersonaEnTodos(
  perfiles: readonly { asignado: boolean; nombre: string | null | undefined }[],
): string | null {
  if (perfiles.length < 2) return null;
  const primero = perfiles[0]?.nombre;
  if (!primero) return null;
  const clave = nombreComparable(primero);
  if (!clave) return null;
  return perfiles.every((p) => p.asignado && p.nombre && nombreComparable(p.nombre) === clave)
    ? primero
    : null;
}

/* ─────────────────────── Mensaje con los datos (botón «Mensaje») ─────────────────────── */

export const MARCA_MENSAJES = 'NV Streaming';

export interface DatosMensajeCuenta {
  cliente: string;
  servicio: string;
  correo: string;
  /** Vacía: no se escribe (cuentas que entran con código). */
  clave: string;
  /** Vacío: no se escribe (cupos de planes familiares). */
  perfil: string;
  /** Vacío: no se escribe (sin PIN). */
  pin: string;
  /** «dd/mm/aaaa». */
  vence: string;
}

/** El mensaje que se le envía al cliente con los datos de su cuenta (formato de Nathan). */
export function mensajeDatosCuenta(d: DatosMensajeCuenta): string {
  const linea = (etiqueta: string, valor: string) =>
    valor.trim() ? [`${etiqueta}: ${valor.trim()}`] : [];
  return [
    `Hola, ${d.cliente.trim()}.`,
    `Los datos de su cuenta de ${d.servicio} son los siguientes:`,
    '',
    `Correo: ${d.correo.trim() || '—'}`,
    ...linea('Contraseña', d.clave),
    ...linea('Perfil', d.perfil),
    ...linea('PIN', d.pin),
    ...linea('Vencimiento', d.vence),
    '',
    `¡Gracias por confiar en ${MARCA_MENSAJES}!`,
  ].join('\n');
}
