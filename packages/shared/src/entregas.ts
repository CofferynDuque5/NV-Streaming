import { z } from 'zod';
import { paginacionSchema, uuidSchema } from './esquemas/comunes.js';

/**
 * Entregas de servicios autorizados (fase 6). NV solo vende su servicio propio
 * con licencia y activaciones de distribuidores oficiales: se entregan códigos,
 * enlaces de activación o instrucciones. NUNCA usuarios y contraseñas de
 * cuentas de terceros: las funciones de aquí lo impiden también en la web.
 */

/** Cómo se entrega el servicio de un proveedor. */
export const ADAPTADORES_ENTREGA = ['manual', 'codigos', 'webhook'] as const;
export type AdaptadorEntrega = (typeof ADAPTADORES_ENTREGA)[number];

export const ESTADOS_ENTREGA = [
  'pendiente',
  'en_curso',
  'entregada',
  'fallida',
  'revocada',
  'anulada',
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const MOTIVOS_ENTREGA = ['alta', 'renovacion', 'compra'] as const;
export type MotivoEntrega = (typeof MOTIVOS_ENTREGA)[number];

export const ESTADOS_CODIGO = ['disponible', 'reservado', 'entregado', 'anulado'] as const;
export type EstadoCodigo = (typeof ESTADOS_CODIGO)[number];

/** Códigos que admite como máximo un lote. */
export const MAX_CODIGOS_POR_LOTE = 5000;
/** Largo permitido de un código (sin contar espacios ni guiones al compararlos). */
export const LARGO_CODIGO = { min: 4, max: 200 } as const;

/** Mensaje único cuando algo parece un usuario y una contraseña. */
export const MENSAJE_SIN_CREDENCIALES =
  'NV Streaming nunca entrega usuarios ni contraseñas de cuentas. Escribe solo los pasos para activar el servicio, un código o un enlace de activación oficial.';

// ── Detección de credenciales ────────────────────────────────────────────────

const CLAVE = String.raw`(?:contrase(?:ñ|n)a|clave|password|passwd|pass|pwd|passcode|contra|pin)`;
const USUARIO = String.raw`(?:usuario|user(?:name)?|login|correo|e-?mail|cuenta|account)`;

/** "Contraseña: xyz", "pass = 1234", "PIN: 0000". */
const CLAVE_CON_VALOR = new RegExp(String.raw`(?:^|[^\p{L}])${CLAVE}\s*[:=]\s*\S`, 'iu');
/** "la contraseña es Hola1234" (el valor lleva números o símbolos, o va entre comillas). */
const CLAVE_ES_VALOR = new RegExp(
  String.raw`(?:^|[^\p{L}])${CLAVE}\s+(?:es|será|sera)\s+(?:["'«“][^"'»”]+["'»”]|\S*[\d!#$%&*@?]\S*)`,
  'iu',
);
/** "Usuario: maria" junto con cualquier mención de una contraseña. */
const USUARIO_CON_VALOR = new RegExp(String.raw`(?:^|[^\p{L}])${USUARIO}\s*[:=]\s*\S`, 'iu');
const MENCIONA_CLAVE = new RegExp(String.raw`(?:^|[^\p{L}])${CLAVE}(?:[^\p{L}]|$)`, 'iu');
/** "maria@correo.com:Hola1234" o "maria@correo.com | Hola1234". */
const CORREO_Y_CLAVE =
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*(?:[:|;/]|\s-\s)\s*(?=\S*[\d!#$%&*?])[^\s,.]{4,}/iu;
/** "clave Secreta123": la palabra seguida de un valor con números. */
const CLAVE_Y_VALOR = new RegExp(
  String.raw`(?:^|[^\p{L}])${CLAVE}\s+(?=[^\s]*\d)[^\s,.;]{4,}`,
  'iu',
);
/** "https://usuario:clave@sitio" (credenciales dentro de un enlace). */
const URL_CON_CREDENCIALES = /[a-z][\w+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/iu;
/** "?password=..." o "&clave=..." en un enlace. */
const PARAMETRO_CLAVE = new RegExp(String.raw`[?&#]${CLAVE}=`, 'iu');

/**
 * ¿El texto parece contener un usuario y una contraseña (o solo una
 * contraseña)? Se usa para rechazar lo que el equipo escribe al completar una
 * entrega y las líneas de los lotes de códigos. Prefiere rechazar de más: el
 * mensaje explica que solo se entregan pasos, códigos o enlaces oficiales.
 */
export function pareceCredenciales(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const t = texto.normalize('NFKC');
  if (CLAVE_CON_VALOR.test(t) || CLAVE_ES_VALOR.test(t)) return true;
  if (CLAVE_Y_VALOR.test(t)) return true;
  if (CORREO_Y_CLAVE.test(t)) return true;
  if (URL_CON_CREDENCIALES.test(t) || PARAMETRO_CLAVE.test(t)) return true;
  return USUARIO_CON_VALOR.test(t) && MENCIONA_CLAVE.test(t);
}

// ── Códigos de inventario ────────────────────────────────────────────────────

/**
 * Forma normalizada de un código para detectar repetidos: sin espacios ni
 * guiones y en mayúsculas ("abcd-1234 5678" = "ABCD12345678"). El código se
 * guarda tal como se escribió; esta forma solo sirve para comparar.
 */
export function normalizarCodigo(codigo: string): string {
  return codigo
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-‐-―]+/g, '');
}

const CABECERAS = new Set(['codigo', 'codigos', 'code', 'codes', 'pin', 'tarjeta', 'clave']);

export interface LineaInvalida {
  /** Número de línea (desde 1) en el texto subido. */
  linea: number;
  motivo: string;
}

export interface CodigosLeidos {
  /** Códigos únicos del texto, en su orden (se descartan los repetidos). */
  codigos: string[];
  /** Líneas que repetían un código ya leído en el mismo texto. */
  repetidos: number;
  invalidos: LineaInvalida[];
  /** Hay más códigos que el máximo por lote. */
  excedeMaximo: boolean;
}

/** Primer campo de una línea CSV (coma, punto y coma o tabulador), sin comillas. */
function primerCampo(linea: string): string {
  const t = linea.trim();
  if (t.startsWith('"')) {
    let valor = '';
    for (let i = 1; i < t.length; i += 1) {
      const c = t[i]!;
      if (c === '"') {
        if (t[i + 1] === '"') {
          valor += '"';
          i += 1;
          continue;
        }
        return valor;
      }
      valor += c;
    }
    return valor;
  }
  return t.split(/[,;\t]/)[0] ?? '';
}

/**
 * Lee un lote de códigos: texto plano (uno por línea) o CSV (se toma la
 * primera columna). Ignora líneas vacías, comentarios (#) y una cabecera
 * ("codigo", "code"...). Descarta repetidos dentro del texto y marca como
 * inválidas las líneas demasiado cortas o largas, con caracteres de control o
 * que parecen un usuario y una contraseña. Nunca devuelve el texto de una
 * línea inválida.
 */
export function leerCodigos(texto: string, maximo = MAX_CODIGOS_POR_LOTE): CodigosLeidos {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const vistos = new Set<string>();
  const codigos: string[] = [];
  const invalidos: LineaInvalida[] = [];
  let repetidos = 0;
  let primera = true;
  for (let i = 0; i < lineas.length; i += 1) {
    const cruda = lineas[i]!;
    if (!cruda.trim() || cruda.trim().startsWith('#')) continue;
    const codigo = primerCampo(cruda).trim().replace(/\s+/g, ' ');
    const normal = normalizarCodigo(codigo);
    if (primera) {
      primera = false;
      const cabecera = codigo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (CABECERAS.has(cabecera)) continue;
    }
    let motivo: string | null = null;
    if (/\p{Cc}/u.test(codigo)) motivo = 'Tiene caracteres no válidos.';
    else if (normal.length < LARGO_CODIGO.min) motivo = 'Es demasiado corto.';
    else if (codigo.length > LARGO_CODIGO.max) motivo = 'Es demasiado largo.';
    else if (pareceCredenciales(cruda)) motivo = 'Parece un usuario y una contraseña.';
    if (motivo) {
      if (invalidos.length < 100) invalidos.push({ linea: i + 1, motivo });
      continue;
    }
    if (vistos.has(normal)) {
      repetidos += 1;
      continue;
    }
    vistos.add(normal);
    codigos.push(codigo);
  }
  return { codigos, repetidos, invalidos, excedeMaximo: codigos.length > maximo };
}

// ── Esquemas de entrada ──────────────────────────────────────────────────────

const sinCredenciales = { error: MENSAJE_SIN_CREDENCIALES };

/** Vacío = no se envía. */
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    esquema.optional(),
  );

/** URL http(s) con un host (sin usuario ni contraseña: eso se rechaza aparte). */
const URL_HTTP = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;
export const esUrlHttp = (v: string) => URL_HTTP.test(v);

const urlHttpSchema = z
  .string()
  .trim()
  .max(1000, 'El enlace es demasiado largo.')
  .refine((v) => !pareceCredenciales(v), sinCredenciales)
  .refine(esUrlHttp, { error: 'Escribe un enlace completo, que empiece por https://' });

export const filtroEntregasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_ENTREGA).optional(),
  adaptador: z.enum(ADAPTADORES_ENTREGA).optional(),
  motivo: z.enum(MOTIVOS_ENTREGA).optional(),
  proveedorId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  clienteId: uuidSchema.optional(),
  /** Nombre del cliente o referencia del proveedor. */
  busqueda: z.string().trim().max(80).optional(),
});
export type FiltroEntregasEntrada = z.output<typeof filtroEntregasSchema>;

/**
 * Completar a mano una entrega (adaptador manual): pasos para activar y,
 * opcionalmente, un enlace o un código oficial (se guardan cifrados).
 */
export const completarEntregaSchema = z.object({
  instrucciones: z
    .string({ error: 'Escribe los pasos para activar el servicio.' })
    .trim()
    .min(10, 'Escribe los pasos para activar el servicio (al menos 10 caracteres).')
    .max(2000, 'Las instrucciones son demasiado largas (máximo 2000 caracteres).')
    .refine((v) => !pareceCredenciales(v), sinCredenciales),
  enlace: opcional(urlHttpSchema).refine(
    (v) => v === undefined || v.toLowerCase().startsWith('https://'),
    {
      error: 'El enlace debe empezar por https://',
    },
  ),
  codigo: opcional(
    z
      .string()
      .trim()
      .min(LARGO_CODIGO.min, 'El código es demasiado corto.')
      .max(LARGO_CODIGO.max, 'El código es demasiado largo.')
      .refine((v) => !pareceCredenciales(v), sinCredenciales),
  ),
});
export type CompletarEntregaEntrada = z.output<typeof completarEntregaSchema>;

export const anularEntregaSchema = z.object({
  motivo: z
    .string({ error: 'Explica por qué se anula.' })
    .trim()
    .min(5, 'Explica por qué se anula (al menos 5 caracteres).')
    .max(500, 'El motivo es demasiado largo.'),
});

/** Lote de códigos: texto plano o CSV (se lee en la API con `leerCodigos`). */
export const subirLoteSchema = z.object({
  nombre: z
    .string({ error: 'Ponle un nombre al lote.' })
    .trim()
    .min(2, 'Ponle un nombre al lote (p. ej. «Factura 123 del distribuidor»).')
    .max(120, 'El nombre es demasiado largo.'),
  texto: z
    .string({ error: 'Pega los códigos o elige un archivo.' })
    .min(1, 'Pega los códigos o elige un archivo.')
    .max(1_000_000, 'El archivo es demasiado grande (máximo 1 MB).'),
  /** Fecha de vencimiento de los códigos (AAAA-MM-DD, fin de ese día en Venezuela). */
  venceEn: opcional(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida.')
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Usa una fecha válida.'),
  ),
});
export type SubirLoteEntrada = z.output<typeof subirLoteSchema>;

export const anularCodigoSchema = z.object({
  motivo: z
    .string({ error: 'Explica por qué se anula.' })
    .trim()
    .min(5, 'Explica por qué se anula (al menos 5 caracteres).')
    .max(300, 'El motivo es demasiado largo.'),
});

export const TIEMPO_LIMITE_WEBHOOK = { min: 2, max: 30, defecto: 10 } as const;

/** Configuración de entrega de un proveedor (sin secretos: la clave de firma se rota aparte). */
export const configurarEntregaSchema = z
  .object({
    adaptador: z.enum(ADAPTADORES_ENTREGA, { error: 'Elige cómo se entrega.' }),
    webhookUrl: opcional(
      z
        .string()
        .trim()
        .max(500, 'La URL es demasiado larga.')
        .refine(esUrlHttp, { error: 'Escribe una URL completa, que empiece por https://' }),
    ),
    tiempoLimiteSegundos: z.coerce
      .number({ error: 'Escribe un número de segundos.' })
      .int('Escribe un número entero de segundos.')
      .min(TIEMPO_LIMITE_WEBHOOK.min, `Mínimo ${TIEMPO_LIMITE_WEBHOOK.min} segundos.`)
      .max(TIEMPO_LIMITE_WEBHOOK.max, `Máximo ${TIEMPO_LIMITE_WEBHOOK.max} segundos.`)
      .default(TIEMPO_LIMITE_WEBHOOK.defecto),
    /** Enviar el correo del cliente al proveedor (solo si el acuerdo lo exige). */
    incluirCorreo: z.boolean().default(false),
    /** Cada renovación pagada crea una entrega nueva (códigos o aviso al proveedor). */
    entregarRenovaciones: z.boolean().default(true),
    /** Pasos que ve el cliente junto a su código o enlace (sin secretos). */
    instrucciones: opcional(
      z
        .string()
        .trim()
        .max(1000, 'Máximo 1000 caracteres.')
        .refine((v) => !pareceCredenciales(v), sinCredenciales),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.adaptador === 'webhook' && !v.webhookUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['webhookUrl'],
        message: 'Escribe la URL del proveedor que recibe las entregas.',
      });
    }
  });
export type ConfigurarEntregaEntrada = z.output<typeof configurarEntregaSchema>;

/** Esquema de la configuración guardada en `proveedores.configuracion` (tolerante). */
export const configuracionProveedorSchema = z.object({
  webhookUrl: z.string().nullable().optional(),
  tiempoLimiteSegundos: z
    .number()
    .int()
    .min(TIEMPO_LIMITE_WEBHOOK.min)
    .max(TIEMPO_LIMITE_WEBHOOK.max)
    .optional(),
  incluirCorreo: z.boolean().optional(),
  entregarRenovaciones: z.boolean().optional(),
  instrucciones: z.string().max(1000).nullable().optional(),
});
export type ConfiguracionProveedor = z.output<typeof configuracionProveedorSchema>;

/** Lee la configuración guardada; lo que no sea válido vuelve al valor por defecto. */
export interface ConfiguracionEntregaLeida {
  webhookUrl: string | null;
  tiempoLimiteSegundos: number;
  incluirCorreo: boolean;
  entregarRenovaciones: boolean;
  instrucciones: string | null;
}

export function leerConfiguracionProveedor(v: unknown): ConfiguracionEntregaLeida {
  const r = configuracionProveedorSchema.safeParse(v ?? {});
  const c = r.success ? r.data : {};
  return {
    webhookUrl: c.webhookUrl ?? null,
    tiempoLimiteSegundos: c.tiempoLimiteSegundos ?? TIEMPO_LIMITE_WEBHOOK.defecto,
    incluirCorreo: c.incluirCorreo ?? false,
    entregarRenovaciones: c.entregarRenovaciones ?? true,
    instrucciones: c.instrucciones ?? null,
  };
}
