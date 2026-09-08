/**
 * estreno-notifier.ts — Agente de estrenos (OpenAI).
 *
 * Cada vez que se PUBLICA un estreno nuevo en la cartelera
 * (colección `carteleras_estrenos`), este agente:
 *   1) Redacta con OpenAI un anuncio corto y atractivo (título + gancho).
 *   2) Deja un aviso al administrador en `alertas_admin` (tipo='estreno').
 *   3) Si hay ADMIN_WHATSAPP configurado, se lo envía por WhatsApp.
 *
 * Es TOLERANTE a fallos: nunca lanza hacia la petición HTTP (se llama en
 * "fire-and-forget"). Si falta OPENAI_API_KEY, igual avisa al admin con un
 * texto plantilla (el aviso es lo importante; la IA solo lo pule).
 */
import OpenAI from 'openai';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { whatsappSender } from '../../services/whatsapp.service.js';

type Doc = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();

/** Extrae los campos legibles de un documento de cartelera (nombres flexibles). */
function leerEstreno(doc: Doc): { titulo: string; descripcion: string; plataforma: string; fecha: string } {
  return {
    titulo: str(doc.titulo || doc.nombre || doc.title || doc.pelicula || ''),
    descripcion: str(doc.descripcion || doc.sinopsis || doc.subtitulo || doc.texto || ''),
    plataforma: str(doc.plataforma || doc.servicio || doc.categoria || ''),
    fecha: str(doc.fecha || doc.fecha_estreno || doc.estreno || ''),
  };
}

/** Redacta el anuncio con OpenAI. Devuelve null si no hay clave o falla. */
async function redactarConIA(e: ReturnType<typeof leerEstreno>): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const detalle = [
      e.titulo && `Título: ${e.titulo}`,
      e.plataforma && `Plataforma: ${e.plataforma}`,
      e.fecha && `Fecha: ${e.fecha}`,
      e.descripcion && `Descripción: ${e.descripcion}`,
    ].filter(Boolean).join('\n');
    const res = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content:
            'Eres el community manager de NV Streaming, una tienda de suscripciones ' +
            '(Netflix, Disney+, Max, etc.). Redacta un aviso BREVE (máx. 45 palabras) para ' +
            'anunciar al equipo/clientes que hay un nuevo estreno en la cartelera. Tono ' +
            'entusiasta, en español, 1-2 emojis. No inventes datos que no se te den.',
        },
        { role: 'user', content: `Nuevo estreno en la cartelera:\n${detalle || '(sin detalles)'}` },
      ],
    });
    const texto = str(res.choices?.[0]?.message?.content);
    return texto || null;
  } catch (err) {
    logger.error({ err }, '(Estreno) OpenAI falló al redactar el anuncio');
    return null;
  }
}

/** Texto plantilla de reserva cuando no hay IA disponible. */
function anuncioPlantilla(e: ReturnType<typeof leerEstreno>): string {
  const partes = [
    `🎬 Nuevo estreno en la cartelera: ${e.titulo || 'sin título'}`,
    e.plataforma && `Plataforma: ${e.plataforma}`,
    e.fecha && `Estreno: ${e.fecha}`,
    e.descripcion,
  ].filter(Boolean);
  return partes.join(' · ');
}

/**
 * Notifica al admin de un estreno recién publicado. Fire-and-forget.
 * @param doc documento de `carteleras_estrenos` (tal como llega al upsert).
 */
export async function notificarEstreno(doc: Doc): Promise<void> {
  try {
    const e = leerEstreno(doc);
    if (!e.titulo && !e.descripcion) return; // nada que anunciar

    const iaTexto = await redactarConIA(e);
    const anuncio = iaTexto || anuncioPlantilla(e);
    const fuente = iaTexto ? 'IA' : 'plantilla';

    // 1) Aviso persistente para el admin (se ve en el panel).
    const mensaje = `🎬 Estreno publicado — ${e.titulo || 'sin título'}\n${anuncio}`;
    await query(`INSERT INTO alertas_admin (tipo, mensaje) VALUES ('estreno', $1)`, [mensaje]);

    // 2) WhatsApp al admin (si está configurado).
    const adminWa = str(env.ADMIN_WHATSAPP).replace(/\D/g, '');
    if (adminWa) {
      await whatsappSender.sendText(adminWa, anuncio);
    }

    logger.info({ titulo: e.titulo, fuente, whatsapp: !!adminWa }, '(Estreno) Aviso enviado al admin');
  } catch (err) {
    logger.error({ err }, '(Estreno) No se pudo notificar el estreno');
  }
}
