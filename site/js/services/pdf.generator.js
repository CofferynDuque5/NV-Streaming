/**
 * pdf.generator.js — Generador de PDF autónomo (POO · sin dependencias).
 *
 * Motor de PDF 100% propio (licencia del proyecto, open-source, SIN marcas de
 * agua ni límites de pago ni CDN): escribe un archivo PDF 1.4 válido con fuentes
 * estándar Helvetica/Helvetica-Bold (WinAnsi/Latin-1), texto con ajuste de línea,
 * colores RGB, rectángulos y líneas, paginación automática y numeración de
 * página. Funciona offline (Live Server / file://) sin cargar nada externo.
 *
 * Diseñado con un cursor de escritura (x,y desde la esquina superior): cada
 * `texto()` avanza el cursor y salta de página solo cuando hace falta. La salida
 * se entrega como Blob para descarga directa en el cliente.
 */

const A4 = { w: 595.28, h: 841.89 };

// Sustituciones para caracteres fuera de Latin-1 (emoji, viñetas, comillas…).
const SUST = { "⚡": "*", "•": "-", "·": "-", "–": "-", "—": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "→": "->", "✓": "OK", "€": "EUR", "🛰": "", "️": "" };

function aLatin1(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xff) out += ch;
    else out += (SUST[ch] != null ? SUST[ch] : "?");
  }
  return out;
}
function esc(s) { return aLatin1(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

// Ancho aproximado de Helvetica (para el ajuste de línea), en 1/1000 de em.
const ANCHO_MED = 0.52; // promedio suficiente para maquetar limpio

export class GeneradorPDF {
  /** @param {{titulo?:string, subtitulo?:string, margen?:number}} [opts] */
  constructor(opts = {}) {
    this.W = A4.w; this.H = A4.h;
    this.margen = opts.margen || 46;
    this.titulo = opts.titulo || "";
    this.subtitulo = opts.subtitulo || "";
    this._paginas = [];
    this._topeInferior = 64; // reserva para el pie
    this._nuevaPaginaInterna();
  }

  _nuevaPaginaInterna() {
    this._pagina = { ops: [] };
    this._paginas.push(this._pagina);
    this.y = this.H - this.margen;
    this._encabezadoPagina();
  }

  /** Fuerza salto de página manual. */
  nuevaPagina() { this._nuevaPaginaInterna(); return this; }

  _rectOp(x, y, w, h, color) {
    const [r, g, b] = color;
    this._pagina.ops.push(`${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  _lineaOp(x1, y1, x2, y2, color, ancho = 0.8) {
    const [r, g, b] = color;
    this._pagina.ops.push(`${r} ${g} ${b} RG ${ancho} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  _textoOp(x, y, txt, size, bold, color) {
    const [r, g, b] = color;
    const f = bold ? "F2" : "F1";
    this._pagina.ops.push(`BT /${f} ${size} Tf ${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(txt)}) Tj ET`);
  }

  /** Banda de marca en la parte superior de cada página. */
  _encabezadoPagina() {
    this._rectOp(0, this.H - 34, this.W, 34, [0.02, 0.02, 0.06]);
    this._rectOp(0, this.H - 36, this.W, 2, [0, 0.82, 1]);
    this._textoOp(this.margen, this.H - 22, "NV STREAMING", 12, true, [0.62, 0.92, 1]);
    this._textoOp(this.margen + 96, this.H - 22, "Auditoria de Base de Datos", 9, false, [0.7, 0.75, 0.9]);
    this.y = this.H - 34 - 22;
  }

  _saltoSiHaceFalta(alto) {
    if (this.y - alto < this._topeInferior) this._nuevaPaginaInterna();
  }

  _anchoTexto(txt, size) { return aLatin1(txt).length * size * ANCHO_MED; }

  _envolver(txt, size, maxAncho) {
    const palabras = aLatin1(txt).split(/\s+/);
    const lineas = []; let linea = "";
    for (const p of palabras) {
      const prueba = linea ? linea + " " + p : p;
      if (this._anchoTexto(prueba, size) > maxAncho && linea) { lineas.push(linea); linea = p; }
      else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas.length ? lineas : [""];
  }

  /**
   * Escribe texto con ajuste de línea a partir del cursor.
   * @param {string} txt
   * @param {{size?:number,bold?:boolean,color?:number[],x?:number,gap?:number,maxAncho?:number}} [o]
   */
  texto(txt, o = {}) {
    const size = o.size || 10;
    const bold = !!o.bold;
    const color = o.color || [0.12, 0.13, 0.18];
    const x = o.x != null ? o.x : this.margen;
    const lh = size * 1.35;
    const maxAncho = o.maxAncho || (this.W - this.margen - x);
    for (const linea of this._envolver(txt, size, maxAncho)) {
      this._saltoSiHaceFalta(lh);
      this._textoOp(x, this.y - size, linea, size, bold, color);
      this.y -= lh;
    }
    if (o.gap) this.y -= o.gap;
    return this;
  }

  /** Dos columnas: etiqueta (izq) + valor (der, ajustado). */
  filaKV(k, v, o = {}) {
    const size = o.size || 9.5;
    const lh = size * 1.4;
    this._saltoSiHaceFalta(lh);
    this._textoOp(this.margen, this.y - size, aLatin1(k), size, true, o.colorK || [0.28, 0.5, 0.78]);
    const vx = this.margen + (o.anchoK || 130);
    const lineas = this._envolver(v, size, this.W - this.margen - vx);
    this._textoOp(vx, this.y - size, lineas[0], size, false, o.colorV || [0.16, 0.17, 0.22]);
    this.y -= lh;
    for (let i = 1; i < lineas.length; i++) { this._saltoSiHaceFalta(lh); this._textoOp(vx, this.y - size, lineas[i], size, false, o.colorV || [0.16, 0.17, 0.22]); this.y -= lh; }
    return this;
  }

  linea(o = {}) {
    this._saltoSiHaceFalta(8);
    this._lineaOp(this.margen, this.y - 2, this.W - this.margen, this.y - 2, o.color || [0.8, 0.84, 0.92], o.ancho || 0.6);
    this.y -= (o.gap != null ? o.gap : 8);
    return this;
  }

  salto(px) { this.y -= (px || 8); return this; }

  /** Barra/etiqueta de sección con fondo tenue (no invade el contenido previo). */
  seccion(txt, o = {}) {
    const alto = o.alto || 20;
    this.y -= 6;                       // aire respecto al bloque anterior
    this._saltoSiHaceFalta(alto + 8);
    const top = this.y;                // borde superior real de la banda
    this._rectOp(this.margen, top - alto, this.W - this.margen * 2, alto, o.bg || [0.93, 0.97, 1]);
    this._lineaOp(this.margen, top - alto, this.margen, top, o.acento || [0, 0.82, 1], 3);
    this._textoOp(this.margen + 10, top - alto + 6, aLatin1(txt), o.size || 11, true, o.color || [0.05, 0.32, 0.6]);
    this.y = top - alto - 8;
    return this;
  }

  /** Fila de tabla de 4 columnas (campo · tipo · presente · ejemplo). */
  filaTabla(cols, anchos, o = {}) {
    const size = o.size || 8.6;
    const lh = size * 1.5;
    this._saltoSiHaceFalta(lh);
    if (o.bg) this._rectOp(this.margen, this.y - lh + 4, this.W - this.margen * 2, lh, o.bg);
    let x = this.margen + 4;
    cols.forEach((c, i) => {
      const w = anchos[i];
      const t = this._envolver(String(c), size, w - 6)[0] || "";
      this._textoOp(x, this.y - size, t, size, !!o.bold, o.color || [0.16, 0.17, 0.22]);
      x += w;
    });
    this.y -= lh;
    return this;
  }

  _pie(indice, total) {
    const p = this._paginas[indice];
    const y = 30;
    p.ops.push(`0.8 0.84 0.92 RG 0.6 w ${this.margen} ${y + 12} m ${this.W - this.margen} ${y + 12} l S`);
    p.ops.push(`BT /F1 8 Tf 0.45 0.48 0.55 rg ${this.margen} ${y} Td (${esc("NV STREAMING - Nathan y Valeryn Streaming")}) Tj ET`);
    const der = `Pagina ${indice + 1} de ${total}`;
    p.ops.push(`BT /F1 8 Tf 0.45 0.48 0.55 rg ${(this.W - this.margen - der.length * 4.2).toFixed(2)} ${y} Td (${esc(der)}) Tj ET`);
  }

  /** Ensambla los bytes del PDF (Uint8Array). */
  bytes() {
    const total = this._paginas.length;
    for (let i = 0; i < total; i++) this._pie(i, total);

    const objetos = []; // objetos[k] = cuerpo del objeto (k+1)
    objetos[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    // 2: Pages (se completa luego). 3: Helvetica. 4: Helvetica-Bold.
    objetos[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

    const kids = [];
    let n = 5;
    for (const pag of this._paginas) {
      const contenido = pag.ops.join("\n");
      const contNum = n++, pageNum = n++;
      objetos[contNum - 1] = `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
      objetos[pageNum - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W.toFixed(2)} ${this.H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contNum} 0 R >>`;
      kids.push(`${pageNum} 0 R`);
    }
    objetos[1] = `<< /Type /Pages /Kids [ ${kids.join(" ")} ] /Count ${this._paginas.length} >>`;

    let pdf = "%PDF-1.4\n%âãÏÓ\n";
    const offsets = [];
    for (let i = 0; i < objetos.length; i++) {
      offsets[i] = pdf.length;
      pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`;
    }
    const xrefPos = pdf.length;
    const count = objetos.length + 1;
    pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 0; i < objetos.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }

  blob() { return new Blob([this.bytes()], { type: "application/pdf" }); }

  /** Descarga el PDF en el navegador. */
  descargar(nombre) {
    const url = URL.createObjectURL(this.blob());
    const a = document.createElement("a");
    a.href = url; a.download = nombre || "reporte.pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export default GeneradorPDF;
