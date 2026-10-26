import type { Entrega, Prisma, Proveedor } from '@nv/db';
import type { AdaptadorEntrega, ConfiguracionEntregaLeida } from '@nv/shared';

/**
 * Contrato de los adaptadores de entrega (uno por forma de entregar). Un
 * adaptador recibe la entrega con su proveedor, plan y cliente y dice qué pasó;
 * el orquestador (`EntregasService`) guarda el resultado, programa reintentos y
 * avisa. Ningún adaptador devuelve credenciales de cuentas: solo códigos o
 * enlaces de activación oficiales e instrucciones sin secretos.
 */

/** Lo que ve el cliente. `codigo` y `enlace` se guardan cifrados. */
export interface DatosCliente {
  codigo?: string;
  enlace?: string;
  instrucciones?: string;
}

export interface ResultadoEntrega {
  estado: 'entregada' | 'pendiente' | 'fallida';
  referenciaExterna?: string;
  datosCliente?: DatosCliente;
  /** Con `pendiente`: volver a intentar más tarde (con espera creciente). */
  reintentar?: boolean;
  /** Explicación en español para el panel (nunca contiene el código). */
  mensaje?: string;
  /** Aviso al equipo que corresponde: la entrega espera a una persona o faltan códigos. */
  aviso?: 'manual' | 'sin_stock';
  /** Código de inventario asignado (adaptador de códigos). */
  codigoInventarioId?: string;
}

export interface ResultadoRevocacion {
  estado: 'revocada' | 'reintentar' | 'fallida';
  mensaje?: string;
}

export interface ContextoEntrega {
  /** Transacción que bloquea la entrega (solo en los adaptadores transaccionales). */
  tx?: Prisma.TransactionClient;
  entrega: Entrega;
  proveedor: Proveedor;
  configuracion: ConfiguracionEntregaLeida;
  plan: { id: string; nombre: string; skuProveedor: string | null; servicio: string };
  /** Solo el id de NV y, si el proveedor lo pide en su configuración, el correo. */
  cliente: { id: string; correo: string | null };
  /** Clave de firma descifrada (solo webhook). */
  secreto: string | null;
  motivoRevocacion?: string;
}

export interface Adaptador {
  readonly adaptador: AdaptadorEntrega;
  /**
   * `true`: `entregar` corre dentro de la transacción que bloquea la entrega
   * (lo que hace queda confirmado junto con el resultado). `false`: llama a un
   * sistema externo fuera de la transacción.
   */
  readonly transaccional: boolean;
  entregar(ctx: ContextoEntrega): Promise<ResultadoEntrega>;
  /** Avisa al proveedor de que la entrega se revoca (cancelación o fin de la suspensión). */
  revocar?(ctx: ContextoEntrega): Promise<ResultadoRevocacion>;
}
