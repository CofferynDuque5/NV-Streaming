import { z } from 'zod';
import { uuidSchema } from './esquemas/comunes.js';
import { MONEDAS } from './monedas.js';

/**
 * Importación del Gestor viejo (fase G6). Se parte de la «Copia para NV
 * Streaming» o de la «Copia completa» (JSON) del Gestor: el archivo se lee en el
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

export type TipoContactoGestor = 'whatsapp' | 'correo' | 'telegram' | 'telefono';
export interface ContactoGestor {
  tipo: TipoContactoGestor;
  valor: string;
}
/** El Gestor guarda hasta 3 contactos por cliente. */
export const MAX_CONTACTOS_GESTOR = 3;

export interface ClienteGestor {
  nombre: string;
  /** El contacto principal: identifica al cliente entre cuentas y lotes. */
  contacto: ContactoGestor | null;
  /** Todos sus contactos (el principal primero), sin repetir. */
  contactos: ContactoGestor[];
  /** Quién trajo al cliente (revendedor, vendedor), como en el Gestor. */
  responsable: string | null;
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
  /** Plan familiar (Spotify, YouTube, Google One…): correo propio del miembro unido al cupo. */
  usuarioMiembro: string | null;
  /** Clave propia del miembro, si el Gestor la tenía. */
  claveMiembro: string | null;
}

export interface CuentaGestor {
  origenId: string;
  usuario: string;
  clave: string;
  modo: 'perfiles' | 'completa';
  /** Posición de la cuenta en su plataforma del Gestor (0 = la primera). */
  orden: number;
  facturaEn: string | null;
  costoUsd: string;
  plan: string | null;
  pais: string | null;
  metodoPago: string | null;
  proveedor: string | null;
  caida: boolean;
  /** Pendiente por revisar (p. ej. su correo también está en otro lugar con cliente). */
  revisar: string | null;
  /** Estaba en la papelera del Gestor: entra «retirada». Fecha en que se borró, si se sabe. */
  papelera: { borradaEn: string | null; clientes: string[] } | null;
  perfiles: PerfilGestor[];
}

/** Por qué un cliente del Gestor entra sin perfil. */
export type MotivoSueltoGestor =
  'sin_cuenta' | 'cuenta_borrada' | 'cuenta_sin_correo' | 'repetida' | 'papelera';

/**
 * Cliente del Gestor que no queda en ningún perfil (no tenía cuenta, su cuenta
 * se borró, no tenía correo o era de una cuenta repetida). Entra como cliente,
 * con sus contactos, y una nota con su vencimiento y lo que paga.
 */
export interface ClienteSueltoGestor extends ClienteGestor {
  origenId: string;
  motivo: MotivoSueltoGestor;
  /** Si estaba en la papelera: cuándo se borró. */
  borradoEn?: string | null;
}

export interface PlataformaGestor {
  origenId: string;
  nombre: string;
  cuentas: CuentaGestor[];
  /** Clientes que entran sin perfil (ver `ClienteSueltoGestor`). */
  clientesSueltos: ClienteSueltoGestor[];
}

/** Lo que se guarda como clave cuando el Gestor no la tenía (p. ej. invitaciones por correo). */
export const CLAVE_VACIA_GESTOR = '(sin clave en el Gestor)';

/** Plataformas que se venden por unión de cupos (principal + miembros a su correo), no por perfiles. */
export const PLATAFORMA_CUPOS =
  /spotify|youtube|google\s*one|gemini|deezer|apple\s*music|tidal|office|microsoft\s*365|m365/i;

/** Dominio del correo provisional de una cuenta que en el Gestor no tenía correo. */
export const DOMINIO_SIN_CORREO_GESTOR = 'sin-correo.gestor.invalid';
const correoProvisional = (id: string) =>
  `${id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'cuenta'}@${DOMINIO_SIN_CORREO_GESTOR}`;
export const esCorreoProvisionalGestor = (u: string) =>
  u.toLowerCase().endsWith(`@${DOMINIO_SIN_CORREO_GESTOR}`);

/** Número escrito sin código de país en el Gestor al que se le puso el código elegido. */
export interface NumeroSupuestoGestor {
  plataforma: string;
  cliente: string;
  escrito: string;
  guardado: string;
}

export interface RespaldoGestor {
  plataformas: PlataformaGestor[];
  /** Números locales («0414…») que tomaron el código de país elegido: para revisar. */
  numerosSupuestos: NumeroSupuestoGestor[];
  /** Lo que no se puede importar, con el motivo. Nunca lleva claves. */
  avisos: string[];
  /** Correos que están en más de un lugar con cliente: se importan marcados para revisar. */
  pendientes: PendienteGestor[];
}

export interface PendienteGestor {
  correo: string;
  /** Dónde aparece: «Spotify · miembro de la cuenta 19: Valde». */
  lugares: string[];
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
/** Igual que el panel: usuario de Telegram sin la @. */
const RX_TELEGRAM = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

function numeroGestor(t: string, prefijo: string): string | null {
  let n = t.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  else if (n.startsWith('0')) n = `${prefijo}${n.slice(1)}`;
  else if (!n.startsWith('+')) n = `+${n}`;
  return /^\+\d{7,15}$/.test(n) ? n : null;
}

/**
 * Contacto del cliente: correo, número de WhatsApp con código de país o
 * usuario de Telegram. Un número local («0412…») toma el prefijo indicado
 * (+58 por defecto). `canal` es el tipo que eligió el Gestor (whatsapp,
 * telegram, email); sin él, «@usuario» es Telegram como en el Gestor.
 * Un número marcado como Telegram queda como teléfono: Telegram solo se
 * guarda por usuario.
 */
export function contactoGestor(
  v: unknown,
  prefijo = '+58',
  canal?: unknown,
): ContactoGestor | null {
  const t = texto(v);
  if (!t) return null;
  const c = texto(canal).toLowerCase();
  if (RX_CORREO.test(t)) return { tipo: 'correo', valor: t.toLowerCase() };
  const usuarioTg = t.replace(/^@+/, '').replace(/^https?:\/\/t\.me\//i, '');
  if (c === 'telegram' || c === 'tg' || t.startsWith('@') || /^https?:\/\/t\.me\//i.test(t)) {
    if (RX_TELEGRAM.test(usuarioTg)) return { tipo: 'telegram', valor: usuarioTg.toLowerCase() };
    if (/[a-z]/i.test(usuarioTg)) return null;
    const n = numeroGestor(t, prefijo);
    return n ? { tipo: 'telefono', valor: n } : null;
  }
  if (/[a-z]/i.test(t.replace(/^wa\.me\//i, ''))) return null;
  const n = numeroGestor(t, prefijo);
  return n ? { tipo: 'whatsapp', valor: n } : null;
}

/**
 * Los contactos del cliente: la lista `contactos` de la «Copia para NV
 * Streaming» o, en la copia de siempre, contacto/contacto2/contacto3 con
 * su tipoContacto. Sin repetir y el principal primero.
 */
export function contactosGestor(s: Record<string, unknown>, prefijo = '+58'): ContactoGestor[] {
  const crudos: [unknown, unknown][] = Array.isArray(s.contactos)
    ? (s.contactos as unknown[])
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => [x.valor, x.tipo])
    : [
        [s.contacto, s.tipoContacto],
        [s.contacto2, s.tipoContacto2],
        [s.contacto3, s.tipoContacto3],
      ];
  const out: ContactoGestor[] = [];
  for (const [v, canal] of crudos) {
    const c = contactoGestor(v, prefijo, canal);
    if (c && !out.some((x) => x.tipo === c.tipo && x.valor === c.valor)) out.push(c);
    if (out.length === MAX_CONTACTOS_GESTOR) break;
  }
  return out;
}

const PIN = /^\d{4,8}$/;
const LIBRE = /^(sin asignar|libre|disponible)?$/i;

/** «Tarjeta ···· 1234» o el método escrito; nunca un número de tarjeta completo. */
function metodoPago(o: Obj): string | null {
  const m = texto(o.metodoPago).toLowerCase();
  const digitos = texto(o.tarjetaDigitos).replace(/\D/g, '').slice(-4);
  if (m === 'tarjeta') return digitos ? `Tarjeta ···· ${digitos}` : 'Tarjeta';
  if (m === 'paypal') return 'PayPal';
  const otro = m === 'otro' ? texto(o.otroMetodo) || 'Otro' : texto(o.metodoPago);
  if (!otro || /\d{9,}/.test(otro.replace(/[\s-]/g, ''))) return null;
  return otro.slice(0, 60);
}

/** Cuántos contactos escritos trae el cliente en el Gestor (válidos o no). */
function contactosEscritos(s: Obj): number {
  if (Array.isArray(s.contactos))
    return s.contactos.filter((x) => esObj(x) && texto(x.valor)).length;
  return [s.contacto, s.contacto2, s.contacto3].filter((v) => texto(v)).length;
}

/** Los números escritos sin código («0414…»): toman el prefijo elegido. */
function numerosLocales(s: Obj, prefijo: string): { escrito: string; guardado: string }[] {
  const crudos: unknown[] = Array.isArray(s.contactos)
    ? (s.contactos as unknown[]).filter(esObj).map((x) => x.valor)
    : [s.contacto, s.contacto2, s.contacto3];
  const out: { escrito: string; guardado: string }[] = [];
  for (const v of crudos) {
    const t = texto(v);
    const n = t.replace(/[^\d+]/g, '');
    if (/[a-z@]/i.test(t) || !/^0[1-9]/.test(n)) continue;
    const guardado = numeroGestor(n, prefijo);
    if (guardado) out.push({ escrito: t, guardado });
  }
  return out;
}

function cliente(
  s: Obj,
  prefijo: string,
  malos?: (quien: string) => void,
  supuesto?: (cliente: string, n: { escrito: string; guardado: string }) => void,
): ClienteGestor | null {
  const nombre = [texto(s.nombre), texto(s.apellido)].filter(Boolean).join(' ').slice(0, 120);
  if (LIBRE.test(texto(s.nombre))) return null;
  const contactos = contactosGestor(s, prefijo);
  for (const n of numerosLocales(s, prefijo)) supuesto?.(nombre, n);
  if (contactos.length < Math.min(contactosEscritos(s), MAX_CONTACTOS_GESTOR)) malos?.(nombre);
  const responsable = texto(s.responsable).replace(/\s+/g, ' ').slice(0, 60);
  return {
    nombre,
    contacto: contactos[0] ?? null,
    contactos,
    responsable: responsable || null,
    venceEn: fechaGestor(s.vencimientoCliente),
    precioUsd: montoGestor(s.precioVenta),
  };
}

/** Orden del perfil en su cuenta: `ordenPerfil` de la copia nueva o `slotIndex`. */
function posicionPerfil(s: Obj): number {
  for (const k of ['ordenPerfil', 'slotIndex']) {
    const v = s[k];
    if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return Number.MAX_SAFE_INTEGER;
}

/** La papelera del Gestor: `{ clientes, cuentas }` o una lista con `tipo`. */
function papeleraGestor(v: unknown): { cuentas: Obj[]; clientes: Obj[] } {
  if (Array.isArray(v)) {
    const l = lista(v);
    return {
      cuentas: l.filter((x) => x.tipo === 'cuenta'),
      clientes: l.filter((x) => x.tipo === 'cliente'),
    };
  }
  if (!esObj(v)) return { cuentas: [], clientes: [] };
  return { cuentas: lista(v.cuentas), clientes: lista(v.clientes) };
}

/** Los cupos que tenía una cuenta borrada (`_clients` o el texto `_clientsJson`). */
function hijosPapelera(a: Obj): Obj[] {
  if (Array.isArray(a._clients)) return lista(a._clients);
  if (typeof a._clientsJson === 'string') {
    try {
      return lista(JSON.parse(a._clientsJson));
    } catch {
      return [];
    }
  }
  return [];
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
  const numerosSupuestos: NumeroSupuestoGestor[] = [];
  const plataformas: PlataformaGestor[] = [];
  const pap = papeleraGestor(db.papelera);
  const idsPlat = new Set(plats.map((p) => texto(p.id)));
  const sinPlat = [...pap.cuentas, ...pap.clientes].filter(
    (x) => !idsPlat.has(texto(x._platId ?? x.platId)),
  ).length;
  if (sinPlat) {
    avisos.push(
      `Papelera: ${sinPlat === 1 ? 'un elemento es' : `${sinPlat} elementos son`} de una plataforma que ya no existe y no se ${sinPlat === 1 ? 'importa' : 'importan'}.`,
    );
  }
  for (const p of plats) {
    const pid = texto(p.id);
    const nombrePlat = texto(p.name ?? p.nombre) || pid;
    if (!pid) continue;
    const slots = lista(clientesPor[pid]);
    const cuentas: CuentaGestor[] = [];
    const sueltos: ClienteSueltoGestor[] = [];
    const malos: string[] = [];
    let sinClave = 0;
    let sinCorreo = 0;
    let descartados = 0;
    const contactoMalo = (quien: string) => {
      malos.push(quien);
    };
    const soltar = (s: Obj, motivo: MotivoSueltoGestor) => {
      const c = cliente(s, prefijo, contactoMalo, supuesto);
      if (c) sueltos.push({ ...c, origenId: texto(s.id) || `${pid}:${sueltos.length}`, motivo });
      return c !== null;
    };
    const supuesto = (cli: string, n: { escrito: string; guardado: string }) =>
      numerosSupuestos.push({ plataforma: nombrePlat, cliente: cli, ...n });

    for (const [orden, a] of lista(cuentasPor[pid]).entries()) {
      let usuario = texto(a.email);
      let clave = typeof a.password === 'string' ? a.password : '';
      const propios = slots
        .filter((s) => texto(s.accountId) === texto(a.id))
        .sort((x, y) => posicionPerfil(x) - posicionPerfil(y));
      if (!usuarioValido(usuario)) {
        usuario = correoProvisional(texto(a.id) || `${pid}-${orden}`);
        sinCorreo += 1;
      }
      // Plan familiar: el cupo 1 es la Principal y los demás, miembros.
      const conCupos = PLATAFORMA_CUPOS.test(nombrePlat);
      if (!clave) {
        clave = CLAVE_VACIA_GESTOR;
        sinClave += 1;
      }
      if (propios.length > MAX_PERFILES_GESTOR) {
        avisos.push(
          `${nombrePlat}: una cuenta tiene ${propios.length} perfiles; se importan los primeros ${MAX_PERFILES_GESTOR}.`,
        );
      }
      const maxCupo = Math.max(0, ...propios.map((x) => Number(x.slotIndex) || 0));
      const declarados = Math.min(
        MAX_PERFILES_GESTOR,
        Math.max(1, Number(a.numProfiles) || 0, propios.length, conCupos ? maxCupo : 0),
      );
      // Unión de cupos: cada miembro va en su cupo (1 = Principal); los demás, en orden.
      const enCupo: (Obj | undefined)[] = conCupos
        ? Array(declarados).fill(undefined)
        : [...propios];
      if (conCupos) {
        const resto: Obj[] = [];
        for (const x of propios) {
          const i = Number(x.slotIndex) - 1;
          if (Number.isInteger(i) && i >= 0 && i < declarados && !enCupo[i]) enCupo[i] = x;
          else resto.push(x);
        }
        for (const x of resto) {
          const i = enCupo.findIndex((y) => !y);
          if (i >= 0) enCupo[i] = x;
        }
      }
      const perfiles: PerfilGestor[] = Array.from({ length: declarados }, (_, i) => {
        const s = enCupo[i];
        const etiqueta = s ? texto(s.email) : '';
        // Correo propio del miembro (unido al plan con su correo), distinto al de la cuenta.
        const propio =
          s &&
          etiqueta.includes('@') &&
          usuarioValido(etiqueta) &&
          etiqueta.toLowerCase() !== usuario.toLowerCase()
            ? etiqueta
            : null;
        const cli = s ? cliente(s, prefijo, contactoMalo, supuesto) : null;
        if (conCupos && !cli && propio) descartados += 1;
        const claveS = s && typeof s.password === 'string' ? s.password : '';
        return {
          origenId: s ? texto(s.id) || `${texto(a.id)}#${i + 1}` : `${texto(a.id)}#${i + 1}`,
          numero: i + 1,
          nombre: (/^perfil\s*\d*$/i.test(etiqueta) || !etiqueta || etiqueta.includes('@')
            ? conCupos
              ? i === 0
                ? 'Principal'
                : `Miembro ${i}`
              : `Perfil ${i + 1}`
            : etiqueta
          ).slice(0, 40),
          pin: s && PIN.test(texto(s.pin)) ? texto(s.pin) : null,
          cliente: cli,
          // Unión de cupos: un correo unido sin cliente se descarta (el cupo queda libre).
          usuarioMiembro: conCupos && !cli ? null : propio,
          claveMiembro:
            (conCupos && !cli) || !propio || !claveS || claveS === clave
              ? null
              : claveS.slice(0, 200),
        };
      });
      cuentas.push({
        origenId: texto(a.id),
        usuario,
        clave,
        // La copia nueva marca «completa» la cuenta de un solo perfil que tiene un cliente.
        modo: texto(a.tipoCuenta) === 'completa' ? 'completa' : 'perfiles',
        orden: Number.isInteger(a.orden) ? (a.orden as number) : orden,
        facturaEn: fechaGestor(a.facturacion ?? a.expiry),
        costoUsd: montoGestor(a.costoCuenta ?? a.cost),
        plan: texto(a.plan).slice(0, 60) || null,
        pais: /^[A-Za-z]{2}$/.test(texto(a.pais)) ? texto(a.pais).toUpperCase() : null,
        metodoPago: metodoPago(a),
        proveedor: texto(a.proveedor).slice(0, 120) || null,
        caida: a.caidaReportada === true,
        revisar: null,
        papelera: null,
        perfiles,
      });
    }

    // Cuentas individuales: la cuenta entera es de un cliente y vive en la lista de clientes.
    const idsCuenta = new Set(lista(cuentasPor[pid]).map((a) => texto(a.id)));
    const porCupos = PLATAFORMA_CUPOS.test(nombrePlat);
    let ordenInd = lista(cuentasPor[pid]).length;
    for (const s of slots) {
      const conCuenta = texto(s.accountId) && idsCuenta.has(texto(s.accountId));
      if (conCuenta) continue;
      if (texto(s.accountId)) {
        soltar(s, 'cuenta_borrada');
        continue;
      }
      // En las plataformas de unión de cupos (Spotify, YouTube, Google One, Gemini, Office 365…)
      // un cliente sin cuenta pero con correo propio es una cuenta a su correo; si está
      // «Sin asignar», es una cuenta disponible para vender (con su correo y costo).
      const aSuCorreo =
        usuarioValido(texto(s.email)) &&
        texto(s.email).includes('@') &&
        (porCupos || (s.costoCuenta ?? s.cost ?? null) !== null);
      if (s.isClientAccount !== true && !aSuCorreo) {
        soltar(s, 'sin_cuenta');
        continue;
      }
      let usuario = texto(s.email);
      let clave = typeof s.password === 'string' ? s.password : '';
      if (!usuarioValido(usuario)) {
        usuario = correoProvisional(`ind-${texto(s.id)}`);
        sinCorreo += 1;
      }
      if (!clave) {
        clave = CLAVE_VACIA_GESTOR;
        sinClave += 1;
      }
      ordenInd += 1;
      cuentas.push({
        origenId: `ind:${texto(s.id)}`,
        usuario,
        clave,
        modo: 'completa',
        orden: Number.isInteger(s.ordenCuenta) ? (s.ordenCuenta as number) : ordenInd,
        facturaEn: fechaGestor(s.facturacion),
        costoUsd: montoGestor(s.costoCuenta ?? s.cost),
        plan: texto(s.plan).slice(0, 60) || null,
        pais: /^[A-Za-z]{2}$/.test(texto(s.pais)) ? texto(s.pais).toUpperCase() : null,
        metodoPago: metodoPago(s),
        proveedor: texto(s.proveedor).slice(0, 120) || null,
        caida: s.caidaReportada === true,
        revisar: null,
        papelera: null,
        perfiles: [
          {
            origenId: texto(s.id),
            numero: 1,
            nombre: 'Cuenta completa',
            pin: PIN.test(texto(s.pin)) ? texto(s.pin) : null,
            cliente: cliente(s, prefijo, contactoMalo, supuesto),
            usuarioMiembro: null,
            claveMiembro: null,
          },
        ],
      });
    }
    // Papelera: las cuentas borradas entran «retiradas» (con sus cupos libres) y los
    // clientes borrados, como clientes sin perfil con una nota.
    const dePlat = (x: Obj) => texto(x._platId ?? x.platId) === pid;
    let nPapCuentas = 0;
    for (const a of pap.cuentas.filter(dePlat)) {
      let usuario = texto(a.email);
      if (!usuarioValido(usuario) || !usuario.includes('@'))
        usuario = correoProvisional(`pap-${texto(a.id)}`);
      const clave = typeof a.password === 'string' && a.password ? a.password : CLAVE_VACIA_GESTOR;
      const hijos = hijosPapelera(a).sort((x, y) => posicionPerfil(x) - posicionPerfil(y));
      const n = Math.min(
        MAX_PERFILES_GESTOR,
        Math.max(1, Number(a.numProfiles ?? a.profiles) || 0, hijos.length),
      );
      const conCupos = PLATAFORMA_CUPOS.test(nombrePlat);
      nPapCuentas += 1;
      cuentas.push({
        origenId: `pap:${texto(a.id)}`,
        usuario,
        clave,
        modo: texto(a.tipoCuenta) === 'completa' ? 'completa' : 'perfiles',
        orden: 100_000 - nPapCuentas,
        facturaEn: fechaGestor(a.facturacion ?? a.expiry),
        costoUsd: montoGestor(a.costoCuenta ?? a.cost),
        plan: texto(a.plan).slice(0, 60) || null,
        pais: /^[A-Za-z]{2}$/.test(texto(a.pais)) ? texto(a.pais).toUpperCase() : null,
        metodoPago: metodoPago(a),
        proveedor: texto(a.proveedor).slice(0, 120) || null,
        caida: a.caidaReportada === true,
        revisar: null,
        papelera: {
          borradaEn: fechaGestor(texto(a._deletedAt).slice(0, 10)),
          clientes: hijos
            .filter((h) => !LIBRE.test(texto(h.nombre)))
            .map((h) => `${texto(h.nombre)} ${texto(h.apellido)}`.trim().slice(0, 80))
            .slice(0, 50),
        },
        perfiles: Array.from({ length: n }, (_, i) => {
          const h = hijos[i];
          return {
            origenId: `pap:${texto(a.id)}#${i + 1}`,
            numero: i + 1,
            nombre: conCupos ? (i === 0 ? 'Principal' : `Miembro ${i}`) : `Perfil ${i + 1}`,
            pin: h && PIN.test(texto(h.pin)) ? texto(h.pin) : null,
            cliente: null,
            usuarioMiembro: null,
            claveMiembro: null,
          };
        }),
      });
    }
    let nPapClientes = 0;
    for (const c of pap.clientes.filter(dePlat)) {
      const cl = cliente(c, prefijo, contactoMalo, supuesto);
      if (!cl) continue;
      nPapClientes += 1;
      sueltos.push({
        ...cl,
        origenId: `pap:${texto(c.id) || `${pid}:${nPapClientes}`}`,
        motivo: 'papelera',
        borradoEn: fechaGestor(texto(c._deletedAt).slice(0, 10)),
      });
    }
    if (nPapCuentas || nPapClientes) {
      avisos.push(
        `${nombrePlat}: de la papelera entran ${[
          nPapCuentas
            ? `${nPapCuentas} ${nPapCuentas === 1 ? 'cuenta retirada' : 'cuentas retiradas'}`
            : '',
          nPapClientes
            ? `${nPapClientes} ${nPapClientes === 1 ? 'cliente borrado' : 'clientes borrados'} (sin perfil, con nota)`
            : '',
        ]
          .filter(Boolean)
          .join(' y ')}.`,
      );
    }
    if (descartados) {
      avisos.push(
        `${nombrePlat}: ${descartados === 1 ? 'un correo unido no tiene' : `${descartados} correos unidos no tienen`} cliente y se ${descartados === 1 ? 'descarta' : 'descartan'} (los cupos quedan libres).`,
      );
    }
    if (sinCorreo) {
      avisos.push(
        `${nombrePlat}: ${sinCorreo === 1 ? 'una cuenta no tiene' : `${sinCorreo} cuentas no tienen`} correo en el Gestor; ${sinCorreo === 1 ? 'entra' : 'entran'} con un correo provisional (…@${DOMINIO_SIN_CORREO_GESTOR}) y sus clientes y cupos, para que le pongas el correo real.`,
      );
    }
    if (sinClave) {
      avisos.push(
        `${nombrePlat}: ${sinClave === 1 ? 'una cuenta no tiene' : `${sinClave} cuentas no tienen`} clave en el Gestor; ${sinClave === 1 ? 'entra' : 'entran'} con la clave «${CLAVE_VACIA_GESTOR}» para que la completes.`,
      );
    }
    const porMotivo = (m: MotivoSueltoGestor) => sueltos.filter((x) => x.motivo === m).length;
    const nSin = porMotivo('sin_cuenta');
    const nBorr = porMotivo('cuenta_borrada');
    if (nSin) {
      avisos.push(
        `${nombrePlat}: ${nSin === 1 ? 'un cliente no tiene' : `${nSin} clientes no tienen`} cuenta asignada; ${nSin === 1 ? 'entra' : 'entran'} como cliente sin perfil, con una nota de su vencimiento.`,
      );
    }
    if (nBorr) {
      avisos.push(
        `${nombrePlat}: ${nBorr === 1 ? 'un cliente estaba' : `${nBorr} clientes estaban`} en una cuenta que ya no existe; ${nBorr === 1 ? 'entra' : 'entran'} como cliente sin perfil.`,
      );
    }
    if (malos.length) {
      const nombres = [...new Set(malos.filter(Boolean))];
      avisos.push(
        `${nombrePlat}: ${malos.length === 1 ? 'un cliente tiene' : `${malos.length} clientes tienen`} un contacto que no se entiende (número sin código o usuario de Telegram muy corto); se importa sin ese contacto${nombres.length ? `: ${nombres.slice(0, 20).join(', ')}${nombres.length > 20 ? '…' : ''}` : ''}.`,
      );
    }
    plataformas.push({
      origenId: pid,
      nombre: nombrePlat.slice(0, 80),
      cuentas,
      clientesSueltos: sueltos,
    });
  }

  // Un mismo correo dos veces (en la misma u otra plataforma) se importa una sola vez.
  const vistos = new Set<string>();
  const repetidas: { correo: string; lugar: string }[] = [];
  let papRepetidas = 0;
  for (const p of plataformas) {
    p.cuentas = p.cuentas.filter((c) => {
      if (c.papelera) return true;
      const k = c.usuario.toLowerCase();
      if (vistos.has(k)) {
        // Sus clientes no se pierden: entran sin perfil en esta plataforma.
        const suyos = c.perfiles.filter((x) => x.cliente);
        repetidas.push({
          correo: k,
          lugar: `${p.nombre} · cuenta repetida${suyos.length ? `: ${suyos.map((x) => x.cliente!.nombre).join(', ')} (entran sin perfil)` : ' sin clientes'}`,
        });
        for (const x of suyos) {
          p.clientesSueltos.push({ ...x.cliente!, origenId: x.origenId, motivo: 'repetida' });
        }
        avisos.push(
          `${p.nombre}: una cuenta con un correo que ya está en otra plataforma se importa una sola vez${suyos.length ? `; ${suyos.length === 1 ? 'su cliente entra' : `sus ${suyos.length} clientes entran`} sin perfil` : ''}.`,
        );
        return false;
      }
      vistos.add(k);
      return true;
    });
  }
  // Una cuenta de la papelera con el correo de una que sigue activa no se duplica.
  for (const p of plataformas) {
    p.cuentas = p.cuentas.filter((c) => {
      if (!c.papelera) return true;
      const k = c.usuario.toLowerCase();
      if (vistos.has(k)) {
        papRepetidas += 1;
        return false;
      }
      vistos.add(k);
      return true;
    });
  }
  if (papRepetidas) {
    avisos.push(
      `Papelera: ${papRepetidas === 1 ? 'una cuenta borrada tiene' : `${papRepetidas} cuentas borradas tienen`} el correo de una cuenta que sigue activa; no se ${papRepetidas === 1 ? 'duplica' : 'duplican'}.`,
    );
  }
  const pendientes = pendientesGestor(plataformas, repetidas);
  return { plataformas, avisos, numerosSupuestos, pendientes };
}

/**
 * Correos que aparecen en más de un lugar con cliente (cuenta, cuenta a correo del
 * cliente o miembro de un cupo). Marca esas cuentas «pendiente por revisar».
 */
function pendientesGestor(
  plataformas: PlataformaGestor[],
  repetidas: { correo: string; lugar: string }[],
): PendienteGestor[] {
  const lugares = new Map<string, { lugar: string; cuenta: CuentaGestor }[]>();
  const poner = (correo: string, lugar: string, cuenta: CuentaGestor) => {
    const k = correo.toLowerCase();
    if (esCorreoProvisionalGestor(k)) return;
    lugares.set(k, [...(lugares.get(k) ?? []), { lugar, cuenta }]);
  };
  for (const p of plataformas) {
    for (const [i, c] of p.cuentas.filter((x) => !x.papelera).entries()) {
      const nombres = c.perfiles.filter((x) => x.cliente).map((x) => x.cliente!.nombre);
      const etiqueta = c.origenId.startsWith('ind:') ? 'a correo del cliente' : `cuenta ${i + 1}`;
      if (nombres.length) poner(c.usuario, `${p.nombre} · ${etiqueta}: ${nombres.join(', ')}`, c);
      for (const x of c.perfiles) {
        if (x.usuarioMiembro && x.cliente)
          poner(
            x.usuarioMiembro,
            `${p.nombre} · miembro de la ${etiqueta}: ${x.cliente.nombre}`,
            c,
          );
      }
    }
  }
  const out: PendienteGestor[] = [];
  for (const [correo, l] of lugares) {
    const extra = repetidas.filter((r) => r.correo === correo).map((r) => r.lugar);
    if (l.length + extra.length < 2) continue;
    const todos = [...l.map((x) => x.lugar), ...extra];
    for (const x of l) {
      x.cuenta.revisar = `Pendiente por revisar: el correo ${correo} también está en ${todos
        .filter((t) => t !== x.lugar)
        .join(' | ')}`.slice(0, 300);
    }
    out.push({ correo, lugares: todos });
  }
  for (const r of repetidas) {
    if (!lugares.has(r.correo)) out.push({ correo: r.correo, lugares: [r.lugar] });
  }
  return out.sort((a, b) => a.correo.localeCompare(b.correo));
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
    sinPerfil: (p.clientesSueltos ?? []).length,
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

const contactoGestorSchema = z.object({
  tipo: z.enum(['whatsapp', 'correo', 'telegram', 'telefono']),
  valor: z.string().trim().min(3).max(254),
});

const clienteGestorSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  contacto: contactoGestorSchema.nullable(),
  contactos: z.array(contactoGestorSchema).max(MAX_CONTACTOS_GESTOR).default([]),
  responsable: z.string().trim().max(60).nullable().default(null),
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
  usuarioMiembro: z.string().trim().min(3).max(254).nullable().default(null),
  claveMiembro: z.string().min(1).max(200).nullable().default(null),
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
  orden: z.number().int().min(0).max(100_000).default(0),
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
  revisar: z.string().max(300).nullable().default(null),
  papelera: z
    .object({
      borradaEn: fecha,
      clientes: z.array(z.string().max(80)).max(50),
    })
    .nullable()
    .default(null),
  perfiles: z.array(perfilGestorSchema).min(1).max(MAX_PERFILES_GESTOR),
});

const clienteSueltoGestorSchema = clienteGestorSchema.extend({
  origenId: z.string().min(1).max(120),
  motivo: z.enum(['sin_cuenta', 'cuenta_borrada', 'cuenta_sin_correo', 'repetida', 'papelera']),
  borradoEn: fecha.optional(),
});

/** Clientes sin perfil que se importan de una vez. */
export const MAX_SUELTOS_LOTE_GESTOR = 2000;

export const importarGestorSchema = z
  .object({
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
      .max(MAX_CUENTAS_LOTE_GESTOR, `Máximo ${MAX_CUENTAS_LOTE_GESTOR} cuentas por envío.`),
    clientesSueltos: z.array(clienteSueltoGestorSchema).max(MAX_SUELTOS_LOTE_GESTOR).default([]),
  })
  .refine((e) => e.cuentas.length + e.clientesSueltos.length > 0, {
    message: 'La plataforma no tiene cuentas ni clientes para importar.',
    path: ['cuentas'],
  });
export type ImportarGestorEntrada = z.infer<typeof importarGestorSchema>;

/** Cuadre de una simulación o de una importación hecha. */
export interface CuadreGestor {
  cuentas: { enArchivo: number; nuevas: number; yaEstaban: number; yaImportadas: number };
  perfiles: { nuevos: number; libres: number; asignados: number };
  clientes: { nuevos: number; existentes: number; sinContacto: number; sinPerfil?: number };
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
