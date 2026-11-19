/**
 * «Migración a NV Streaming» del Gestor (formato `nv-gestor-migracion` 2.x).
 *
 * El archivo trae `manifiesto` (conteos y SHA-256 de cada sección), `secciones`
 * (sin correos de cuentas, claves ni PIN) y `credenciales` (cifradas con una
 * frase del dueño). El navegador verifica los hashes y descifra; aquí, sin red
 * ni criptografía, se vuelve a armar la copia con la misma forma que el Gestor
 * tiene en memoria (`{ db: { platforms, accounts, clients } }`) para pasarla por
 * `leerRespaldoGestor`, que ya replica las reglas del Gestor.
 */

export const FORMATO_MIGRACION_GESTOR = 'nv-gestor-migracion';
/** Versiones mayores que este importador entiende. */
export const VERSIONES_MIGRACION_GESTOR = [2] as const;

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(esObj) : []);
const texto = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

export interface SeccionManifiesto {
  registros: number;
  sha256: string;
}

export interface SobreCredenciales {
  alg: string;
  kdf: string;
  iteraciones: number;
  sal: string;
  iv: string;
  sha256: string;
}

export interface ArchivoMigracionGestor {
  manifiesto: {
    formato: string;
    version: string;
    creadoEn: string;
    origen: Obj;
    conteos: Record<string, unknown>;
    secciones: Record<string, SeccionManifiesto>;
    avisos: string[];
    recursosPendientes: Obj[];
    credenciales: SobreCredenciales;
    sha256: string;
  };
  secciones: Record<string, unknown>;
  /** Base64 del texto cifrado (AES-256-GCM). */
  credenciales: string;
}

export interface CredencialesMigracion {
  cuentas: Record<string, { usuario?: string; clave?: string; tarjetaDigitos?: string }>;
  perfiles: Record<
    string,
    { usuario?: string; clave?: string; pin?: string; tarjetaDigitos?: string }
  >;
  sinAnotar?: Record<string, { usuario?: string; clave?: string }>;
  /**
   * Secretos de la papelera. 8.5.1: por ruta (`password`, `_clientsJson/2/pin`).
   * 8.5.0: por clave, en listas (solo los del primer nivel quedaban fuera del texto).
   */
  papelera?: Record<string, Record<string, unknown>>;
}

const esJsonTexto = (v: unknown): v is string => typeof v === 'string' && /^\s*[[{]/.test(v);

/** Pone `v` en la ruta `a/b/0/c`, entrando también en textos JSON (como `_clientsJson`). */
function ponerEnRuta(o: unknown, segs: string[], v: unknown): unknown {
  if (!segs.length) return v;
  const [k, ...resto] = segs as [string, ...string[]];
  if (esJsonTexto(o)) {
    try {
      return JSON.stringify(ponerEnRuta(JSON.parse(o), segs, v));
    } catch {
      return o;
    }
  }
  if (Array.isArray(o)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= o.length) return o;
    const c = [...o];
    c[i] = ponerEnRuta(c[i], resto, v);
    return c;
  }
  if (!esObj(o)) return o;
  if (k === '__proto__' || k === 'constructor' || k === 'prototype') return o;
  return { ...o, [k]: resto.length ? ponerEnRuta(o[k], resto, v) : v };
}

/** Devuelve a un elemento de la papelera sus correos, claves y PIN. */
function restaurarPapelera(item: Obj, sec: Record<string, unknown> | undefined): Obj {
  let o: Obj = { ...item };
  for (const [ruta, v] of Object.entries(sec ?? {})) {
    if (Array.isArray(v)) {
      if (!ruta.includes('/') && v.length) o = ponerEnRuta(o, [ruta], v[0]) as Obj;
      continue;
    }
    o = ponerEnRuta(o, ruta.split('/').filter(Boolean), v) as Obj;
  }
  return o;
}

/** ¿Es una «Migración a NV Streaming»? Lanza si es de una versión que no se entiende. */
export function esMigracionGestor(json: unknown): json is ArchivoMigracionGestor {
  if (!esObj(json) || !esObj(json.manifiesto)) return false;
  const m = json.manifiesto;
  if (m.formato !== FORMATO_MIGRACION_GESTOR) return false;
  const mayor = Number(texto(m.version).split('.')[0]);
  if (!(VERSIONES_MIGRACION_GESTOR as readonly number[]).includes(mayor))
    throw new Error(
      `La migración es de la versión ${texto(m.version) || '?'} y este panel lee la 2. Actualiza NV Streaming o genera la copia otra vez.`,
    );
  if (
    !esObj(json.secciones) ||
    typeof json.credenciales !== 'string' ||
    !esObj(m.secciones) ||
    !esObj(m.credenciales)
  )
    throw new Error('El archivo de migración está incompleto (falta una parte).');
  return true;
}

/** JSON canónico (claves ordenadas a todo nivel): el mismo que usa el Gestor para los hashes. */
export function canonicoGestor(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicoGestor).join(',')}]`;
  const o = v as Obj;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicoGestor(o[k])}`)
    .join(',')}}`;
}

/**
 * Vuelve a armar `{ db: { platforms, accounts, clients } }` con los registros
 * originales del Gestor y sus credenciales descifradas, en el mismo orden.
 */
export function reconstruirMigracionGestor(
  archivo: ArchivoMigracionGestor,
  cred: CredencialesMigracion,
): {
  db: {
    platforms: Obj[];
    accounts: Record<string, Obj[]>;
    clients: Record<string, Obj[]>;
    papelera: { cuentas: Obj[]; clientes: Obj[] };
  };
} {
  const S = archivo.secciones;
  const cc = esObj(cred.cuentas) ? cred.cuentas : {};
  const cp = esObj(cred.perfiles) ? cred.perfiles : {};
  const platforms: Obj[] = [];
  const accounts: Record<string, Obj[]> = {};
  const clients: Record<string, Obj[]> = {};

  const plats = lista(S.plataformas).sort((a, b) => Number(a.orden) - Number(b.orden));
  for (const p of plats) {
    const id = texto(p.id);
    if (!id) continue;
    const original = esObj(p.original) ? p.original : {};
    platforms.push({ ...original, id, name: texto(p.nombre) || id });
    accounts[id] = [];
    clients[id] = [];
  }

  const cuentas = lista(S.cuentas).sort((a, b) => Number(a.orden) - Number(b.orden));
  for (const c of cuentas) {
    const pid = texto(c.plataformaId);
    const id = texto(c.id);
    if (!accounts[pid] || !id) continue;
    if (c.tipo === 'individual') continue; // vive en clients, como en el Gestor
    const original = esObj(c.original) ? c.original : {};
    const k = cc[id] ?? {};
    accounts[pid].push({
      ...original,
      id,
      email: k.usuario ?? '',
      password: k.clave ?? '',
      ...(k.tarjetaDigitos ? { tarjetaDigitos: k.tarjetaDigitos } : {}),
      orden: Number(c.orden),
    });
  }

  for (const s of lista(S.perfiles)) {
    const pid = texto(s.plataformaId);
    const id = texto(s.id);
    if (!clients[pid] || !id) continue;
    const original: Obj = esObj(s.original) ? { ...s.original } : {};
    const k = cp[id] ?? {};
    const cuentaId = texto(s.cuentaId);
    const individual = cuentaId.startsWith('ind:');
    const perfil: Obj = { ...original, id };
    if (k.usuario) perfil.email = k.usuario;
    if (k.clave) perfil.password = k.clave;
    if (k.pin) perfil.pin = k.pin;
    if (k.tarjetaDigitos) perfil.tarjetaDigitos = k.tarjetaDigitos;
    if (individual) {
      const usuario = cc[cuentaId]?.usuario;
      const clave = cc[cuentaId]?.clave;
      if (usuario) perfil.email = usuario;
      if (clave) perfil.password = clave;
      perfil.accountId = '';
      perfil.isClientAccount = true;
    } else if (Number.isInteger(s.posicion)) {
      perfil.ordenPerfil = (s.posicion as number) - 1;
    }
    clients[pid].push(perfil);
  }

  // Papelera (las «Cuentas sin anotar» no se importan).
  const cpap = esObj(cred.papelera) ? cred.papelera : {};
  const papelera = { cuentas: [] as Obj[], clientes: [] as Obj[] };
  for (const x of lista(S.papelera)) {
    const r = restaurarPapelera(x, cpap[texto(x.id)]);
    if (r.tipo === 'cuenta') papelera.cuentas.push(r);
    else if (r.tipo === 'cliente') papelera.clientes.push(r);
  }
  return { db: { platforms, accounts, clients, papelera } };
}

export interface ComparacionMigracion {
  concepto: string;
  enGestor: number;
  enArchivo: number;
  seImporta: number;
}

/**
 * Cuadre origen contra destino: lo que dice el manifiesto del Gestor, lo que trae
 * el archivo y lo que `leerRespaldoGestor` deja para importar.
 */
export function compararMigracion(
  archivo: ArchivoMigracionGestor,
  leido: {
    plataformas: {
      cuentas: { perfiles: { pin: string | null; cliente: unknown }[]; papelera?: unknown }[];
      clientesSueltos?: { motivo: string }[];
    }[];
  },
): ComparacionMigracion[] {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const c = archivo.manifiesto.conteos;
  const S = archivo.secciones;
  const cuentas = leido.plataformas.flatMap((p) => p.cuentas).filter((x) => !x.papelera);
  const perfiles = cuentas.flatMap((x) => x.perfiles);
  const perfilesArchivo = lista(S.perfiles);
  return [
    {
      concepto: 'Plataformas',
      enGestor: n(c.plataformas),
      enArchivo: lista(S.plataformas).length,
      seImporta: leido.plataformas.length,
    },
    {
      concepto: 'Cuentas',
      enGestor: n(c.cuentas),
      enArchivo: lista(S.cuentas).length,
      seImporta: cuentas.length,
    },
    {
      concepto: 'Perfiles con cliente',
      enGestor: n(c.perfilesAsignados),
      enArchivo: perfilesArchivo.filter((p) => p.libre !== true).length,
      seImporta: perfiles.filter((p) => p.cliente).length,
    },
    {
      // Clientes que el Gestor tenía sin cuenta (o en una cuenta sin datos): entran sin perfil.
      concepto: 'Clientes sin perfil',
      enGestor: 0,
      enArchivo: 0,
      seImporta: leido.plataformas.reduce(
        (s, p) => s + (p.clientesSueltos ?? []).filter((x) => x.motivo !== 'papelera').length,
        0,
      ),
    },
    {
      concepto: 'Papelera',
      enGestor: n(c.papelera),
      enArchivo: lista(S.papelera).length,
      seImporta: leido.plataformas.reduce(
        (s, p) =>
          s +
          (p.clientesSueltos ?? []).filter((x) => x.motivo === 'papelera').length +
          p.cuentas.filter((x) => x.papelera).length,
        0,
      ),
    },
    {
      concepto: 'PIN',
      enGestor: n(c.pines),
      enArchivo: perfilesArchivo.filter((p) => p.tienePin === true).length,
      seImporta: perfiles.filter((p) => p.pin).length,
    },
  ];
}
