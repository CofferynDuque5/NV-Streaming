/**
 * Lectura de la lista de cuentas que manda el proveedor (TXT o CSV), como
 * «Verificar con TXT» del Gestor. Corre en el navegador: el archivo no se
 * sube, solo las filas leídas cuando se pide revisarlas contra el panel.
 *
 * Acepta lo que suelen mandar los proveedores:
 *   correo:clave 25/10/2026 · correo | clave | 2026-10-25 · bloques con
 *   «Correo: … / Contraseña: … / Vence: …» · fechas como 25-10-26, 25/10,
 *   25 oct 2026 o «25 de octubre». Cada correo toma la fecha y la clave de
 *   su línea o de las siguientes, hasta el próximo correo.
 */

/** Filas que se revisan o importan de una vez. */
export const MAX_FILAS_IMPORTAR = 300;
/** Tamaño máximo del archivo o del texto pegado. */
export const MAX_BYTES_IMPORTAR = 512 * 1024;

export interface FilaArchivoCuenta {
  /** Correo o usuario, en minúsculas. */
  usuario: string;
  clave: string | null;
  /** «AAAA-MM-DD»: vencimiento o próximo cobro que trae el archivo. */
  fecha: string | null;
  /** Primera línea del archivo donde aparece (desde 1). */
  linea: number;
  /** Veces que aparece; más de una suele ser un error del proveedor. */
  veces: number;
}

const MESES: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
};

const RX_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** «Clave: x», «pass = x»… La palabra va suelta, para no leer «mypassword1» como clave. */
const RX_CLAVE =
  /(?:^|[^\p{L}\d])(?:contrase(?:ñ|n)a|clave|pass(?:word)?|pw)(?:\s*[:=]\s*|\s+)(\S+)/iu;
const DIA_MS = 86_400_000;

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const dos = (n: number) => String(n).padStart(2, '0');

/** Día, mes y año (año null si no lo trae). */
type Partes = [number | null, number, number];

const FORMATOS: { rx: RegExp; partes: (m: RegExpExecArray) => Partes | null }[] = [
  // 2026-10-25 · 2026/10/25
  { rx: /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/, partes: (m) => [+m[1]!, +m[2]!, +m[3]!] },
  // 25/10/2026 · 25-10-26 (si el «mes» pasa de 12, viene al revés)
  {
    rx: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/,
    partes: (m) => {
      let a = +m[3]!;
      if (a < 100) a += 2000;
      let d = +m[1]!;
      let me = +m[2]!;
      if (me > 12 && d <= 12) [d, me] = [me, d];
      return [a, me, d];
    },
  },
  // 25 oct 2026 · 25 de octubre · 25 de octubre de 2026
  {
    rx: /\b(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})\.?(?:\s*(?:de|del)?\s*(\d{4}))?\b/i,
    partes: (m) => {
      const mes = MESES[sinTildes(m[2]!)];
      return mes ? [m[3] ? +m[3] : null, mes, +m[1]!] : null;
    },
  },
  // 25/10 (sin año)
  {
    rx: /(?:^|[^\d/.-])(\d{1,2})[/-](\d{1,2})(?![/.\d-])/,
    partes: (m) => {
      let d = +m[1]!;
      let me = +m[2]!;
      if (me > 12 && d <= 12) [d, me] = [me, d];
      return [null, me, d];
    },
  },
];

/**
 * Primera fecha que aparece en el texto, en «AAAA-MM-DD». Sin año se toma el
 * de `hoy`, o el siguiente si así quedaría más de 200 días en el pasado.
 */
export function leerFechaProveedor(texto: string, hoy: string): string | null {
  const base = Date.parse(`${hoy}T00:00:00Z`);
  for (const { rx, partes } of FORMATOS) {
    const m = rx.exec(texto);
    if (!m) continue;
    const p = partes(m);
    if (!p) continue;
    let [a] = p;
    const [, me, d] = p;
    if (me < 1 || me > 12 || d < 1 || d > 31) continue;
    if (a === null) {
      a = Number(hoy.slice(0, 4));
      if (Date.UTC(a, me - 1, d) - base < -200 * DIA_MS) a++;
    }
    const f = new Date(Date.UTC(a, me - 1, d));
    if (f.getUTCMonth() !== me - 1 || a < 2000 || a > 2100) continue;
    return `${a}-${dos(me)}-${dos(d)}`;
  }
  return null;
}

const quitarCorreos = (l: string) => l.replace(RX_CORREO, ' ');

function claveDeLinea(linea: string, usuario: string, hoy: string): string | null {
  const m = RX_CLAVE.exec(linea);
  if (m) return m[1]!;
  const i = linea.toLowerCase().indexOf(usuario);
  if (i < 0) return null;
  const resto = linea.slice(i + usuario.length).replace(/^\s*[:|;,\t\-–]+\s*|^\s+/, '');
  const t = (resto.split(/\s*[|;,\t]\s*|\s+/)[0] ?? '').trim();
  if (!t || leerFechaProveedor(t, hoy) || /^(vence|vencimiento|hasta|fecha|perfil|pin)/i.test(t)) {
    return null;
  }
  return t;
}

function juntar(
  lista: FilaArchivoCuenta[],
  indice: Map<string, FilaArchivoCuenta>,
  f: FilaArchivoCuenta,
) {
  const x = indice.get(f.usuario);
  if (!x) {
    indice.set(f.usuario, f);
    lista.push(f);
    return;
  }
  x.veces += f.veces;
  if (f.fecha && (!x.fecha || f.fecha > x.fecha)) x.fecha = f.fecha;
  if (!x.clave && f.clave) x.clave = f.clave;
}

/** Texto libre: cada correo con la clave y la fecha que tenga cerca. */
export function leerTxtProveedor(texto: string, hoy: string): FilaArchivoCuenta[] {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const marcas: { u: string; i: number }[] = [];
  lineas.forEach((l, i) => {
    for (const m of l.matchAll(RX_CORREO))
      marcas.push({ u: m[0].toLowerCase().replace(/\.+$/, ''), i });
  });
  const lista: FilaArchivoCuenta[] = [];
  const indice = new Map<string, FilaArchivoCuenta>();
  marcas.forEach((mk, k) => {
    const sig = marcas[k + 1];
    const fin = sig ? sig.i : Math.min(lineas.length, mk.i + 6);
    const linea = lineas[mk.i]!;
    let fecha = leerFechaProveedor(quitarCorreos(linea), hoy);
    let clave = claveDeLinea(linea, mk.u, hoy);
    if (!sig || sig.i !== mk.i) {
      for (let j = mk.i + 1; j < fin && j < mk.i + 8; j++) {
        const lj = lineas[j]!;
        fecha ??= leerFechaProveedor(quitarCorreos(lj), hoy);
        clave ??= RX_CLAVE.exec(lj)?.[1] ?? null;
      }
    }
    juntar(lista, indice, { usuario: mk.u, clave, fecha, linea: mk.i + 1, veces: 1 });
  });
  return lista;
}

/** Filas y columnas de un CSV (separador «;», «,», tabulador o «|»; comillas dobles). */
export function partirCsv(texto: string): string[][] | null {
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const primera = t.split('\n').find((l) => l.trim()) ?? '';
  const [sep, veces] = [';', ',', '\t', '|']
    .map((c) => [c, primera.split(c).length - 1] as const)
    .sort((a, b) => b[1] - a[1])[0]!;
  if (!veces) return null;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (comillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += ch;
    } else if (ch === '"' && !campo.trim()) {
      comillas = true;
      campo = '';
    } else if (ch === sep) {
      fila.push(campo.trim());
      campo = '';
    } else if (ch === '\n') {
      fila.push(campo.trim());
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo.trim());
    filas.push(fila);
  }
  return filas.filter((f) => f.some(Boolean));
}

function columna(cabecera: string[], patrones: RegExp[]) {
  for (const rx of patrones) {
    const i = cabecera.findIndex((c) => rx.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** ¿Parece CSV? Por la extensión o porque las primeras filas tienen las mismas columnas. */
export function pareceCsv(texto: string, nombre?: string): boolean {
  if (nombre && /\.csv$/i.test(nombre)) return true;
  const l = texto
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((x) => x.trim())
    .slice(0, 6);
  if (l.length < 2) return false;
  return [';', ',', '\t'].some((c) => {
    const n = l[0]!.split(c).length;
    return n >= 3 && l.every((x) => x.split(c).length === n);
  });
}

const tieneCorreo = (x: string) => new RegExp(RX_CORREO.source).test(x);

/**
 * CSV con títulos (correo/email/usuario, clave/contraseña, vence/fecha): se
 * usan esas columnas, y la de usuario acepta usuarios sin «@». Sin títulos,
 * cada fila se lee como una línea de texto.
 */
export function leerCsvProveedor(texto: string, hoy: string): FilaArchivoCuenta[] | null {
  const filas = partirCsv(texto);
  if (!filas?.length) return null;
  const cab = filas[0]!.map(sinTildes);
  const cU = columna(cab, [
    /^(correo|email|e-mail|mail)\b/,
    /(correo|email|mail|usuario|cuenta|user)/,
  ]);
  if (cU < 0 || tieneCorreo(filas[0]![cU] ?? '')) {
    return leerTxtProveedor(filas.map((f) => f.join(' | ')).join('\n'), hoy);
  }
  const cF = columna(cab, [/(venc|expira|caduc|hasta|corte|renov|fin\b|termina|cobro)/, /fecha/]);
  const cK = columna(cab, [/(contrasena|contrase|clave|password|pass\b|pwd)/]);
  const lista: FilaArchivoCuenta[] = [];
  const indice = new Map<string, FilaArchivoCuenta>();
  filas.slice(1).forEach((f, n) => {
    const crudo = (f[cU] ?? '').trim();
    const correo = new RegExp(RX_CORREO.source).exec(crudo)?.[0];
    const usuario = (correo ?? crudo).toLowerCase().replace(/\.+$/, '');
    if (usuario.length < 3 || /\s/.test(usuario)) return;
    const fecha =
      cF >= 0
        ? leerFechaProveedor(f[cF] ?? '', hoy)
        : leerFechaProveedor(quitarCorreos(f.join(' | ')), hoy);
    const clave = cK >= 0 ? (f[cK] ?? '').trim() || null : null;
    juntar(lista, indice, { usuario, clave, fecha, linea: n + 2, veces: 1 });
  });
  return lista;
}

/** Lee un archivo del proveedor, TXT o CSV. */
export function leerArchivoProveedor(
  texto: string,
  hoy: string,
  nombre?: string,
): FilaArchivoCuenta[] {
  return pareceCsv(texto, nombre)
    ? (leerCsvProveedor(texto, hoy) ?? leerTxtProveedor(texto, hoy))
    : leerTxtProveedor(texto, hoy);
}
