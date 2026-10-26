import { z } from 'zod';
import { uuidSchema } from './esquemas/comunes.js';
import { MONEDAS } from './monedas.js';

/**
 * Importación del Gestor viejo (fase G6). Se parte de la «Copia completa»
 * (JSON) que el Gestor ya permite descargar: el archivo se lee en el
 * navegador y al panel solo llegan, plataforma por plataforma, las cuentas,
 * perfiles y clientes que se van a importar. Nada se escribe hasta confirmar
 * la simulación, y cada importación queda en un lote que se puede deshacer.
 */

/** Tamaño máximo del archivo de respaldo (los íconos en base64 lo engordan). */
export const MAX_BYTES_RESPALDO_GESTOR = 40 * 1024 * 1024;
/** Cuentas que se importan de una vez (una plataforma por envío). */
export const MAX_CUENTAS_LOTE_GESTOR = 400;
/** El panel admite hasta 20 perfiles por cuenta. */
export const MAX_PERFILES_GESTOR = 20;

export type TipoContactoGestor = 'whatsapp' | 'correo';

export interface ClienteGestor {
  nombre: string;
  contacto: { tipo: TipoContactoGestor; valor: string } | null;
  /** «AAAA-MM-DD»: hasta cuándo pagó el cliente. */
  venceEn: string | null;
  /** Lo que paga el cliente, en USD (informativo para el cuadre). */
  precioUsd: string;
}

export interface PerfilGestor {
  origenId: string;
  numero: number;
  nombre: string;
  pin: string | null;
  cliente: ClienteGestor | null;
}

export interface CuentaGestor {
  origenId: string;
  usuario: string;
  clave: string;
  modo: 'perfiles' | 'completa';
  facturaEn: string | null;
  costoUsd: string;
  plan: string | null;
  pais: string | null;
  metodoPago: string | null;
  proveedor: string | null;
  caida: boolean;
  perfiles: PerfilGestor[];
}

export interface PlataformaGestor {
  origenId: string;
  nombre: string;
  cuentas: CuentaGestor[];
}

export interface RespaldoGestor {
  plataformas: PlataformaGestor[];
  /** Lo que no se puede importar, con el motivo. Nunca lleva claves. */
  avisos: string[];
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(esObj) : []);

/** «AAAA-MM-DD» si la fecha existe; acepta también «DD/MM/AAAA». */
export function fechaGestor(v: unknown): string | null {
  const t = texto(v);
  let a: string | undefined, m: string | undefined, d: string | undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  const lat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (iso) [, a, m, d] = iso;
  else if (lat) [, d, m, a] = lat;
  else return null;
  const f = `${a}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const fecha = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(f) ? f : null;
}

/** Importe en USD con 2 decimales; «0» si no hay o no es válido. */
export function montoGestor(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(texto(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n.toFixed(2) : '0';
}

const RX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Contacto del cliente: correo, o número de WhatsApp con código de país.
 * Un número local («0412…») toma el prefijo indicado (+58 por defecto).
 */
export function contactoGestor(
  v: unknown,
  prefijo = '+58',
): { tipo: TipoContactoGestor; valor: string } | null {
  const t = texto(v);
  if (!t) return null;
  if (RX_CORREO.test(t)) return { tipo: 'correo', valor: t.toLowerCase() };
  if (/[a-z]/i.test(t.replace(/^wa\.me\//i, ''))) return null;
  let n = t.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  else if (n.startsWith('0')) n = `${prefijo}${n.slice(1)}`;
  else if (!n.startsWith('+')) n = `+${n}`;
  return /^\+\d{7,15}$/.test(n) ? { tipo: 'whatsapp', valor: n } : null;
}

const PIN = /^\d{4,8}$/;
const LIBRE = /^(sin asignar|libre|disponible)?$/i;

/** «Tarjeta ···· 1234» o el método escrito; nunca un número de tarjeta completo. */
function metodoPago(o: Obj): string | null {
  const m = texto(o.metodoPago).toLowerCase();
  const digitos = texto(o.tarjetaDigitos).replace(/\D/g, '').slice(-4);
  if (m === 'tarjeta') return digitos ? `Tarjeta ···· ${digitos}` : 'Tarjeta';
  const otro = m === 'otro' ? texto(o.otroMetodo) : texto(o.metodoPago);
  if (!otro || /\d{9,}/.test(otro.replace(/[\s-]/g, ''))) return null;
  return otro.slice(0, 60);
}

function cliente(s: Obj, prefijo: string): ClienteGestor | null {
  const nombre = [texto(s.nombre), texto(s.apellido)].filter(Boolean).join(' ').slice(0, 120);
  if (LIBRE.test(texto(s.nombre))) return null;
  return {
    nombre,
    contacto: contactoGestor(s.contacto, prefijo),
    venceEn: fechaGestor(s.vencimientoCliente),
    precioUsd: montoGestor(s.precioVenta),
  };
}

const usuarioValido = (u: string) => u.length >= 3 && u.length <= 254 && !/\s/.test(u);

/**
 * Lee la «Copia completa» del Gestor (formato nuevo `{ db: { platforms,
 * accounts, clients } }` o el viejo `{ plataformas, cuentas, clientes }`).
 * Puro: no usa red ni guarda nada.
 */
export function leerRespaldoGestor(json: unknown, prefijo = '+58'): RespaldoGestor {
  const raiz = esObj(json) ? json : {};
  const db = esObj(raiz.db) ? raiz.db : raiz;
  const plats = lista(db.platforms ?? db.plataformas);
  const cuentasPor = esObj(db.accounts ?? db.cuentas) ? ((db.accounts ?? db.cuentas) as Obj) : {};
  const clientesPor = esObj(db.clients ?? db.clientes) ? ((db.clients ?? db.clientes) as Obj) : {};
  if (!plats.length)
    throw new Error('El archivo no parece una copia del Gestor: no trae plataformas.');

  const avisos: string[] = [];
  const plataformas: PlataformaGestor[] = [];
  for (const p of plats) {
    const pid = texto(p.id);
    const nombrePlat = texto(p.name ?? p.nombre) || pid;
    if (!pid) continue;
    const slots = lista(clientesPor[pid]);
    const cuentas: CuentaGestor[] = [];

    for (const a of lista(cuentasPor[pid])) {
      const usuario = texto(a.email);
      const clave = typeof a.password === 'string' ? a.password : '';
      if (!usuarioValido(usuario) || !clave) {
        avisos.push(`${nombrePlat}: una cuenta sin correo o sin clave no se importa.`);
        continue;
      }
      const propios = slots
        .filter((s) => texto(s.accountId) === texto(a.id))
        .sort((x, y) => Number(x.slotIndex ?? 0) - Number(y.slotIndex ?? 0));
      if (propios.length > MAX_PERFILES_GESTOR) {
        avisos.push(
          `${nombrePlat}: una cuenta tiene ${propios.length} perfiles; se importan los primeros ${MAX_PERFILES_GESTOR}.`,
        );
      }
      const declarados = Math.min(
        MAX_PERFILES_GESTOR,
        Math.max(1, Number(a.numProfiles) || 0, propios.length),
      );
      const perfiles: PerfilGestor[] = Array.from({ length: declarados }, (_, i) => {
        const s = propios[i];
        const etiqueta = s ? texto(s.email) : '';
        return {
          origenId: s ? texto(s.id) || `${texto(a.id)}#${i + 1}` : `${texto(a.id)}#${i + 1}`,
          numero: i + 1,
          nombre: (/^perfil\s*\d*$/i.test(etiqueta) || !etiqueta || etiqueta.includes('@')
            ? `Perfil ${i + 1}`
            : etiqueta
          ).slice(0, 40),
          pin: s && PIN.test(texto(s.pin)) ? texto(s.pin) : null,
          cliente: s ? cliente(s, prefijo) : null,
        };
      });
      cuentas.push({
        origenId: texto(a.id),
        usuario,
        clave,
        modo: 'perfiles',
        facturaEn: fechaGestor(a.facturacion ?? a.expiry),
        costoUsd: montoGestor(a.costoCuenta ?? a.cost),
        plan: texto(a.plan).slice(0, 60) || null,
        pais: /^[A-Za-z]{2}$/.test(texto(a.pais)) ? texto(a.pais).toUpperCase() : null,
        metodoPago: metodoPago(a),
        proveedor: texto(a.proveedor).slice(0, 120) || null,
        caida: a.caidaReportada === true,
        perfiles,
      });
    }

    // Cuentas individuales: la cuenta entera es de un cliente y vive en la lista de clientes.
    const idsCuenta = new Set(lista(cuentasPor[pid]).map((a) => texto(a.id)));
    for (const s of slots) {
      const conCuenta = texto(s.accountId) && idsCuenta.has(texto(s.accountId));
      if (conCuenta) continue;
      if (texto(s.accountId)) {
        avisos.push(
          `${nombrePlat}: un perfil apunta a una cuenta que ya no existe y no se importa.`,
        );
        continue;
      }
      if (s.isClientAccount !== true) {
        if (!LIBRE.test(texto(s.nombre))) {
          avisos.push(`${nombrePlat}: un cliente sin cuenta asignada no se importa.`);
        }
        continue;
      }
      const usuario = texto(s.email);
      const clave = typeof s.password === 'string' ? s.password : '';
      if (!usuarioValido(usuario) || !clave) {
        avisos.push(`${nombrePlat}: una cuenta individual sin correo o sin clave no se importa.`);
        continue;
      }
      cuentas.push({
        origenId: `ind:${texto(s.id)}`,
        usuario,
        clave,
        modo: 'completa',
        facturaEn: fechaGestor(s.facturacion),
        costoUsd: montoGestor(s.costoCuenta ?? s.cost),
        plan: texto(s.plan).slice(0, 60) || null,
        pais: /^[A-Za-z]{2}$/.test(texto(s.pais)) ? texto(s.pais).toUpperCase() : null,
        metodoPago: metodoPago(s),
        proveedor: texto(s.proveedor).slice(0, 120) || null,
        caida: s.caidaReportada === true,
        perfiles: [
          {
            origenId: texto(s.id),
            numero: 1,
            nombre: 'Cuenta completa',
            pin: PIN.test(texto(s.pin)) ? texto(s.pin) : null,
            cliente: cliente(s, prefijo),
          },
        ],
      });
    }
    plataformas.push({ origenId: pid, nombre: nombrePlat.slice(0, 80), cuentas });
  }

  // Un mismo correo dos veces (en la misma u otra plataforma) se importa una sola vez.
  const vistos = new Set<string>();
  for (const p of plataformas) {
    p.cuentas = p.cuentas.filter((c) => {
      const k = c.usuario.toLowerCase();
      if (vistos.has(k)) {
        avisos.push(`${p.nombre}: una cuenta repetida se importa una sola vez.`);
        return false;
      }
      vistos.add(k);
      return true;
    });
  }
  return { plataformas, avisos };
}

/** Totales de una plataforma para mostrar antes de enviar. */
export function resumenPlataforma(p: PlataformaGestor) {
  const perfiles = p.cuentas.flatMap((c) => c.perfiles);
  const conCliente = perfiles.filter((x) => x.cliente);
  return {
    cuentas: p.cuentas.length,
    perfiles: perfiles.length,
    asignados: conCliente.length,
    costoUsd: p.cuentas.reduce((s, c) => s + Number(c.costoUsd), 0).toFixed(2),
    ventaUsd: conCliente.reduce((s, x) => s + Number(x.cliente!.precioUsd), 0).toFixed(2),
  };
}

// ── Lo que se envía al panel ───────────────────────────────────────────────

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => fechaGestor(d) === d, 'La fecha no existe.')
  .nullable();
const monto = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
const opcional = (max: number) => z.string().trim().max(max).nullable();

const clienteGestorSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  contacto: z
    .object({
      tipo: z.enum(['whatsapp', 'correo']),
      valor: z.string().trim().min(3).max(254),
    })
    .nullable(),
  venceEn: fecha,
  precioUsd: monto,
});

const perfilGestorSchema = z.object({
  origenId: z.string().min(1).max(120),
  numero: z.number().int().min(1).max(MAX_PERFILES_GESTOR),
  nombre: z.string().trim().min(1).max(40),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullable(),
  cliente: clienteGestorSchema.nullable(),
});

const cuentaGestorSchema = z.object({
  origenId: z.string().min(1).max(120),
  usuario: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .refine((v) => !/\s/.test(v)),
  clave: z.string().min(1).max(200),
  modo: z.enum(['perfiles', 'completa']),
  facturaEn: fecha,
  costoUsd: monto,
  plan: opcional(60),
  pais: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  metodoPago: opcional(60),
  proveedor: opcional(120),
  caida: z.boolean(),
  perfiles: z.array(perfilGestorSchema).min(1).max(MAX_PERFILES_GESTOR),
});

export const importarGestorSchema = z.object({
  plataforma: z.object({
    origenId: z.string().min(1).max(120),
    nombre: z.string().trim().min(1).max(80),
  }),
  /** Servicio del catálogo al que pasa la plataforma. */
  servicioId: uuidSchema,
  /** Plan con el que quedan las suscripciones de sus clientes. */
  planId: uuidSchema,
  moneda: z.enum(MONEDAS).default('USD'),
  cuentas: z
    .array(cuentaGestorSchema)
    .min(1, 'La plataforma no tiene cuentas para importar.')
    .max(MAX_CUENTAS_LOTE_GESTOR, `Máximo ${MAX_CUENTAS_LOTE_GESTOR} cuentas por envío.`),
});
export type ImportarGestorEntrada = z.infer<typeof importarGestorSchema>;

/** Cuadre de una simulación o de una importación hecha. */
export interface CuadreGestor {
  cuentas: { enArchivo: number; nuevas: number; yaEstaban: number; yaImportadas: number };
  perfiles: { nuevos: number; libres: number; asignados: number };
  clientes: { nuevos: number; existentes: number; sinContacto: number };
  suscripciones: { activas: number; vencidas: number };
  /** Suma de lo que cobra el proveedor por las cuentas nuevas (USD). */
  costoUsd: string;
  /** Suma de lo que pagan los clientes de los perfiles nuevos (USD). */
  ventaUsd: string;
  avisos: string[];
}

export interface LoteGestorPublico {
  id: string;
  plataforma: string;
  servicio: { id: string; nombre: string };
  cuadre: CuadreGestor;
  creadoEn: string;
  creadoPor: string | null;
  revertidoEn: string | null;
}
