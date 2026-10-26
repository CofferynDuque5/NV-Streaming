import type {
  EstadoAccionPropuesta,
  NombreHerramienta,
  ProveedorIa,
  TipoHerramienta,
} from './asistente.js';

/** Respuestas de la API del asistente (fase 5). Fechas en ISO 8601. */

export interface ConversacionResumen {
  id: string;
  titulo: string;
  actualizadaEn: string;
  /** Acciones que esperan confirmación en esta conversación. */
  accionesPendientes: number;
}

/** Herramienta que el asistente usó al contestar (sin los datos que devolvió). */
export interface UsoHerramienta {
  herramienta: NombreHerramienta;
  tipo: TipoHerramienta;
  etiqueta: string;
  /** false si falló o no tenía permiso; el motivo, en texto para la persona. */
  ok: boolean;
  error: string | null;
}

export interface AccionPropuestaPublica {
  id: string;
  conversacionId: string;
  herramienta: NombreHerramienta;
  etiqueta: string;
  /** Qué hará, en una frase, con los datos ya resueltos (cliente, factura...). */
  resumen: string;
  parametros: Record<string, unknown>;
  estado: EstadoAccionPropuesta;
  /** Quien la pidió al asistente. */
  solicitadaPor: { id: string; nombre: string };
  decididaPor: { id: string; nombre: string } | null;
  decididaEn: string | null;
  expiraEn: string;
  resultado: string | null;
  error: string | null;
  creadaEn: string;
}

export interface MensajeAsistentePublico {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  herramientas: UsoHerramienta[];
  acciones: AccionPropuestaPublica[];
  creadoEn: string;
}

export interface ConversacionDetalle {
  id: string;
  titulo: string;
  mensajes: MensajeAsistentePublico[];
}

/** Respuesta a un mensaje: la conversación (nueva o la misma) y lo que contestó. */
export interface RespuestaAsistente {
  conversacionId: string;
  pregunta: MensajeAsistentePublico;
  respuesta: MensajeAsistentePublico;
}

export interface EstadoAsistente {
  activo: boolean;
  proveedor: ProveedorIa;
  modelo: string;
  /** El motor tiene lo que necesita (URL de Ollama, clave de Anthropic...). */
  disponible: boolean;
  /** Por qué no está disponible, para quien configura. */
  motivoNoDisponible: string | null;
  /** Mensajes que le quedan hoy a quien consulta. */
  mensajesRestantesHoy: number;
}

export interface ConfiguracionAsistentePublica {
  activo: boolean;
  proveedor: ProveedorIa;
  modelo: string | null;
  topeMensualUsd: string;
  mensajesDiariosPorUsuario: number;
  /** Proveedores con sus datos listos en el entorno del servidor. */
  proveedores: {
    proveedor: ProveedorIa;
    nombre: string;
    disponible: boolean;
    modeloPorDefecto: string;
    /** Por qué no está disponible (o no responde, en el caso del modelo local). */
    motivo: string | null;
  }[];
  /** Consumo de los últimos meses (hora de Caracas), por motor. */
  usoMes: {
    mes: string;
    proveedor: ProveedorIa;
    peticiones: number;
    tokensEntrada: number;
    tokensSalida: number;
    costoUsd: string;
  }[];
  actualizadoPor: { id: string; nombre: string } | null;
  actualizadoEn: string | null;
}
