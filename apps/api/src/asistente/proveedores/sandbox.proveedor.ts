import { Inject, Injectable } from '@nestjs/common';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import type {
  Disponibilidad,
  EntradaModelo,
  LlamadaHerramienta,
  ProveedorAsistente,
  ResultadoHerramienta,
  SalidaModelo,
} from './proveedor.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Minúsculas y sin acentos, para reconocer frases. */
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Texto después de los dos puntos (lo que la persona quiere escribir). */
const trasDosPuntos = (original: string) => {
  const i = original.indexOf(':');
  return i >= 0 ? original.slice(i + 1).trim() : '';
};

type Regla = (t: string, original: string) => { nombre: string; argumentos: unknown } | null;

/** Frases que reconoce, en orden: primero las acciones (llevan un id). */
const REGLAS: Regla[] = [
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    if (!id || !/\bpausa/.test(t)) return null;
    const motivo = /motivo:\s*(.+)$/i.exec(o)?.[1]?.trim() || 'Lo pidió el cliente';
    return { nombre: 'pausar_suscripcion', argumentos: { suscripcionId: id, motivo } };
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    return id && /\breanud/.test(t)
      ? { nombre: 'reanudar_suscripcion', argumentos: { suscripcionId: id } }
      : null;
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    return id && /\brenov/.test(t)
      ? { nombre: 'emitir_renovacion', argumentos: { suscripcionId: id } }
      : null;
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    if (!id || !/\brespond/.test(t)) return null;
    return {
      nombre: 'responder_ticket',
      argumentos: {
        ticketId: id,
        texto: trasDosPuntos(o) || 'Hola, ya estamos revisando tu caso.',
        interno: /nota interna/.test(t),
      },
    };
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    if (!id || !/ticket/.test(t) || !/\b(cierra|resuelve|prioridad)/.test(t)) return null;
    const prioridad = /prioridad (baja|normal|alta|urgente)/.exec(t)?.[1];
    const estado = /\bcierra/.test(t) ? 'cerrado' : /\bresuelve/.test(t) ? 'resuelto' : undefined;
    return {
      nombre: 'actualizar_ticket',
      argumentos: {
        ticketId: id,
        ...(estado ? { estado } : {}),
        ...(prioridad ? { prioridad } : {}),
      },
    };
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    return id && /\bnota\b/.test(t)
      ? { nombre: 'agregar_nota_cliente', argumentos: { clienteId: id, texto: trasDosPuntos(o) } }
      : null;
  },
  (t, o) => {
    const id = UUID.exec(o)?.[0];
    if (!id) return null;
    if (/ticket/.test(t)) return { nombre: 'ver_ticket', argumentos: { ticketId: id } };
    if (/suscripcion/.test(t))
      return { nombre: 'ver_suscripcion', argumentos: { suscripcionId: id } };
    if (/cliente/.test(t)) return { nombre: 'ver_cliente', argumentos: { clienteId: id } };
    return null;
  },
  (t) =>
    /(por vencer|vencen|vencimientos)/.test(t)
      ? {
          nombre: 'suscripciones_por_vencer',
          argumentos: { dias: Number(/(\d{1,2}) dias/.exec(t)?.[1] ?? 7) },
        }
      : null,
  (t) => (/facturas/.test(t) ? { nombre: 'facturas_pendientes', argumentos: {} } : null),
  (t) =>
    /(conciliar|pagos en revision|pagos reportados)/.test(t)
      ? { nombre: 'pagos_por_conciliar', argumentos: {} }
      : null,
  (t) =>
    /tickets/.test(t)
      ? { nombre: 'tickets_abiertos', argumentos: { soloMios: /\bmios\b/.test(t) } }
      : null,
  (t) =>
    /(metricas|ingresos|resumen del mes)/.test(t)
      ? { nombre: 'resumen_metricas', argumentos: {} }
      : null,
  (t) => (/\btasa/.test(t) ? { nombre: 'tasa_del_dia', argumentos: {} } : null),
  (t) => (/revendedor/.test(t) ? { nombre: 'revendedores_saldo_bajo', argumentos: {} } : null),
  (t, o) => {
    if (!/\b(busca|buscar|encuentra)\b/.test(t)) return null;
    const m =
      /\b(?:busca|buscar|encuentra)\s+(?:a\s+|al\s+)?(?:(?:los\s+|el\s+)?clientes?\s+)?(.+)$/i.exec(
        o,
      );
    const texto = m?.[1]?.replace(/[?.!]+$/, '').trim();
    return texto ? { nombre: 'buscar_clientes', argumentos: { texto } } : null;
  },
];

/** Contenido entre los delimitadores de datos, ya como objeto. */
function leerDatos(r: ResultadoHerramienta): unknown {
  const m = /<datos_herramienta[^>]*>\n?([\s\S]*?)\n?<\/datos_herramienta>/.exec(r.contenido);
  try {
    return JSON.parse(m?.[1] ?? r.contenido);
  } catch {
    return m?.[1] ?? r.contenido;
  }
}

/**
 * Asistente de pruebas: sin modelo, determinista. Reconoce algunas frases en
 * español y pide la herramienta que toca (solo si se la ofrecieron); cuando
 * recibe resultados, los resume tal cual. Sirve para desarrollo y para las
 * pruebas automáticas. En producción no existe.
 */
@Injectable()
export class ProveedorSandboxIa implements ProveedorAsistente {
  readonly proveedor = 'sandbox' as const;
  readonly modelo = 'guion-de-pruebas';

  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {}

  disponible(): Disponibilidad {
    return this.entorno.ASISTENTE_SANDBOX_HABILITADO
      ? { ok: true, motivo: null }
      : { ok: false, motivo: 'El asistente de pruebas está desactivado en este entorno.' };
  }

  async responder(e: EntradaModelo): Promise<SalidaModelo> {
    const tokensEntrada = Math.ceil(
      (e.sistema.length +
        e.mensajes.reduce(
          (n, m) =>
            n +
            (m.rol === 'herramienta'
              ? m.resultados.reduce((k, r) => k + r.contenido.length, 0)
              : m.texto.length),
          0,
        )) /
        4,
    );
    const ultimo = e.mensajes.at(-1);
    const fin = (texto: string, llamadas: LlamadaHerramienta[] = []): SalidaModelo => ({
      texto,
      llamadas,
      tokensEntrada,
      tokensSalida: Math.ceil(texto.length / 4) + llamadas.length * 10,
      detenido: llamadas.length ? 'herramientas' : 'fin',
    });

    if (ultimo?.rol === 'herramienta') {
      const partes = ultimo.resultados.map((r) => {
        const datos = leerDatos(r);
        if (r.error) {
          const motivo =
            datos && typeof datos === 'object' && 'error' in datos
              ? String((datos as { error: unknown }).error)
              : String(datos);
          return `No pude usar ${r.nombre}: ${motivo}`;
        }
        if (datos && typeof datos === 'object' && 'propuesta' in datos) {
          const resumen = (datos as { resumen?: unknown }).resumen;
          return `Preparé esta acción para que la confirmes en la pantalla: ${String(resumen)}`;
        }
        return `Resultado de ${r.nombre}: ${JSON.stringify(datos).slice(0, 3000)}`;
      });
      return fin(partes.join('\n'));
    }
    if (ultimo?.rol !== 'usuario') return fin('No tengo nada que responder.');

    const t = normalizar(ultimo.texto);
    if (/(ignora|olvida).*instrucciones/.test(t)) {
      return fin('No puedo cambiar mis instrucciones. ¿En qué te ayudo con NV?');
    }
    for (const regla of REGLAS) {
      const r = regla(t, ultimo.texto);
      if (!r) continue;
      if (!e.herramientas.some((h) => h.nombre === r.nombre)) {
        return fin('No tengo acceso a esa información con tus permisos.');
      }
      return fin('', [{ id: `sbx_${e.mensajes.length}`, ...r }]);
    }
    return fin(
      'Soy el asistente de pruebas. Puedo buscar clientes, ver vencimientos, facturas pendientes, pagos por conciliar, tickets, métricas, la tasa y revendedores con saldo bajo.',
    );
  }
}
