/*
 * Constantes de la tienda sin dependencias (ni zod): las usan también los
 * componentes del navegador sin cargar los esquemas de validación.
 */

/**
 * Universos de la tienda. Cada servicio pertenece a uno (o a ninguno: entonces
 * solo aparece en «Todo»). El orden es el de la franja de categorías.
 */
export const CATEGORIAS_SERVICIO = [
  'streaming',
  'musica',
  'ia',
  'juegos',
  'software',
  'nube',
] as const;
export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number];

export const INFO_CATEGORIA: Record<CategoriaServicio, { nombre: string; descripcion: string }> = {
  streaming: { nombre: 'Streaming', descripcion: 'Películas, series y TV' },
  musica: { nombre: 'Música', descripcion: 'Música y podcasts sin anuncios' },
  ia: { nombre: 'IA', descripcion: 'Asistentes para crear y estudiar' },
  juegos: { nombre: 'Juegos', descripcion: 'Tarjetas, pases y más' },
  software: { nombre: 'Software', descripcion: 'Oficina y productividad' },
  nube: { nombre: 'Nube', descripcion: 'Espacio para tus archivos' },
};

export function esCategoriaServicio(v: unknown): v is CategoriaServicio {
  return typeof v === 'string' && (CATEGORIAS_SERVICIO as readonly string[]).includes(v);
}
