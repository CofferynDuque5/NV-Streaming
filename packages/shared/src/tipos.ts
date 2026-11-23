import type { PasoPendiente } from './esquemas/auth.js';
import type { EstadoUsuario } from './esquemas/usuarios.js';
import type { Moneda } from './monedas.js';
import type { Permiso } from './permisos.js';
import type { Rol } from './roles.js';

/** Respuesta de error de la API. `codigo` es estable; `mensaje` se muestra al usuario. */
export interface ErrorApi {
  error: {
    codigo: string;
    mensaje: string;
    campos?: Record<string, string[]>;
  };
}

export interface UsuarioPublico {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  estado: EstadoUsuario;
  correoVerificado: boolean;
  dosPasosActivo: boolean;
  creadoEn: string;
  ultimoAccesoEn: string | null;
  /** Moneda fija de la tienda que le puso administración (null = automática). */
  monedaTienda: Moneda | null;
}

export interface SesionActual {
  usuario: UsuarioPublico;
  permisos: Permiso[];
  /** Si no está vacío, la sesión solo puede completar estos pasos. */
  pendiente: PasoPendiente | null;
  /**
   * Moneda en la que ve los precios de la tienda: la que le fijó administración
   * o, en un cliente, su moneda preferida. null = la elige él (o la de su país).
   */
  monedaTienda?: Moneda | null;
}

export interface SesionListada {
  id: string;
  actual: boolean;
  dispositivo: string;
  ip: string | null;
  creadaEn: string;
  ultimaActividadEn: string;
}

export interface Pagina<T> {
  elementos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface RegistroAuditoria {
  id: string;
  fecha: string;
  actorTipo: 'usuario' | 'ia' | 'sistema';
  actor: { id: string; nombre: string; correo: string } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  ip: string | null;
}
