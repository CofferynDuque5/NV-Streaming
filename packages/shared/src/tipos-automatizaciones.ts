import type {
  CanalAviso,
  DefinicionAutomatizacion,
  EstadoNotificacion,
  TipoAutomatizacion,
} from './automatizaciones.js';

/** Respuestas de la API de automatizaciones (fase 3). Fechas en ISO 8601. */

export type EstadoEjecucion = 'en_curso' | 'completada' | 'con_errores' | 'fallida';

export interface EjecucionResumen {
  id: string;
  tipo: TipoAutomatizacion;
  estado: EstadoEjecucion;
  disparo: 'programada' | 'manual';
  procesados: number;
  omitidos: number;
  errores: number;
  resumen: string | null;
  iniciadaEn: string;
  terminadaEn: string | null;
}

export interface AutomatizacionResumen extends Pick<
  DefinicionAutomatizacion,
  'tipo' | 'nombre' | 'descripcion' | 'grupo' | 'disparo'
> {
  activa: boolean;
  canales: CanalAviso[];
  /** Canales que admite este tipo. */
  canalesPermitidos: CanalAviso[];
  parametros: Record<string, unknown>;
  /** Solo las programadas y activas. */
  proximaEjecucionEn: string | null;
  ultimaEjecucion: EjecucionResumen | null;
  actualizadoPor: { id: string; nombre: string } | null;
  actualizadoEn: string;
}

export interface EstadoCanales {
  correo: { proveedor: 'sandbox' | 'smtp' };
  whatsapp: {
    proveedor: 'desactivado' | 'sandbox' | 'cloud_api';
    /** Tiene las credenciales que necesita su proveedor. */
    listo: boolean;
  };
  /** Fuentes de tasa configuradas en el servidor. */
  fuentesTasa: { bcv: boolean; json: boolean };
  trabajador: {
    /** Último latido del proceso trabajador; null si nunca arrancó. */
    ultimoLatidoEn: string | null;
    activo: boolean;
  };
}

export interface PanelAutomatizaciones {
  automatizaciones: AutomatizacionResumen[];
  canales: EstadoCanales;
}

export interface NotificacionResumen {
  id: string;
  canal: CanalAviso;
  plantilla: string;
  /** Correo o teléfono, parcialmente oculto. */
  destino: string;
  cliente: { id: string; nombre: string } | null;
  usuario: { id: string; nombre: string } | null;
  automatizacion: TipoAutomatizacion | null;
  estado: EstadoNotificacion;
  motivo: string | null;
  error: string | null;
  creadoEn: string;
  enviadaEn: string | null;
}

export interface PruebaTasa {
  fuente: 'bcv' | 'json';
  /** Bolívares por 1 USD, como texto decimal. */
  valor: string;
  /** Tasa vigente registrada, para comparar. */
  vigente: string | null;
  variacionPct: string | null;
  obtenidaEn: string;
}
