/** Tipos de respuesta del editor visual (fase 2). */
import type { BloqueSitio, ContactoSitio, PaletaSitio } from './esquemas/sitio.js';
import type { Moneda } from './monedas.js';

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
  contacto: ContactoSitio;
  actualizadoEn: string | null;
  actualizadoPor: ReferenciaPersona | null;
}

/** Método de cobro tal como se nombra al público (sin datos de la cuenta). */
export interface MetodoPagoSitio {
  nombre: string;
  moneda: Moneda;
}

export interface TemaSitioPublico {
  paleta: PaletaSitio;
  contacto: ContactoSitio;
  /** Métodos de cobro activos, sin repetir nombre y moneda, en el orden del panel. */
  metodosPago: MetodoPagoSitio[];
}

/** Dirección pública de una imagen del sitio. */
export const urlMedio = (id: string) => `/api/v1/sitio/publico/medios/${id}`;
