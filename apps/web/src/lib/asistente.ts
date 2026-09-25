import {
  type AccionPropuestaPublica,
  type EstadoAccionPropuesta,
  INFO_PROVEEDOR_IA,
  PROVEEDORES_IA,
  type ProveedorIa,
} from '@nv/shared';
import type { TonoInsignia } from './estados';

// Sin 'use client': lo usan tanto componentes de servidor como de cliente.

/** Textos y utilidades de las pantallas del asistente de IA (fase 5). */

export const RUTA_ASISTENTE = '/admin/asistente';

export const ESTADO_ACCION: Record<
  EstadoAccionPropuesta,
  { texto: string; tono: TonoInsignia; filtro: string }
> = {
  propuesta: { texto: 'Por confirmar', tono: 'aviso', filtro: 'Por confirmar' },
  ejecutada: { texto: 'Ejecutada', tono: 'exito', filtro: 'Ejecutadas' },
  rechazada: { texto: 'Rechazada', tono: 'neutro', filtro: 'Rechazadas' },
  fallida: { texto: 'Falló', tono: 'peligro', filtro: 'Fallidas' },
  expirada: { texto: 'Caducada', tono: 'neutro', filtro: 'Caducadas' },
};

/**
 * Estado que se muestra: una propuesta cuyo plazo ya pasó se ve como caducada
 * aunque la API todavía no la haya marcado.
 */
export function estadoVisible(
  accion: Pick<AccionPropuestaPublica, 'estado' | 'expiraEn'>,
  ahora = Date.now(),
): EstadoAccionPropuesta {
  if (accion.estado === 'propuesta' && new Date(accion.expiraEn).getTime() <= ahora)
    return 'expirada';
  return accion.estado;
}

/** "Caduca en 42 min", "Caduca en 30 s". */
export function textoCaducidad(expiraEn: string, ahora = Date.now()): string {
  const segundos = Math.max(0, Math.round((new Date(expiraEn).getTime() - ahora) / 1000));
  if (segundos < 60) return `Caduca en ${segundos} s`;
  const minutos = Math.ceil(segundos / 60);
  return `Caduca en ${minutos} min`;
}

/** Preguntas de ejemplo que se envían con un toque. */
export const EJEMPLOS_ASISTENTE = [
  '¿Qué suscripciones vencen esta semana?',
  'Resume los tickets urgentes',
  '¿Cuántos pagos hay por conciliar?',
  '¿Qué facturas siguen pendientes?',
] as const;

export const MAX_CARACTERES_MENSAJE = 4000;

export function nombreProveedor(p: string): string {
  return (PROVEEDORES_IA as readonly string[]).includes(p)
    ? INFO_PROVEEDOR_IA[p as ProveedorIa].nombre
    : p;
}

/** Qué hace falta en el servidor para usar cada motor. Nunca se escriben credenciales en el panel. */
export const AYUDA_PROVEEDOR: Record<ProveedorIa, { descripcion: string; falta: string }> = {
  local: {
    descripcion:
      'Modelo abierto servido por Ollama en el mismo servidor. Gratis y los datos no salen.',
    falta:
      'Configura OLLAMA_URL (y el modelo, si no usas el de por defecto) en el entorno de la API y reiníciala.',
  },
  claude: {
    descripcion:
      'API de Anthropic. Cobra por uso: cada respuesta cuenta para el tope mensual en USD.',
    falta:
      'Configura ANTHROPIC_API_KEY, ANTHROPIC_MODELO y los precios por millón de tokens en el entorno de la API y reiníciala.',
  },
  sandbox: {
    descripcion: 'Respuestas fijas para desarrollo y pruebas. No consulta ningún modelo.',
    falta: 'Solo está disponible fuera de producción.',
  },
};

const numero = new Intl.NumberFormat('es');
export const formatearNumero = (n: number) => numero.format(n);

const mesLargo = new Intl.DateTimeFormat('es', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
/** "2026-09" → "septiembre de 2026". Tolera fechas ISO completas. */
export function nombreMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes);
  if (!m) return mes;
  return mesLargo.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}
