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

/** hogar: actualizar el Hogar o viaje (Netflix). verificar: confirmar el acceso. acceso: otro enlace de entrada. */
export type TipoEnlaceCodigo = 'hogar' | 'verificar' | 'acceso';

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
