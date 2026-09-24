import type { ErrorApi } from '@nv/shared';

export type ErrorLlamada = ErrorApi['error'] & { estado: number };
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorLlamada };

/**
 * Llama a la API desde el navegador. Va al mismo origen (/api/…), así la
 * cookie de sesión viaja sola y el navegador añade la cabecera Origin.
 */
export async function llamarApi<T = unknown>(
  metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  ruta: string,
  cuerpo?: unknown,
  cabeceras: Record<string, string> = {},
): Promise<Resultado<T>> {
  const esFormulario = cuerpo instanceof FormData;
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/v1${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      // Con FormData el navegador pone el tipo multipart y su separador.
      headers: {
        ...(cuerpo === undefined || esFormulario ? {} : { 'content-type': 'application/json' }),
        ...cabeceras,
      },
      body: cuerpo === undefined ? null : esFormulario ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    return {
      ok: false,
      error: {
        estado: 0,
        codigo: 'SIN_CONEXION',
        mensaje: 'No pudimos conectar con NV Streaming. Revisa tu conexión e inténtalo de nuevo.',
      },
    };
  }
  const texto = await respuesta.text();
  let datos: unknown = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // Respuesta que no es JSON (por ejemplo, un proxy caído): se trata como error genérico.
  }
  if (respuesta.ok) return { ok: true, datos: datos as T };
  const error = (datos as ErrorApi | null)?.error;
  return {
    ok: false,
    error: {
      estado: respuesta.status,
      codigo: error?.codigo ?? 'ERROR',
      mensaje: error?.mensaje ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.',
      ...(error?.campos ? { campos: error.campos } : {}),
    },
  };
}

/** Primer mensaje de error de cada campo, para mostrarlo bajo el campo. */
export function erroresPorCampo(error: ErrorLlamada | null): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [campo, mensajes] of Object.entries(error?.campos ?? {})) {
    if (mensajes[0]) salida[campo] = mensajes[0];
  }
  return salida;
}
