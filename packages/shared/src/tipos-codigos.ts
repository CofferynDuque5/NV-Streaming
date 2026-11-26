import type { AccionProveedor } from './esquemas/codigos.js';
import type { Referencia } from './tipos-negocio.js';

export interface BuzonPublico {
  id: string;
  nombre: string;
  host: string;
  puerto: number;
  seguro: boolean;
  /** «co•••@gmail.com». El correo completo y la clave nunca salen del servidor. */
  pista: string;
  carpeta: string;
  activo: boolean;
  probadoEn: string | null;
  ultimoError: string | null;
}

export interface AsuntoCodigoPublico {
  id: string;
  servicio: Referencia;
  asunto: string;
  activo: boolean;
}

/**
 * hogar: actualizar el Hogar o viaje. verificar: confirmar el acceso. acceso: otro enlace de entrada.
 * restablecer: cambiar la contraseña (solo desde el panel del proveedor, botón «Link»).
 */
export type TipoEnlaceCodigo = 'hogar' | 'verificar' | 'acceso' | 'restablecer';

export interface EnlaceCodigo {
  url: string;
  tipo: TipoEnlaceCodigo;
}

export interface MensajeCodigo {
  asunto: string;
  /** Remitente («Netflix <info@account.netflix.com>»). */
  de: string;
  recibidoEn: string;
  codigo: string | null;
  enlace: EnlaceCodigo | null;
  /** Texto del correo, limpio y recortado (sin HTML). */
  extracto: string;
}

export interface ResultadoCodigo {
  /** Del más reciente al más antiguo (máximo 5). */
  mensajes: MensajeCodigo[];
  /** Buzones que no respondieron. */
  buzonesConError: { nombre: string; error: string }[];
  /** No hay asuntos para el servicio: se mostraron todos los correos para esa dirección. */
  sinFiltroAsunto: boolean;
}

/** Lo que ve el cliente en «Mis accesos»: solo el último código o enlace. */
export interface CodigoDelCliente {
  codigo: string | null;
  enlace: EnlaceCodigo | null;
  recibidoEn: string;
}

/** Estado del conector con el panel del proveedor. */
export type EstadoConector = 'sin_probar' | 'conectado' | 'esperando_aprobacion' | 'error';

/** Lo último que vio el navegador automático, sin datos sensibles (para afinar el conector). */
export interface DiagnosticoConector {
  paso: string;
  /** Rutas internas que llamó el panel al pulsar (sin parámetros). */
  rutas: string[];
  /** Botones que había en la fila de la cuenta. */
  botones: string[];
  /** Avisos que mostró el panel, con los números y enlaces tapados. */
  avisos: string[];
  en: string;
}

export interface ConectorPublico {
  nombre: string;
  activo: boolean;
  urlBase: string;
  /** «na•••@gmail.com», o null si no hay usuario guardado. */
  pista: string | null;
  tieneClave: boolean;
  marcaProveedor: string;
  buzonId: string | null;
  carpetaAprobacion: string;
  remitenteAprobacion: string;
  accionesCliente: AccionProveedor[];
  estado: EstadoConector;
  ultimoError: string | null;
  probadoEn: string | null;
  diagnostico: DiagnosticoConector | null;
}

/** Resultado de pulsar un botón del proveedor. */
export interface ResultadoProveedor {
  codigo: string | null;
  enlace: EnlaceCodigo | null;
  /** Lo que respondió el panel cuando no hay código («No hay códigos recientes»…). */
  mensaje: string | null;
  obtenidoEn: string;
}

// ── Revisión automática de cuentas Spotify principales ──────────────────────

export type EstadoRevisionSpotify = 'en_cola' | 'revisando' | 'lista' | 'error';
/** Lo que mostró Spotify: al día, pago fallido, en pausa, caída (sin Premium) o no se pudo saber. */
export type SituacionSpotify = 'al_dia' | 'pago_fallido' | 'pausa' | 'caida' | 'desconocida';

export interface RevisionSpotifyPublica {
  cuentaId: string;
  /** «ma•••@serviciosnat.com». */
  pista: string;
  servicio: string;
  estadoCuenta: string;
  /** Fecha de vencimiento guardada hoy en la web (AAAA-MM-DD). */
  facturaEn: string | null;
  /** null si la cuenta nunca se revisó. */
  revision: {
    estado: EstadoRevisionSpotify;
    situacion: SituacionSpotify | null;
    plan: string | null;
    vencimiento: string | null;
    cuposUsados: number | null;
    cuposTotal: number | null;
    fechaAnterior: string | null;
    fechaAplicada: boolean;
    ultimoError: string | null;
    diagnostico: DiagnosticoSpotify | null;
    revisadaEn: string | null;
  } | null;
}

/** Lo que vio el navegador en Spotify, con correos y números largos tapados. */
export interface DiagnosticoSpotify {
  paso: string;
  url: string;
  textos: string[];
  en: string;
}
