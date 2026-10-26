import { z } from 'zod';
import { uuidSchema } from './esquemas/comunes.js';

/**
 * Lector de pedidos con reglas locales (fase G5): convierte el texto que
 * manda un cliente o revendedor («2 netflix 1 mes para Ana») en pedidos
 * propuestos. Corre en el navegador con el catálogo y las palabras que el
 * equipo le enseñó; no envía el texto a ningún servicio de IA. Nada se
 * crea hasta que el equipo revisa y confirma cada línea.
 */

/** Texto más largo que se lee de una vez. */
export const MAX_TEXTO_PEDIDO = 4000;

export interface ServicioLector {
  id: string;
  nombre: string;
  slug: string;
}

export interface PlanLector {
  id: string;
  servicioId: string;
  nombre: string;
  duracionCantidad: number;
  duracionUnidad: 'dia' | 'mes';
}

/** «plus» es Spotify: palabra que el equipo enseñó al lector. */
export interface AliasLector {
  palabra: string;
  servicioId: string;
}

export interface PedidoLeido {
  /** Trozo del texto de donde sale. */
  origen: string;
  servicioId: string | null;
  /** Plan sugerido del servicio (el equipo puede cambiarlo). */
  planId: string | null;
  cantidad: number;
  /** Meses que pide; null si no lo dice. */
  meses: number | null;
  renovar: boolean;
  /** Nombre de la persona final, si lo dice («para Ana Pérez»). */
  cliente: string | null;
  correo: string | null;
  /** Por qué la línea necesita revisión. */
  dudas: string[];
}

/** «cuando diga plus es Spotify»: palabra nueva que se puede guardar. */
export interface AliasPropuesto {
  palabra: string;
  servicioId: string | null;
  texto: string;
}

export interface LecturaPedido {
  pedidos: PedidoLeido[];
  alias: AliasPropuesto[];
  /** Trozos que parecen un pedido pero sin servicio reconocible. */
  sinServicio: string[];
}

/** Minúsculas, sin tildes y con un solo espacio. */
export const normalizarPalabra = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NUMEROS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  doce: 12,
};

const RX_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RX_ENSENAR =
  /^\s*(?:cuando\s+(?:diga|digan|escriba|escriban|pida|pidan)|si\s+dice)\s+[«"']?(.+?)[»"']?\s+(?:es|son|significa)\s+(.+?)\s*\.?\s*$/i;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const numero = (t: string | undefined): number | null => {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  return NUMEROS[t] ?? null;
};

/** Meses que pide el trozo: «3 meses», «un mes», «anual», «trimestral»… */
function leerMeses(t: string): number | null {
  const m = /\b(\d{1,2}|un|una|uno|dos|tres|cuatro|seis|doce)\s*(?:mes|meses|m)\b/.exec(t);
  if (m) return numero(m[1]);
  if (/\b(anual|un ano|1 ano|12 meses)\b/.test(t)) return 12;
  if (/\bsemestr/.test(t)) return 6;
  if (/\btrimestr/.test(t)) return 3;
  if (/\bmensual\b/.test(t)) return 1;
  return null;
}

interface Nombre {
  servicioId: string;
  rx: RegExp;
  largo: number;
}

function nombres(servicios: ServicioLector[], alias: AliasLector[]): Nombre[] {
  const lista: Nombre[] = [];
  const agregar = (texto: string, servicioId: string) => {
    const n = normalizarPalabra(texto);
    if (n.length < 2) return;
    // «disney+» y «disney plus» también valen como «disney».
    const base = escapar(n).replace(/\\\+$/, '(?:\\+| plus)?');
    lista.push({
      servicioId,
      rx: new RegExp(`(?:^|[^a-z0-9])(${base})(?![a-z0-9])`),
      largo: n.length,
    });
  };
  for (const s of servicios) {
    agregar(s.nombre, s.id);
    agregar(s.slug.replace(/-/g, ' '), s.id);
    // «NV Cine» se reconoce también por «cine».
    const partes = normalizarPalabra(s.nombre).split(' ');
    if (partes.length > 1) agregar(partes.at(-1)!, s.id);
  }
  for (const a of alias) agregar(a.palabra, a.servicioId);
  // Primero los nombres más largos: «disney plus» antes que «plus».
  return lista.sort((a, b) => b.largo - a.largo);
}

function buscarServicio(t: string, lista: Nombre[]) {
  for (const n of lista) {
    const m = n.rx.exec(t);
    if (m)
      return { servicioId: n.servicioId, indice: m.index + m[0].indexOf(m[1]!), palabra: m[1]! };
  }
  return null;
}

/** Plan del servicio que mejor encaja con lo que dice el trozo. */
function elegirPlan(t: string, planes: PlanLector[], meses: number | null) {
  if (!planes.length) return { planId: null, duda: 'El servicio no tiene planes activos.' };
  const porNombre = planes.filter((p) =>
    normalizarPalabra(p.nombre)
      .split(' ')
      .some((w) => w.length >= 2 && !/^\d+$/.test(w) && new RegExp(`\\b${escapar(w)}\\b`).test(t)),
  );
  const conMeses = (l: PlanLector[]) =>
    meses === null
      ? l
      : l.filter((p) => p.duracionUnidad === 'mes' && p.duracionCantidad === meses);
  const candidatos = [conMeses(porNombre), porNombre, conMeses(planes)].find((l) => l.length);
  if (candidatos?.length === 1) return { planId: candidatos[0]!.id, duda: null };
  if (candidatos?.length) {
    return { planId: candidatos[0]!.id, duda: 'Hay varios planes posibles: revisa cuál es.' };
  }
  if (planes.length === 1) {
    return {
      planId: planes[0]!.id,
      duda: meses
        ? `No hay plan de ${meses} ${meses === 1 ? 'mes' : 'meses'}: revisa la cantidad.`
        : null,
    };
  }
  return { planId: null, duda: 'Elige el plan.' };
}

/** «para Ana Pérez», «a nombre de Luis»: nombre tal como viene en el texto original. */
function leerCliente(original: string): string | null {
  const m =
    /\b(?:[Pp]ara|[Aa] nombre de|[Cc]liente:?)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+){0,2})/u.exec(
      original,
    );
  return m ? m[1]! : null;
}

/** Trozos de un pedido: cada línea, y dentro de ella «, », «;», « y » y « + ». */
function trozos(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((l) =>
      l.split(/\s*[;,]\s*|\s+(?:y|e|\+)\s+(?=(?:\d+|un|una|uno|dos|tres|cuatro|cinco)\b)/i),
    )
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Lee el texto y propone pedidos. Puro: mismo texto y catálogo, mismo resultado. */
export function leerPedido(
  texto: string,
  servicios: ServicioLector[],
  planes: PlanLector[],
  alias: AliasLector[] = [],
): LecturaPedido {
  const lista = nombres(servicios, alias);
  const pedidos: PedidoLeido[] = [];
  const propuestos: AliasPropuesto[] = [];
  const sinServicio: string[] = [];
  let anterior: PedidoLeido | null = null;

  for (const original of trozos(texto.slice(0, MAX_TEXTO_PEDIDO))) {
    const ensenar = RX_ENSENAR.exec(original);
    if (ensenar) {
      const destino = buscarServicio(normalizarPalabra(ensenar[2]!), lista);
      propuestos.push({
        palabra: normalizarPalabra(ensenar[1]!),
        servicioId: destino?.servicioId ?? null,
        texto: original,
      });
      continue;
    }
    const t = normalizarPalabra(original);
    const encontrado = buscarServicio(t, lista);
    const correo = RX_CORREO.exec(original)?.[0].toLowerCase() ?? null;
    const cliente = leerCliente(original);
    if (!encontrado) {
      // «para Ana» o un correo sueltos completan el pedido anterior.
      if (
        anterior &&
        (cliente || correo) &&
        !leerMeses(t) &&
        !/\d/.test(t.replace(RX_CORREO, ''))
      ) {
        anterior.cliente ??= cliente;
        anterior.correo ??= correo;
        anterior.origen += `, ${original}`;
      } else if (
        /\d|\b(?:un|una|uno|dos|tres|mes|meses|perfil|perfiles|cuenta|cuentas|renov)\b/.test(t)
      ) {
        sinServicio.push(original);
      }
      continue;
    }
    const antes = t.slice(0, encontrado.indice).trim().split(' ');
    const previa = antes.at(-1) === 'de' || antes.at(-1) === 'x' ? antes.at(-2) : antes.at(-1);
    const sinCorreo = t.replace(new RegExp(escapar(correo ?? '\u0000'), 'g'), ' ');
    const cantidad =
      numero(previa?.replace(/x$/, '')) ??
      numero(
        /\b(\d{1,2})\s*(?:perfil|perfiles|cuenta|cuentas|pantalla|pantallas)\b/.exec(
          sinCorreo,
        )?.[1],
      ) ??
      numero(/\bx\s*(\d{1,2})\b/.exec(sinCorreo)?.[1]) ??
      1;
    const meses = leerMeses(sinCorreo);
    const delServicio = planes.filter((p) => p.servicioId === encontrado.servicioId);
    const plan = elegirPlan(sinCorreo, delServicio, meses);
    const dudas = [plan.duda].filter((d): d is string => Boolean(d));
    if (cantidad > 20) dudas.push(`¿De verdad son ${cantidad}?`);
    const pedido: PedidoLeido = {
      origen: original,
      servicioId: encontrado.servicioId,
      planId: plan.planId,
      cantidad: Math.min(Math.max(cantidad, 1), 50),
      meses,
      renovar: /\b(renov\w*|vence\w*|extender|extiende|recarg\w*)\b/.test(t),
      cliente,
      correo,
      dudas,
    };
    pedidos.push(pedido);
    anterior = pedido;
  }
  return { pedidos, alias: propuestos, sinServicio };
}

export const MAX_ALIAS_SERVICIO = 300;

export const aliasServicioSchema = z.object({
  palabra: z
    .string({ error: 'Escribe la palabra.' })
    .transform(normalizarPalabra)
    .pipe(
      z
        .string()
        .min(2, 'Escribe la palabra.')
        .max(40, 'Máximo 40 caracteres.')
        .refine((v) => !RX_CORREO.test(v), 'No uses correos como palabra.'),
    ),
  servicioId: uuidSchema,
});
export type AliasServicioEntrada = z.infer<typeof aliasServicioSchema>;

export interface AliasServicioPublico {
  id: string;
  palabra: string;
  servicio: { id: string; nombre: string };
  creadoEn: string;
}
