/** Esquemas del editor visual: bloques, páginas, versiones y tema (fase 2). */
import { z } from 'zod';
import { IDS_PALETAS } from '../sitio-paletas.js';
import { enlacesDelTexto, esEnlaceSeguro } from '../sitio-texto.js';
import { textoOpcional, uuidSchema } from './comunes.js';

export * from '../sitio-paletas.js';
export * from '../sitio-texto.js';

/** Máximo de bloques por página. */
export const MAX_BLOQUES = 40;
/** Tamaño máximo de una imagen del sitio. */
export const MEDIO_MAX_MB = 4;

/** Misma expresión que la restricción `paginas_ruta_valida` de la base de datos. */
export const RUTA_PAGINA_REGEX = /^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/;

/**
 * Primer segmento de las rutas que ya usa la aplicación (paneles, acceso,
 * páginas fijas, API y archivos de Next.js). Una página del editor no puede
 * empezar por ninguno.
 */
export const RUTAS_RESERVADAS = [
  'admin',
  'ajustes',
  'api',
  'apple-icon',
  'configurar-2fa',
  'cuenta',
  'favicon',
  'icon',
  'ingresar',
  'invitacion',
  'manifest',
  'marca',
  'next',
  '_next',
  'opengraph-image',
  'panel',
  'planes',
  'privacidad',
  'recuperar',
  'registro',
  'restablecer',
  'revendedor',
  'revendedores',
  'robots',
  'sitemap',
  'sitio',
  'terminos',
  'twitter-image',
  'verificacion-2fa',
  'verificar-correo',
] as const;

export function esRutaReservada(ruta: string): boolean {
  const primero = ruta.split('/')[1] ?? '';
  return (RUTAS_RESERVADAS as readonly string[]).includes(primero);
}

/** Normaliza lo que escribe la persona: minúsculas, con "/" inicial y sin "/" final. */
function normalizarRuta(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  let r = v.trim().toLowerCase();
  if (!r.startsWith('/')) r = `/${r}`;
  while (r.length > 1 && r.endsWith('/')) r = r.slice(0, -1);
  return r;
}

/** Ruta con el formato válido (sin comprobar si está reservada). */
export const formatoRutaSchema = z.preprocess(
  normalizarRuta,
  z
    .string({ error: 'Escribe la ruta.' })
    .max(80, 'La ruta no puede superar 80 caracteres.')
    .regex(
      RUTA_PAGINA_REGEX,
      'Usa minúsculas, números y guiones, separados por / (p. ej. /nosotros).',
    ),
);

export const rutaPaginaSchema = formatoRutaSchema.refine((r) => !esRutaReservada(r), {
  error: 'Esa ruta la usa la aplicación. Elige otra.',
});

// ---------------------------------------------------------------------------
// Piezas comunes de los bloques

const texto = (max: number, vacio = 'Este campo es obligatorio.') =>
  z.string({ error: vacio }).trim().min(1, vacio).max(max, `Máximo ${max} caracteres.`);

const MENSAJE_ENLACE =
  'Usa una ruta del sitio que empiece por / (p. ej. /planes) o una dirección https://.';

export const enlaceSchema = z
  .string({ error: 'Escribe el enlace.' })
  .trim()
  .min(1, 'Escribe el enlace.')
  .max(300, 'El enlace no puede superar 300 caracteres.')
  .refine(esEnlaceSeguro, { error: MENSAJE_ENLACE });

/** Texto con el marcado seguro del editor; sus enlaces deben ser seguros. */
const textoConMarcado = (max: number, vacio?: string) =>
  texto(max, vacio).superRefine((v, ctx) => {
    for (const url of enlacesDelTexto(v)) {
      if (!esEnlaceSeguro(url)) {
        ctx.addIssue({
          code: 'custom',
          message: `El enlace «${url.slice(0, 60)}» no está permitido. ${MENSAJE_ENLACE}`,
        });
      }
    }
  });

export const botonSitioSchema = z.object({
  texto: texto(40, 'Escribe el texto del botón.'),
  enlace: enlaceSchema,
});
export type BotonSitio = z.infer<typeof botonSitioSchema>;

export const imagenSitioSchema = z.object({
  medioId: uuidSchema,
  alt: texto(200, 'Describe la imagen para quien no puede verla.'),
});
export type ImagenSitio = z.infer<typeof imagenSitioSchema>;

const opcional = <S extends z.ZodType>(s: S) => s.nullable().optional();

export const ICONOS_SITIO = [
  'insignia',
  'tarjeta',
  'candado',
  'soporte',
  'billetera',
  'capas',
  'tienda',
  'escudo',
  'rayo',
  'reloj',
  'estrella',
  'corazon',
  'globo',
  'pantalla',
  'regalo',
  'personas',
  'mensaje',
  'check',
] as const;
export type IconoSitio = (typeof ICONOS_SITIO)[number];

export const FONDOS_BLOQUE = ['normal', 'suave', 'acento'] as const;
export type FondoBloque = (typeof FONDOS_BLOQUE)[number];

const base = {
  id: z
    .string({ error: 'Falta el identificador del bloque.' })
    .regex(/^[a-z0-9]{4,16}$/, 'Identificador de bloque no válido.'),
  /** Ancla para enlazar a la sección (p. ej. /#como-funciona). */
  ancla: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9-]{0,39}$/, 'Usa minúsculas, números y guiones (p. ej. precios).')
      .nullable()
      .optional(),
  ),
  fondo: z.enum(FONDOS_BLOQUE).default('normal'),
};

const encabezado = {
  etiqueta: textoOpcional(60),
  titulo: texto(120, 'Escribe el título.'),
  subtitulo: textoOpcional(300),
};

// ---------------------------------------------------------------------------
// Bloques

export const bloquePortadaSchema = z.object({
  ...base,
  tipo: z.literal('portada'),
  etiqueta: textoOpcional(60),
  titulo: texto(120, 'Escribe el título.'),
  /** Parte del título que se resalta con el color de la marca. */
  destacado: textoOpcional(60),
  subtitulo: textoOpcional(300),
  botonPrimario: opcional(botonSitioSchema),
  botonSecundario: opcional(botonSitioSchema),
  imagen: opcional(imagenSitioSchema),
  /** Sin imagen, muestra la ilustración del panel hecha con CSS. */
  ilustracion: z.boolean().default(true),
});

export const bloquePlanesSchema = z.object({
  ...base,
  tipo: z.literal('planes'),
  ...encabezado,
  /** Slug del servicio para mostrar solo sus planes; vacío = todo el catálogo. */
  servicio: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Servicio no válido.')
      .max(80)
      .nullable()
      .optional(),
  ),
});

export const bloqueBeneficiosSchema = z.object({
  ...base,
  tipo: z.literal('beneficios'),
  ...encabezado,
  variante: z.enum(['tarjetas', 'lista']).default('tarjetas'),
  boton: opcional(botonSitioSchema),
  elementos: z
    .array(
      z.object({
        icono: z.enum(ICONOS_SITIO, { error: 'Elige un icono.' }),
        titulo: texto(80, 'Escribe el título.'),
        texto: texto(300, 'Escribe el texto.'),
      }),
    )
    .min(1, 'Añade al menos un beneficio.')
    .max(12, 'Máximo 12 beneficios.'),
});

export const bloquePasosSchema = z.object({
  ...base,
  tipo: z.literal('pasos'),
  ...encabezado,
  elementos: z
    .array(
      z.object({ titulo: texto(80, 'Escribe el título.'), texto: texto(300, 'Escribe el texto.') }),
    )
    .min(1, 'Añade al menos un paso.')
    .max(8, 'Máximo 8 pasos.'),
});

export const bloqueTestimoniosSchema = z.object({
  ...base,
  tipo: z.literal('testimonios'),
  ...encabezado,
  elementos: z
    .array(
      z.object({
        cita: texto(500, 'Escribe el testimonio.'),
        autor: texto(80, 'Escribe quién lo dijo.'),
        detalle: textoOpcional(80),
      }),
    )
    .min(1, 'Añade al menos un testimonio.')
    .max(12, 'Máximo 12 testimonios.'),
});

export const bloquePreguntasSchema = z.object({
  ...base,
  tipo: z.literal('preguntas'),
  ...encabezado,
  elementos: z
    .array(
      z.object({
        pregunta: texto(200, 'Escribe la pregunta.'),
        respuesta: textoConMarcado(2000, 'Escribe la respuesta.'),
      }),
    )
    .min(1, 'Añade al menos una pregunta.')
    .max(30, 'Máximo 30 preguntas.'),
});

export const bloqueLlamadaSchema = z.object({
  ...base,
  tipo: z.literal('llamada'),
  titulo: texto(120, 'Escribe el título.'),
  texto: textoOpcional(300),
  boton: botonSitioSchema,
  botonSecundario: opcional(botonSitioSchema),
});

export const bloqueTextoSchema = z.object({
  ...base,
  tipo: z.literal('texto'),
  titulo: textoOpcional(120),
  contenido: textoConMarcado(5000, 'Escribe el texto.'),
});

export const PROPORCIONES_IMAGEN = ['16:9', '4:3', '1:1', '21:9'] as const;

export const bloqueImagenSchema = z.object({
  ...base,
  tipo: z.literal('imagen'),
  medioId: uuidSchema,
  alt: texto(200, 'Describe la imagen para quien no puede verla.'),
  leyenda: textoOpcional(200),
  proporcion: z.enum(PROPORCIONES_IMAGEN).default('16:9'),
});

export const bloqueBannerSchema = z.object({
  ...base,
  tipo: z.literal('banner'),
  texto: texto(200, 'Escribe el aviso.'),
  tono: z.enum(['info', 'exito', 'aviso']).default('info'),
  enlace: opcional(botonSitioSchema),
});

export const bloqueSitioSchema = z.discriminatedUnion(
  'tipo',
  [
    bloquePortadaSchema,
    bloquePlanesSchema,
    bloqueBeneficiosSchema,
    bloquePasosSchema,
    bloqueTestimoniosSchema,
    bloquePreguntasSchema,
    bloqueLlamadaSchema,
    bloqueTextoSchema,
    bloqueImagenSchema,
    bloqueBannerSchema,
  ],
  { error: 'Tipo de bloque desconocido.' },
);
export type BloqueSitio = z.output<typeof bloqueSitioSchema>;
export type TipoBloque = BloqueSitio['tipo'];
export type BloqueDe<T extends TipoBloque> = Extract<BloqueSitio, { tipo: T }>;

export const TIPOS_BLOQUE = [
  'portada',
  'planes',
  'beneficios',
  'pasos',
  'testimonios',
  'preguntas',
  'llamada',
  'texto',
  'imagen',
  'banner',
] as const satisfies readonly TipoBloque[];

/** Lista de bloques de una página: como mucho 40, con ids y anclas sin repetir. */
export const contenidoPaginaSchema = z
  .array(bloqueSitioSchema)
  .max(MAX_BLOQUES, `Una página admite como máximo ${MAX_BLOQUES} bloques.`)
  .superRefine((bloques, ctx) => {
    const ids = new Set<string>();
    const anclas = new Set<string>();
    bloques.forEach((b, i) => {
      if (ids.has(b.id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Bloque repetido.' });
      }
      ids.add(b.id);
      if (b.ancla) {
        if (anclas.has(b.ancla)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'ancla'],
            message: 'Otra sección ya usa esa ancla.',
          });
        }
        anclas.add(b.ancla);
      }
    });
  });

/** Ids de las imágenes que usa una lista de bloques. */
export function mediosDeBloques(bloques: readonly BloqueSitio[]): string[] {
  const ids = new Set<string>();
  for (const b of bloques) {
    if (b.tipo === 'imagen') ids.add(b.medioId);
    if (b.tipo === 'portada' && b.imagen) ids.add(b.imagen.medioId);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Páginas, versiones, imágenes y tema

const tituloPagina = texto(120, 'Escribe el título de la página.');

export const crearPaginaSchema = z.object({
  ruta: rutaPaginaSchema,
  titulo: tituloPagina,
  descripcion: textoOpcional(300),
});
export type CrearPaginaEntrada = z.infer<typeof crearPaginaSchema>;

export const guardarBorradorSchema = z.object({
  titulo: tituloPagina,
  descripcion: textoOpcional(300),
  bloques: contenidoPaginaSchema,
  /** Fecha del borrador sobre el que se editó (control de concurrencia). */
  borradorActualizadoEn: z.iso.datetime({ error: 'Fecha no válida.' }).nullable(),
});
export type GuardarBorradorEntrada = z.infer<typeof guardarBorradorSchema>;

export const publicarPaginaSchema = z.object({
  nota: textoOpcional(200),
  borradorActualizadoEn: z.iso.datetime({ error: 'Fecha no válida.' }).nullable().optional(),
});
export type PublicarPaginaEntrada = z.infer<typeof publicarPaginaSchema>;

export const restaurarVersionSchema = z.object({
  numero: z.coerce.number({ error: 'Elige una versión.' }).int().min(1, 'Elige una versión.'),
});

export const consultaPaginaPublicaSchema = z.object({ ruta: formatoRutaSchema });

export const subirMedioSchema = z.object({
  textoAlternativo: texto(200, 'Describe la imagen para quien no puede verla.'),
});

export const temaSitioSchema = z.object({
  paleta: z.enum(IDS_PALETAS, { error: 'Elige una paleta.' }),
});
export type TemaSitioEntrada = z.infer<typeof temaSitioSchema>;

export * from '../sitio-inicio.js';
