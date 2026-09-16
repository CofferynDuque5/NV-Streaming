/**
 * media.service.ts — Subida de imágenes a ImgBB desde el SERVIDOR.
 *
 * La API key de ImgBB nunca sale del backend: el navegador manda la imagen en
 * base64 a /api/admin/medios y este servicio la reenvía a ImgBB con la clave de
 * `IMGBB_API_KEY`. Devuelve un contrato homogéneo con las URLs públicas.
 *
 * Inyectable (endpoint + fetch) para poder probarlo contra un stub local sin
 * tocar la red real.
 */
import { env } from '../../config/env.js';
import { AppError, ValidationError } from '../../core/errors.js';

export interface ResultadoImgBB {
  url: string;
  display_url: string;
  thumb_url: string;
  delete_url: string;
  imgbb_id: string;
  mime: string;
  tamano: number;
  ancho: number;
  alto: number;
}

export class ImgBBNoConfiguradoError extends AppError {
  constructor() {
    super({
      code: 'imgbb_no_configurado',
      message: 'Falta IMGBB_API_KEY en el .env del backend. Añádela y reinicia el servidor para poder subir imágenes.',
      statusCode: 503,
    });
  }
}

export interface OpcionesMediaService {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/** Tamaño máximo aceptado (base64 decodificado). ImgBB admite hasta 32 MB; aquí 8 MB. */
export const MAX_BYTES = 8 * 1024 * 1024;

const MIME_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp']);

/** Separa un dataURL (`data:image/png;base64,...`) o base64 crudo en {mime, base64}. */
export function normalizarImagen(entrada: unknown): { mime: string; base64: string } {
  if (typeof entrada !== 'string' || !entrada.trim()) throw new ValidationError('Falta la imagen (base64 o dataURL).');
  let mime = '';
  let base64 = entrada.trim();
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(base64);
  if (m) { mime = (m[1] || '').toLowerCase(); base64 = m[2] || ''; }
  base64 = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64) || base64.length < 8) throw new ValidationError('La imagen no es base64 válido.');
  if (mime && !MIME_PERMITIDOS.has(mime)) throw new ValidationError(`Tipo de imagen no permitido: ${mime}.`);
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_BYTES) throw new ValidationError(`La imagen pesa ${(bytes / 1048576).toFixed(1)} MB; el máximo es 8 MB.`);
  return { mime, base64 };
}

export class MediaService {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpcionesMediaService = {}) {
    this.apiKey = opts.apiKey ?? env.IMGBB_API_KEY;
    this.endpoint = opts.endpoint ?? env.IMGBB_ENDPOINT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get configurado(): boolean { return this.apiKey.length > 0; }

  /** Sube a ImgBB y devuelve las URLs públicas. Lanza AppError con mensaje claro. */
  async subir(imagen: unknown, nombre: string): Promise<ResultadoImgBB> {
    if (!this.configurado) throw new ImgBBNoConfiguradoError();
    const { mime, base64 } = normalizarImagen(imagen);

    const form = new FormData();
    form.append('key', this.apiKey);
    form.append('image', base64);
    if (nombre) form.append('name', nombre.slice(0, 120));

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(25_000) });
    } catch (e) {
      throw new AppError({ code: 'imgbb_red', message: 'No se pudo conectar con ImgBB: ' + ((e as Error)?.message || 'error de red'), statusCode: 502, causa: e });
    }
    let json: any = null;
    try { json = await res.json(); } catch { /* cuerpo no JSON */ }
    if (!res.ok || !json || json.success !== true || !json.data) {
      const msg = (json && json.error && (json.error.message || json.error)) || `HTTP ${res.status}`;
      throw new AppError({ code: 'imgbb_rechazo', message: 'ImgBB rechazó la subida: ' + String(msg), statusCode: 502 });
    }
    const d = json.data;
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const url = String(d.url || (d.image && d.image.url) || '');
    if (!url) throw new AppError({ code: 'imgbb_rechazo', message: 'ImgBB no devolvió una URL.', statusCode: 502 });
    return {
      url,
      display_url: String(d.display_url || url),
      thumb_url: String((d.thumb && d.thumb.url) || (d.medium && d.medium.url) || url),
      delete_url: String(d.delete_url || ''),
      imgbb_id: String(d.id || ''),
      mime: String((d.image && d.image.mime) || mime || ''),
      tamano: num(d.size),
      ancho: num(d.width),
      alto: num(d.height),
    };
  }
}

/** Instancia por defecto (clave y endpoint del entorno). */
export const mediaService = new MediaService();
