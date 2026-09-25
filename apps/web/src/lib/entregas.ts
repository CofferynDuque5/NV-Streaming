import type { AdaptadorEntrega, EstadoCodigo, EstadoEntrega, MotivoEntrega } from '@nv/shared';
import type { TonoInsignia } from './estados';

type Etiquetas<K extends string> = Record<K, { texto: string; tono: TonoInsignia }>;

/** Estado de una entrega tal como lo ve el equipo. */
export const ESTADO_ENTREGA: Etiquetas<EstadoEntrega> = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  en_curso: { texto: 'En curso', tono: 'marca' },
  entregada: { texto: 'Entregada', tono: 'exito' },
  fallida: { texto: 'Fallida', tono: 'peligro' },
  revocada: { texto: 'Revocada', tono: 'neutro' },
  anulada: { texto: 'Anulada', tono: 'neutro' },
};

/** Estado de un acceso tal como lo ven el cliente y el revendedor (sin detalles internos). */
export const ESTADO_ACCESO: Etiquetas<EstadoEntrega> = {
  pendiente: { texto: 'En preparación', tono: 'aviso' },
  en_curso: { texto: 'En preparación', tono: 'aviso' },
  fallida: { texto: 'En revisión', tono: 'aviso' },
  entregada: { texto: 'Listo', tono: 'exito' },
  revocada: { texto: 'Terminado', tono: 'neutro' },
  anulada: { texto: 'Anulado', tono: 'neutro' },
};

export const ADAPTADOR_ENTREGA: Record<AdaptadorEntrega, { nombre: string; descripcion: string }> =
  {
    manual: {
      nombre: 'Manual',
      descripcion:
        'Alguien del equipo completa cada entrega con los pasos para activar el servicio y, si hace falta, un enlace o código oficial.',
    },
    codigos: {
      nombre: 'Códigos de inventario',
      descripcion:
        'Se entrega un código del inventario del plan (tarjetas o activaciones compradas como distribuidor oficial).',
    },
    webhook: {
      nombre: 'Webhook firmado',
      descripcion:
        'NV avisa por HTTPS a la plataforma del servicio propio o a la API del distribuidor, que activa el servicio y responde con un enlace o código.',
    },
  };

export const MOTIVO_ENTREGA: Record<MotivoEntrega, string> = {
  alta: 'Alta',
  renovacion: 'Renovación',
  compra: 'Compra de revendedor',
};

export const ESTADO_CODIGO: Etiquetas<EstadoCodigo> = {
  disponible: { texto: 'Disponible', tono: 'exito' },
  reservado: { texto: 'Reservado', tono: 'marca' },
  entregado: { texto: 'Entregado', tono: 'neutro' },
  anulado: { texto: 'Anulado', tono: 'peligro' },
};

/** Recordatorio que acompaña a cada código o enlace mostrado. */
export const AVISO_NO_COMPARTIR =
  'No compartas este código ni este enlace: es personal y solo sirve para activar tu servicio. NV Streaming nunca te pedirá contraseñas.';
