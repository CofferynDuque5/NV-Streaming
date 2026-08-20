/**
 * Modelos de dominio (contratos tipados). Los repositorios devuelven SIEMPRE
 * estas formas — nunca filas crudas de la base de datos.
 */

export type EstadoCuenta = 'disponible' | 'asignada' | 'caida' | 'renovacion';
export type EstadoSuscripcion = 'activa' | 'vencida' | 'pausada' | 'cancelada';

/** Cliente final, identificado por su número de WhatsApp. */
export interface Usuario {
  id: string;                // uuid
  id_whatsapp: string;       // número en formato E.164 sin '+', ej: '584160000000'
  nombre: string | null;
  email: string | null;
  creado_en: Date;
  actualizado_en: Date;
}

/**
 * Cuenta de streaming del proveedor. REGLA DE NEGOCIO: es de UN SOLO PERFIL
 * PRIVADO por cliente — no se modelan múltiples perfiles por cuenta. Cuando
 * está 'asignada', pertenece en exclusiva a un único cliente.
 */
export interface CuentaStreaming {
  id: string;                // uuid
  plataforma_id: string;     // ej: 'netflix', 'disney'
  correo: string;
  contrasena_cifrada: string; // cifrada en reposo (nunca en claro en logs/IA)
  pin: string | null;
  perfil: string;            // nombre del único perfil privado, ej: 'Perfil'
  estado: EstadoCuenta;
  creado_en: Date;
}

/** Vínculo cliente ↔ cuenta (una suscripción = un perfil privado). */
export interface Suscripcion {
  id: string;                // uuid
  usuario_id: string;        // FK -> usuarios.id
  cuenta_streaming_id: string; // FK -> cuentas_streaming.id (única mientras 'activa')
  plataforma_id: string;
  plan_id: string;           // FK -> planes.id (los precios viven en la BD, no en la IA)
  estado: EstadoSuscripcion;
  pagada: boolean;           // ¿el pago de este ciclo está confirmado?
  fecha_inicio: Date;
  fecha_vencimiento: Date;
  renovacion_automatica: boolean;
  creado_en: Date;
  actualizado_en: Date;
}

/** Catálogo de precios. La IA NUNCA inventa precios: los lee de aquí por id. */
export interface Plan {
  id: string;
  plataforma_id: string;
  nombre: string;            // ej: 'Netflix Premium 1 mes'
  precio: string;            // numeric como string (evita errores de coma flotante)
  moneda: string;            // 'USD'
  duracion_dias: number;
  activo: boolean;
}

export type MetodoPago = 'pago_movil' | 'binance' | 'zelle';
export type EstadoPago = 'pendiente' | 'confirmado' | 'rechazado';

/** Pago del cliente: comprobante → confirmación → renovación de la suscripción. */
export interface Pago {
  id: string;
  usuario_id: string;
  suscripcion_id: string | null;  // null si es una compra nueva (no renovación)
  plataforma_id: string;
  plan_id: string;
  metodo: MetodoPago;
  monto: string;
  moneda: string;
  referencia: string | null;
  comprobante_url: string | null;
  estado: EstadoPago;
  motivo_rechazo: string | null;
  confirmado_por: string | null;
  proveedor: string | null;    // PSP: 'binance' | 'pago_movil' | null (manual)
  id_externo: string | null;   // id de transacción del PSP (anti-duplicado)
  creado_en: Date;
  confirmado_en: Date | null;
}
