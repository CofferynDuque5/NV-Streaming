/** Tipos de respuesta del editor visual (fase 2). */
import type { BloqueSitio, PaletaSitio } from './esquemas/sitio.js';

export interface ReferenciaPersona {
  id: string;
  nombre: string;
}

/** Página en la lista del editor. */
export interface PaginaSitioResumen {
  id: string;
  ruta: string;
  titulo: string;
  archivada: boolean;
  versionPublicada: { numero: number; publicadaEn: string } | null;
  borradorActualizadoEn: string | null;
  /** El borrador es distinto de la versión publicada (o nunca se publicó). */
  cambiosSinPublicar: boolean;
}

export interface VersionPaginaResumen {
  id: string;
  numero: number;
  titulo: string;
  nota: string | null;
  publicadaPor: ReferenciaPersona | null;
  publicadaEn: string;
  vigente: boolean;
  bloques: number;
}

/** Página con su borrador e historial de versiones, para el editor. */
export interface PaginaSitioDetalle extends PaginaSitioResumen {
  descripcion: string | null;
  bloques: BloqueSitio[];
  borradorPor: ReferenciaPersona | null;
  versiones: VersionPaginaResumen[];
}

/** Versión vigente de una página, tal como la ve el público. */
export interface PaginaPublicada {
  ruta: string;
  titulo: string;
  descripcion: string | null;
  bloques: BloqueSitio[];
  numero: number;
  publicadaEn: string;
}

export interface MedioSitio {
  id: string;
  /** Dirección pública de la imagen (mismo origen que la web). */
  url: string;
  textoAlternativo: string;
  tipoMime: string;
  tamano: number;
  nombre: string;
  creadoEn: string;
}

export interface TemaSitio {
  paleta: PaletaSitio;
  actualizadoEn: string | null;
  actualizadoPor: ReferenciaPersona | null;
}

export interface TemaSitioPublico {
  paleta: PaletaSitio;
}

/** Dirección pública de una imagen del sitio. */
export const urlMedio = (id: string) => `/api/v1/sitio/publico/medios/${id}`;
