import type { CifrasPoliticas } from '@nv/shared';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

/**
 * Lo que la API tiene configurado y nombran las Políticas y términos (sesión,
 * comprobantes, límites, avisos y reintentos). `null` si la API no respondió:
 * la página se muestra igual, sin esas cifras (nunca las inventa).
 */
export async function leerCifrasPoliticas(): Promise<CifrasPoliticas | null> {
  try {
    const r = await fetch(`${API}/api/v1/sitio/publico/politicas`, {
      next: { revalidate: 300 },
    });
    return r.ok ? ((await r.json()) as CifrasPoliticas) : null;
  } catch {
    return null;
  }
}

const fechaLarga = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** «2026-10-05» → «5 de octubre de 2026». */
export const fechaPoliticas = (dia: string) => fechaLarga.format(new Date(`${dia}T00:00:00Z`));
