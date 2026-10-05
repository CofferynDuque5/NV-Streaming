import {
  type BloqueSitio,
  esRutaReservada,
  INFO_CATEGORIA,
  RUTA_PAGINA_REGEX,
  type TipoBloque,
} from '@nv/shared';
import {
  AlignLeft,
  CircleHelp,
  CreditCard,
  Flag,
  ImageIcon,
  Landmark,
  LayoutGrid,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  MonitorPlay,
  Quote,
  Rocket,
  Star,
  Tag,
  Trophy,
} from 'lucide-react';

/** Id corto y aleatorio para un bloque nuevo (8 caracteres [a-z0-9]). */
export function nuevoId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

type Grupo = 'contenido' | 'tienda';

/** Nombre, descripción, grupo de la galería, icono y color de cada tipo de bloque. */
export const INFO_BLOQUES: Record<
  TipoBloque,
  { nombre: string; descripcion: string; grupo: Grupo; icono: LucideIcon; color: string }
> = {
  portada: {
    nombre: 'Portada',
    descripcion: 'Título grande con botones e imagen o ilustración',
    grupo: 'contenido',
    icono: Rocket,
    color: '#4f8dff',
  },
  texto: {
    nombre: 'Texto',
    descripcion: 'Párrafos con negritas, listas y enlaces',
    grupo: 'contenido',
    icono: AlignLeft,
    color: '#94a3b8',
  },
  imagen: {
    nombre: 'Imagen',
    descripcion: 'Una imagen de la biblioteca con leyenda',
    grupo: 'contenido',
    icono: ImageIcon,
    color: '#22d3ee',
  },
  beneficios: {
    nombre: 'Beneficios',
    descripcion: 'Tarjetas con ícono, título y texto',
    grupo: 'contenido',
    icono: Star,
    color: '#f59e0b',
  },
  pasos: {
    nombre: 'Pasos',
    descripcion: 'Instrucciones numeradas, de 1 a 8 pasos',
    grupo: 'contenido',
    icono: ListOrdered,
    color: '#22d3ee',
  },
  testimonios: {
    nombre: 'Testimonios',
    descripcion: 'Opiniones reales de clientes con su nombre',
    grupo: 'contenido',
    icono: Quote,
    color: '#a855f7',
  },
  preguntas: {
    nombre: 'Preguntas frecuentes',
    descripcion: 'Preguntas que se abren y se cierran',
    grupo: 'contenido',
    icono: CircleHelp,
    color: '#22d3ee',
  },
  llamada: {
    nombre: 'Llamada a la acción',
    descripcion: 'Un título con un botón destacado',
    grupo: 'contenido',
    icono: Megaphone,
    color: '#22c55e',
  },
  banner: {
    nombre: 'Banner',
    descripcion: 'Franja de aviso: información, éxito o alerta',
    grupo: 'contenido',
    icono: Flag,
    color: '#fbbf24',
  },
  universos: {
    nombre: 'Universos',
    descripcion: 'Las categorías del catálogo con su cantidad',
    grupo: 'tienda',
    icono: LayoutGrid,
    color: '#8b5cf6',
  },
  servicios: {
    nombre: 'Servicios',
    descripcion: 'Tarjetas de servicios con su precio y el carrito',
    grupo: 'tienda',
    icono: MonitorPlay,
    color: '#4f8dff',
  },
  planes: {
    nombre: 'Planes',
    descripcion: 'Planes y precios de un servicio o de todo el catálogo',
    grupo: 'tienda',
    icono: Tag,
    color: '#22c55e',
  },
  ranking: {
    nombre: 'Lo más pedido',
    descripcion: 'Los servicios más pedidos de los últimos 30 días',
    grupo: 'tienda',
    icono: Trophy,
    color: '#f59e0b',
  },
  'metodos-pago': {
    nombre: 'Métodos de pago',
    descripcion: 'Los métodos activos en Monedas y cobro',
    grupo: 'tienda',
    icono: Landmark,
    color: '#22d3ee',
  },
  canal: {
    nombre: 'Canal de WhatsApp',
    descripcion: 'Invitación al canal con el enlace de Contacto',
    grupo: 'tienda',
    icono: MessageCircle,
    color: '#22c55e',
  },
  panel: {
    nombre: 'Panel destacado',
    descripcion: 'Bloque grande con puntos, botones y un visual',
    grupo: 'tienda',
    icono: CreditCard,
    color: '#a855f7',
  },
};

/** Qué muestra cada bloque de la tienda en vivo (aviso del inspector). */
export const EN_VIVO: Partial<Record<TipoBloque, string>> = {
  universos: 'Se llena solo con los universos que tienen servicios en el catálogo.',
  servicios:
    'Se llena solo con los servicios activos del catálogo, su precio desde y el botón del carrito.',
  planes: 'Muestra los planes reales con su precio en la moneda de quien visita.',
  ranking:
    'El orden sale de las activaciones y renovaciones de los últimos 30 días. Sin ninguna, no se muestra.',
  'metodos-pago': 'Muestra los métodos activos en Monedas y cobro, más el saldo de la billetera.',
  canal:
    'El botón lleva al canal de WhatsApp de Contacto y redes. Sin ese enlace, el bloque no se muestra.',
  panel: 'Bloque grande para destacar algo de la tienda, con puntos, botones y un visual.',
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
    case 'universos':
      return { ...comun, tipo, etiqueta: null, titulo: 'Elige tu universo', subtitulo: null };
    case 'servicios':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Servicios',
        subtitulo: null,
        variante: 'rejilla',
        categoria: null,
        orden: 'recomendados',
        limite: 8,
        filtros: false,
      };
    case 'ranking':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Lo más pedido',
        subtitulo: null,
        limite: 5,
      };
    case 'metodos-pago':
      return { ...comun, tipo, etiqueta: null, titulo: 'Métodos de pago', subtitulo: null };
    case 'canal':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Únete a nuestro canal de WhatsApp',
        texto: null,
        boton: 'Unirme al canal',
      };
    case 'panel':
      return {
        ...comun,
        tipo,
        etiqueta: null,
        titulo: 'Título del panel',
        resaltado: null,
        texto: null,
        puntos: [],
        boton: null,
        botonSecundario: null,
        visual: 'ninguno',
        categoria: null,
      };
  }
}

/** Copia de un bloque con id nuevo y sin ancla (las anclas no se pueden repetir). */
export function duplicarBloque(b: BloqueSitio): BloqueSitio {
  return { ...structuredClone(b), id: nuevoId(), ancla: null };
}

/** Texto corto para reconocer el bloque en la lista. */
export function resumenBloque(b: BloqueSitio): string {
  switch (b.tipo) {
    case 'portada':
      return b.titulo;
    case 'texto':
      return b.titulo || b.contenido.split('\n')[0] || 'Sin texto';
    case 'imagen':
      return b.medioId ? b.alt || 'Sin texto alternativo' : 'Sin imagen';
    case 'banner':
      return b.texto || 'Sin texto';
    case 'servicios':
      return [
        b.categoria ? INFO_CATEGORIA[b.categoria]?.nombre : 'Todos los universos',
        { rejilla: 'cuadrícula', carril: 'carril', tira: 'tira' }[b.variante],
        Number.isFinite(b.limite) ? String(b.limite) : '?',
      ].join(' · ');
    case 'ranking':
      return `Top ${Number.isFinite(b.limite) ? b.limite : '?'} del mes`;
    case 'planes':
      return b.servicio ? b.servicio : 'Todo el catálogo';
    case 'canal':
      return b.titulo || 'Enlace de Contacto y redes';
    default:
      return b.titulo || 'Sin título';
  }
}

/** JSON con las claves ordenadas: compara bloques sin importar el orden de las claves. */
export function jsonEstable(v: unknown): string {
  return JSON.stringify(v, (_, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
}

/** Qué cambia al publicar respecto de lo que está en el sitio. */
export function cambiosDesde(
  publicada: { titulo: string; descripcion: string | null; bloques: BloqueSitio[] },
  actual: { titulo: string; descripcion: string; bloques: BloqueSitio[] },
): { total: number; lineas: string[] } {
  const antes = new Map(publicada.bloques.map((b) => [b.id, b]));
  const ahora = new Set(actual.bloques.map((b) => b.id));
  const anadidos = actual.bloques.filter((b) => !antes.has(b.id)).length;
  const quitados = publicada.bloques.filter((b) => !ahora.has(b.id)).length;
  const editados = actual.bloques.filter((b) => {
    const o = antes.get(b.id);
    return o && jsonEstable(o) !== jsonEstable(b);
  }).length;
  const comunes = actual.bloques.filter((b) => antes.has(b.id)).map((b) => b.id);
  const ordenAntes = publicada.bloques.filter((b) => ahora.has(b.id)).map((b) => b.id);
  const orden = comunes.join() !== ordenAntes.join() ? 1 : 0;
  const datos =
    publicada.titulo !== actual.titulo.trim() ||
    (publicada.descripcion ?? '') !== actual.descripcion.trim()
      ? 1
      : 0;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const lineas = [
    editados && plural(editados, 'bloque editado', 'bloques editados'),
    anadidos && plural(anadidos, 'bloque añadido', 'bloques añadidos'),
    quitados && plural(quitados, 'bloque eliminado', 'bloques eliminados'),
    orden && 'Cambió el orden de los bloques',
    datos && 'Cambió el título o la descripción de la página',
  ].filter((x): x is string => typeof x === 'string');
  return { total: editados + anadidos + quitados + orden + datos, lineas };
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

/** Ruta sugerida a partir del título: «Promo de Navidad» → /promo-de-navidad. */
export function rutaDesdeTitulo(titulo: string): string {
  const s = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 79)
    .replace(/-+$/, '');
  return s ? `/${s}` : '';
}

/**
 * Error de la ruta de una página nueva, en vivo: formato, rutas que usa la
 * aplicación y páginas que ya existen (también las archivadas). Las mismas
 * reglas que la API (`rutaPaginaSchema`).
 */
export function errorRuta(
  ruta: string,
  paginas: readonly { ruta: string; archivada: boolean }[],
): string | undefined {
  const r = ruta.trim();
  if (!r) return 'Escribe la ruta, por ejemplo /promo-navidad';
  if (r.length > 80) return `Máximo 80 caracteres (tienes ${r.length})`;
  if (!r.startsWith('/') || !RUTA_PAGINA_REGEX.test(r)) {
    return 'Usa minúsculas, números y guiones, empezando con /';
  }
  if (esRutaReservada(r)) return `/${r.split('/')[1]} la usa la tienda. Elige otra ruta.`;
  const existe = paginas.find((p) => p.ruta === r);
  if (existe) return `Ya existe una página en ${r}${existe.archivada ? ' (archivada)' : ''}`;
  return undefined;
}
