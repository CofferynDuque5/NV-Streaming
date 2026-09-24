import type { BloqueSitio, TipoBloque } from '@nv/shared';

/** Id corto y aleatorio para un bloque nuevo (8 caracteres [a-z0-9]). */
export function nuevoId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export const INFO_BLOQUES: Record<TipoBloque, { nombre: string; descripcion: string }> = {
  portada: { nombre: 'Portada', descripcion: 'Título principal, texto y botones.' },
  planes: { nombre: 'Planes', descripcion: 'El catálogo real en la moneda de quien visita.' },
  beneficios: { nombre: 'Beneficios', descripcion: 'Ventajas con icono.' },
  pasos: { nombre: 'Pasos', descripcion: 'Cómo funciona, paso a paso.' },
  testimonios: { nombre: 'Testimonios', descripcion: 'Opiniones reales de clientes.' },
  preguntas: { nombre: 'Preguntas frecuentes', descripcion: 'Preguntas que se despliegan.' },
  llamada: { nombre: 'Llamada a la acción', descripcion: 'Invitación con un botón.' },
  texto: { nombre: 'Texto', descripcion: 'Párrafos, listas y enlaces.' },
  imagen: { nombre: 'Imagen', descripcion: 'Una imagen de la biblioteca.' },
  banner: { nombre: 'Aviso', descripcion: 'Franja con un mensaje breve.' },
};

/**
 * Bloque nuevo con valores de partida. Los campos que serían datos (testimonios,
 * preguntas, textos) empiezan vacíos: nunca se rellenan con contenido inventado.
 */
export function bloqueNuevo(tipo: TipoBloque): BloqueSitio {
  const id = nuevoId();
  const comun = { id, ancla: null, fondo: 'normal' as const };
  switch (tipo) {
    case 'portada':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Título principal',
        destacado: null,
        subtitulo: null,
        botonPrimario: { texto: 'Crear mi cuenta', enlace: '/registro' },
        botonSecundario: null,
        imagen: null,
        ilustracion: true,
      };
    case 'planes':
      return {
        ...comun,
        tipo,
        etiqueta: 'Planes y precios',
        titulo: 'Elige tu plan',
        subtitulo: null,
        servicio: null,
      };
    case 'beneficios':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Por qué elegirnos',
        subtitulo: null,
        variante: 'tarjetas',
        boton: null,
        elementos: [{ icono: 'insignia', titulo: '', texto: '' }],
      };
    case 'pasos':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Cómo funciona',
        subtitulo: null,
        elementos: [{ titulo: '', texto: '' }],
      };
    case 'testimonios':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Lo que dicen nuestros clientes',
        subtitulo: null,
        elementos: [{ cita: '', autor: '', detalle: null }],
      };
    case 'preguntas':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Preguntas frecuentes',
        subtitulo: null,
        elementos: [{ pregunta: '', respuesta: '' }],
      };
    case 'llamada':
      return {
        ...comun,
        tipo,
        titulo: 'Crea tu cuenta',
        texto: null,
        boton: { texto: 'Crear mi cuenta', enlace: '/registro' },
        botonSecundario: null,
      };
    case 'texto':
      return { ...comun, tipo, titulo: null, contenido: '' };
    case 'imagen':
      return { ...comun, tipo, medioId: '', alt: '', leyenda: null, proporcion: '16:9' };
    case 'banner':
      return { ...comun, tipo, texto: '', tono: 'info', enlace: null };
  }
}

/** Copia de un bloque con id nuevo y sin ancla (las anclas no se pueden repetir). */
export function duplicarBloque(b: BloqueSitio): BloqueSitio {
  return { ...structuredClone(b), id: nuevoId(), ancla: null };
}

/** Texto corto para reconocer el bloque en la lista. */
export function resumenBloque(b: BloqueSitio): string {
  switch (b.tipo) {
    case 'texto':
      return b.titulo || b.contenido.slice(0, 60) || 'Sin texto';
    case 'imagen':
      return b.alt || 'Sin imagen';
    case 'banner':
      return b.texto || 'Sin texto';
    default:
      return b.titulo || 'Sin título';
  }
}

/** Errores de zod como { "bloques.2.titulo": "mensaje" } (el primero de cada campo). */
export function erroresDe(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const i of issues) {
    const clave = i.path.map(String).join('.') || '_';
    salida[clave] ??= i.message;
  }
  return salida;
}
