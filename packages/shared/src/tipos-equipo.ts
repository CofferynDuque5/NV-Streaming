import type { MonedaConTasa } from './monedas.js';
import type { Pasarela } from './pagos-en-linea.js';

/** Plan con códigos de activación por debajo del umbral de «Pocos códigos en inventario». */
export interface PlanConPocosCodigos {
  planId: string;
  plan: string;
  servicio: string;
  /** Códigos disponibles (sin vencer). */
  disponibles: number;
  /** Entregas que esperan un código de ese plan. */
  pendientes: number;
}

/**
 * Centro de módulos del equipo (GET /metricas/centro): las colas de trabajo de
 * cada módulo, sus cifras y el estado del sistema. Cada parte llega solo si el
 * rol tiene el permiso de su módulo (si no, `null`) y ventas recibe solo lo de
 * su cartera. Nunca trae credenciales ni valores de configuración: solo si
 * algo está configurado o no.
 */
export interface CentroEquipo {
  colas: {
    /** Pagos con comprobante por conciliar (pagos.gestionar). */
    pagosEnRevision: number | null;
    /** Recargas de billetera de clientes en revisión (pagos.gestionar). */
    recargasBilletera: number | null;
    /** Recargas de saldo de revendedores en revisión (pagos.gestionar). */
    recargasRevendedor: number | null;
    /** Solicitudes abiertas y cuántas pasaron el plazo de primera respuesta (tickets.ver). */
    tickets: { abiertos: number; fueraDePlazo: number } | null;
    /** Entregas fallidas y pendientes (entregas.ver). */
    entregas: { fallidas: number; pendientes: number } | null;
    /** Solicitudes para ser revendedor (revendedores.ver). */
    solicitudesRevendedor: number | null;
    /** Facturas emitidas que pasaron su fecha límite (facturas.ver). */
    facturasVencidas: number | null;
    /** Acciones del asistente esperando confirmación: las propias, o todas con asistente.configurar. */
    accionesAsistente: number | null;
    /** Planes con pocos códigos (inventario.gestionar). */
    pocosCodigos: PlanConPocosCodigos[] | null;
  };
  modulos: {
    /** Servicios y planes activos (catalogo.ver). */
    catalogo: { servicios: number; planes: number } | null;
    /** Cupones activos y sin vencer (cupones.ver). */
    cuponesActivos: number | null;
    /** Personas activas del equipo (usuarios.ver). */
    equipo: number | null;
    /** Revendedores aprobados y suspendidos (revendedores.ver). */
    revendedores: { aprobados: number; suspendidos: number } | null;
    /** Automatizaciones activas (automatizaciones.ver). */
    automatizacionesActivas: number | null;
    /** Páginas del sitio publicadas (sitio.editar). */
    paginasPublicadas: number | null;
  };
  /**
   * Proceso trabajador (para todo el equipo: sin él no salen recordatorios,
   * facturas de renovación ni entregas automáticas).
   */
  trabajador: { activo: boolean; ultimoLatidoEn: string | null };
  sistema: {
    /** Canales de aviso (automatizaciones.ver). */
    canales: {
      /** `smtp`: envía de verdad; `sandbox`: los guarda sin enviarlos. */
      correo: 'smtp' | 'sandbox';
      whatsapp: 'listo' | 'pruebas' | 'sin_configurar';
    } | null;
    /** Asistente de IA de quien consulta (asistente.usar). */
    asistente: { activo: boolean; disponible: boolean; mensajesRestantesHoy: number } | null;
    /** Pasarelas de pago en línea (pasarelas.configurar). */
    pasarelas:
      | {
          pasarela: Pasarela;
          nombre: string;
          configurada: boolean;
          modo: 'pruebas' | 'produccion';
        }[]
      | null;
  };
  /** Monedas sin tasa de cambio vigente (finanzas.configurar). */
  tasasFaltantes: MonedaConTasa[] | null;
}
