import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type FacturaPublica,
  NOMBRES_HERRAMIENTA,
  type NombreHerramienta,
  PARAMETROS_HERRAMIENTA,
  HERRAMIENTAS,
  type SuscripcionPublica,
  tienePermiso,
} from '@nv/shared';
import { ConfigAutomatizacionesService } from '../../automatizaciones/configuracion.service.js';
import { ClientesService } from '../../clientes/clientes.service.js';
import { FacturasService } from '../../cobros/facturas.service.js';
import { PagosService } from '../../cobros/pagos.service.js';
import type { ContextoAuth, InfoCliente } from '../../comun/contexto.js';
import { ErrorApp } from '../../comun/errores.js';
import { PRISMA } from '../../comun/tokens.js';
import { D } from '../../dinero/dinero.js';
import { TasasService } from '../../dinero/tasas.service.js';
import { MetricasService } from '../../metricas/metricas.service.js';
import { TicketsService } from '../../soporte/tickets.service.js';
import { SuscripcionesService } from '../../suscripciones/suscripciones.service.js';
import { entregasDeSuscripcion } from '../../entregas/registro.js';
import { fechaCaracas } from '../fechas.js';
import type { HerramientaOfrecida } from '../proveedores/proveedor.js';
import { HERRAMIENTAS_MODELO } from './esquemas.js';

/** Importe con su moneda: "12.50 USD". */
const monto = (valor: string, moneda: string) => `${valor} ${moneda}`;
const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}…` : t);

const noSePuede = (mensaje: string) => new ErrorApp(409, 'ACCION_NO_APLICABLE', mensaje);

/** Vista corta de una suscripción: sin tokens ni métodos de pago, solo si hay cobro automático. */
function vistaSuscripcion(s: SuscripcionPublica) {
  return {
    id: s.id,
    clienteId: s.cliente.id,
    cliente: s.cliente.nombre,
    plan: `${s.plan.servicio} · ${s.plan.nombre}`,
    estado: s.estado,
    moneda: s.moneda,
    venceEn: fechaCaracas(s.venceEn),
    cancelarAlVencer: s.cancelarAlVencer,
    cobroAutomatico: s.cobroAutomatico !== null,
    facturaAbierta: s.facturaAbierta?.numero ?? null,
  };
}

function vistaFactura(f: FacturaPublica) {
  return {
    id: f.id,
    numero: f.numero,
    clienteId: f.cliente.id,
    cliente: f.cliente.nombre,
    suscripcionId: f.suscripcionId,
    concepto: f.concepto,
    estado: f.estado,
    total: monto(f.total, f.moneda),
    totalUsd: monto(f.totalUsd, 'USD'),
    venceEn: fechaCaracas(f.venceEn),
    vencida: f.vencida,
    pagoEnRevision: f.pagoEnRevision,
    pagadaEn: fechaCaracas(f.pagadaEn),
  };
}

/**
 * Catálogo cerrado de herramientas del asistente. Cada una llama a los
 * servicios de siempre con la autenticación de quien pregunta (sus permisos y
 * su cartera) y devuelve una vista pequeña hecha para el modelo: nunca filas
 * crudas, contraseñas, tokens, datos de pago, rutas de comprobantes ni códigos.
 */
@Injectable()
export class HerramientasAsistenteService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(FacturasService) private readonly facturas: FacturasService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(MetricasService) private readonly metricas: MetricasService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(ConfigAutomatizacionesService)
    private readonly automatizaciones: ConfigAutomatizacionesService,
  ) {}

  /** Solo las herramientas cuyo permiso tiene quien pregunta: las demás ni se mencionan. */
  ofrecidas(auth: ContextoAuth): HerramientaOfrecida[] {
    return NOMBRES_HERRAMIENTA.filter((n) =>
      tienePermiso(auth.usuario.rol, HERRAMIENTAS[n].permiso),
    ).map((n) => HERRAMIENTAS_MODELO[n]);
  }

  // ── Consultas ──────────────────────────────────────────────────────────────

  /** Ejecuta una consulta ya validada. Lo que queda fuera del alcance responde "no existe". */
  async consultar(nombre: NombreHerramienta, argumentos: unknown, auth: ContextoAuth) {
    const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(auth.usuario.rol, p);
    switch (nombre) {
      case 'buscar_clientes': {
        const p = PARAMETROS_HERRAMIENTA.buscar_clientes.parse(argumentos);
        const r = await this.clientes.listar(auth, {
          busqueda: p.texto,
          estado: 'todos',
          pagina: 1,
          porPagina: 10,
        });
        return {
          total: r.total,
          clientes: r.elementos.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            correo: c.correo,
            pais: c.pais,
            estado: c.estado,
            suscripcionesActivas: c.suscripcionesActivas,
            asignadoA: c.asignadoA?.nombre ?? null,
          })),
        };
      }
      case 'ver_cliente': {
        const p = PARAMETROS_HERRAMIENTA.ver_cliente.parse(argumentos);
        const c = await this.clientes.obtener(auth, p.clienteId);
        const [suscripciones, facturas, notas] = await Promise.all([
          puede('suscripciones.ver')
            ? this.suscripciones.listar(auth, { clienteId: c.id, pagina: 1, porPagina: 10 })
            : null,
          puede('facturas.ver')
            ? this.facturas.listar(auth, { clienteId: c.id, pagina: 1, porPagina: 5 })
            : null,
          // El contenido de las notas internas solo con su permiso.
          puede('clientes.notas') ? this.clientes.notas(auth, c.id) : null,
        ]);
        return {
          id: c.id,
          nombre: c.nombre,
          correo: c.correo,
          documento: c.documento,
          pais: c.pais,
          monedaPreferida: c.monedaPreferida,
          estado: c.estado,
          origen: c.origen,
          asignadoA: c.asignadoA?.nombre ?? null,
          tieneAccesoAlPanel: c.tieneAcceso,
          contactos: c.contactos.map((k) => ({
            tipo: k.tipo,
            valor: k.valor,
            aceptaAvisos: k.consentimientoEn !== null,
          })),
          creadoEn: fechaCaracas(c.creadoEn),
          ...(suscripciones
            ? { suscripciones: suscripciones.elementos.map(vistaSuscripcion) }
            : {}),
          ...(facturas ? { ultimasFacturas: facturas.elementos.map(vistaFactura) } : {}),
          ...(notas
            ? {
                notasInternas: notas.slice(0, 5).map((n) => ({
                  autor: n.autor.nombre,
                  fecha: fechaCaracas(n.creadoEn),
                  texto: recortar(n.texto, 500),
                })),
              }
            : {}),
        };
      }
      case 'suscripciones_por_vencer': {
        const p = PARAMETROS_HERRAMIENTA.suscripciones_por_vencer.parse(argumentos);
        const r = await this.suscripciones.listar(auth, {
          vencenEnDias: Math.max(1, p.dias),
          pagina: 1,
          porPagina: 25,
        });
        return { dias: p.dias, total: r.total, suscripciones: r.elementos.map(vistaSuscripcion) };
      }
      case 'ver_suscripcion': {
        const p = PARAMETROS_HERRAMIENTA.ver_suscripcion.parse(argumentos);
        const s = await this.suscripciones.obtener(auth, p.suscripcionId);
        const facturas = puede('facturas.ver')
          ? (
              await this.facturas.listar(auth, {
                clienteId: s.cliente.id,
                pagina: 1,
                porPagina: 50,
              })
            ).elementos
              .filter((f) => f.suscripcionId === s.id)
              .slice(0, 5)
          : null;
        // De la entrega solo se da el estado: nunca códigos, enlaces ni instrucciones.
        const entrega = puede('entregas.ver')
          ? await this.prisma.entrega.findFirst({
              where: entregasDeSuscripcion(s.id),
              select: { estado: true },
              orderBy: { creadoEn: 'desc' },
            })
          : null;
        return {
          ...vistaSuscripcion(s),
          ...(entrega ? { entrega: entrega.estado } : {}),
          inicioEn: fechaCaracas(s.inicioEn),
          pausadaEn: fechaCaracas(s.pausadaEn),
          canceladaEn: fechaCaracas(s.canceladaEn),
          renovable: s.plan.renovable,
          eventos: s.eventos.slice(0, 10).map((e) => ({
            tipo: e.tipo,
            motivo: e.motivo,
            por: e.actor?.nombre ?? 'sistema',
            fecha: fechaCaracas(e.creadoEn),
          })),
          ...(facturas ? { facturas: facturas.map(vistaFactura) } : {}),
        };
      }
      case 'facturas_pendientes': {
        const p = PARAMETROS_HERRAMIENTA.facturas_pendientes.parse(argumentos);
        const r = await this.facturas.listar(auth, {
          estado: 'emitida',
          ...(p.clienteId ? { clienteId: p.clienteId } : {}),
          pagina: 1,
          porPagina: 25,
        });
        return { total: r.total, facturas: r.elementos.map(vistaFactura) };
      }
      case 'pagos_por_conciliar': {
        const r = await this.pagos.listar(auth, {
          estado: 'en_revision',
          pagina: 1,
          porPagina: 25,
        });
        const ahora = Date.now();
        return {
          total: r.total,
          pagos: r.elementos.map((p) => ({
            id: p.id,
            referencia: p.referencia,
            cliente: p.cliente.nombre,
            factura: p.factura.numero,
            totalFactura: monto(p.factura.total, p.factura.moneda),
            metodo: p.metodo.nombre,
            montoDeclarado: monto(p.montoDeclarado, p.moneda),
            referenciaBanco: p.referenciaExterna,
            fechaPago: fechaCaracas(p.fechaPago),
            reportadoEn: fechaCaracas(p.creadoEn),
            horasEnEspera: Math.floor((ahora - Date.parse(p.creadoEn)) / 3_600_000),
            tieneComprobante: p.tieneComprobante,
          })),
        };
      }
      case 'tickets_abiertos': {
        const p = PARAMETROS_HERRAMIENTA.tickets_abiertos.parse(argumentos);
        const r = await this.tickets.listar(auth, {
          abiertos: true,
          ...(p.prioridad ? { prioridad: p.prioridad } : {}),
          ...(p.soloMios ? { asignacion: 'mios' as const } : {}),
          pagina: 1,
          porPagina: 25,
        });
        return {
          total: r.total,
          tickets: r.elementos.map((t) => ({
            id: t.id,
            numero: t.numero,
            asunto: t.asunto,
            categoria: t.categoria,
            prioridad: t.prioridad,
            estado: t.estado,
            cliente: t.cliente.nombre,
            asignadoA: t.asignadoA?.nombre ?? null,
            respondido: t.primeraRespuestaEn !== null,
            plazoPrimeraRespuesta: fechaCaracas(t.slaPrimeraRespuesta),
            plazoIncumplido: t.slaIncumplido,
            actualizadoEn: fechaCaracas(t.actualizadoEn),
          })),
        };
      }
      case 'ver_ticket': {
        const p = PARAMETROS_HERRAMIENTA.ver_ticket.parse(argumentos);
        const t = await this.tickets.obtener(auth, p.ticketId);
        const ultimos = t.mensajes.slice(-15);
        return {
          id: t.id,
          numero: t.numero,
          asunto: t.asunto,
          categoria: t.categoria,
          prioridad: t.prioridad,
          estado: t.estado,
          clienteId: t.cliente.id,
          cliente: t.cliente.nombre,
          asignadoA: t.asignadoA?.nombre ?? null,
          suscripcionId: t.suscripcionId,
          plazoIncumplido: t.slaIncumplido,
          mensajesAnterioresOmitidos: t.mensajes.length - ultimos.length,
          mensajes: ultimos.map((m) => ({
            de:
              m.autor.id === 'sistema'
                ? 'sistema'
                : m.autor.esEquipo
                  ? `equipo (${m.autor.nombre})`
                  : 'cliente',
            interno: m.interno,
            fecha: fechaCaracas(m.creadoEn),
            texto: recortar(m.texto, 1500),
          })),
        };
      }
      case 'resumen_metricas': {
        const m = await this.metricas.panel(auth);
        return {
          soloTuCartera: m.soloCartera,
          clientesActivos: m.clientesActivos,
          clientesNuevosMes: m.clientesNuevosMes,
          suscripcionesPorEstado: m.suscripcionesPorEstado,
          ingresoMensualRecurrente: monto(m.ingresoMensualRecurrenteUsd, 'USD'),
          ingresosMes: m.ingresosMes.map((i) => ({
            total: monto(i.total, i.moneda),
            pagos: i.pagos,
          })),
          ingresosMesEnUsd: monto(m.ingresosMesUsd, 'USD'),
          enBolivares: m.enBolivares
            ? {
                tasa: `${m.enBolivares.tasa} VES por USD`,
                ingresoMensualRecurrente: monto(m.enBolivares.ingresoMensualRecurrente, 'VES'),
                ingresosMes: monto(m.enBolivares.ingresosMes, 'VES'),
              }
            : null,
          pagosEnRevision: m.pagosEnRevision,
          facturasVencidas: m.facturasVencidas,
          ticketsAbiertos: m.ticketsAbiertos,
          ticketsConPlazoIncumplido: m.ticketsSlaIncumplido,
          proximosVencimientos: m.proximosVencimientos.map(vistaSuscripcion),
          monedasSinTasa: m.tasasFaltantes,
        };
      }
      case 'tasa_del_dia': {
        const tasas = await this.tasas.vigentes();
        return {
          tasas: tasas.map((t) => ({
            moneda: t.moneda,
            valor: `${t.valor} ${t.moneda} por 1 USD`,
            vigenteDesde: fechaCaracas(t.vigenteDesde),
            origen: t.origen,
          })),
        };
      }
      case 'revendedores_saldo_bajo': {
        const conf = await this.automatizaciones.leer('saldo_bajo_revendedor');
        const umbral = D(conf.parametros.umbralUsd);
        // Consulta fija y de solo lectura (sin cartera: revendedores.ver ve a todos).
        const where = { estado: 'aprobado' as const, saldoUsd: { lt: umbral } };
        const [total, filas] = await Promise.all([
          this.prisma.revendedor.count({ where }),
          this.prisma.revendedor.findMany({
            where,
            orderBy: [{ saldoUsd: 'asc' }, { id: 'asc' }],
            take: 20,
            select: {
              id: true,
              nombreComercial: true,
              pais: true,
              saldoUsd: true,
              usuario: { select: { nombre: true } },
              nivel: { select: { nombre: true } },
            },
          }),
        ]);
        return {
          umbral: monto(umbral.toFixed(2), 'USD'),
          avisoAutomaticoActivo: conf.activa,
          total,
          revendedores: filas.map((r) => ({
            id: r.id,
            nombre: r.nombreComercial ?? r.usuario.nombre,
            pais: r.pais,
            nivel: r.nivel?.nombre ?? null,
            saldo: monto(r.saldoUsd.toFixed(2), 'USD'),
          })),
        };
      }
      default:
        throw new ErrorApp(400, 'HERRAMIENTA_NO_CONSULTA', 'Esa herramienta no es una consulta.');
    }
  }

  // ── Acciones ───────────────────────────────────────────────────────────────

  /**
   * Comprueba que el objetivo existe, está al alcance de quien pide y admite la
   * acción, y arma el resumen con datos de la base (no con palabras del modelo).
   */
  async preparar(
    nombre: NombreHerramienta,
    argumentos: unknown,
    auth: ContextoAuth,
  ): Promise<{ resumen: string }> {
    const planDe = (s: SuscripcionPublica) => `${s.plan.servicio} · ${s.plan.nombre}`;
    switch (nombre) {
      case 'pausar_suscripcion': {
        const p = PARAMETROS_HERRAMIENTA.pausar_suscripcion.parse(argumentos);
        const s = await this.suscripciones.obtener(auth, p.suscripcionId);
        if (s.estado !== 'activa') {
          throw noSePuede(`Solo se pausan suscripciones activas; esta está «${s.estado}».`);
        }
        return {
          resumen: `Pausar la suscripción de ${s.cliente.nombre} (${planDe(s)}, vence ${fechaCaracas(s.venceEn)}) · motivo: ${p.motivo}`,
        };
      }
      case 'reanudar_suscripcion': {
        const p = PARAMETROS_HERRAMIENTA.reanudar_suscripcion.parse(argumentos);
        const s = await this.suscripciones.obtener(auth, p.suscripcionId);
        if (s.estado !== 'pausada') throw noSePuede('La suscripción no está pausada.');
        return { resumen: `Reanudar la suscripción pausada de ${s.cliente.nombre} (${planDe(s)})` };
      }
      case 'emitir_renovacion': {
        const p = PARAMETROS_HERRAMIENTA.emitir_renovacion.parse(argumentos);
        const s = await this.suscripciones.obtener(auth, p.suscripcionId);
        if (!['activa', 'en_gracia', 'suspendida', 'vencida'].includes(s.estado)) {
          throw noSePuede(`No se puede renovar una suscripción «${s.estado}».`);
        }
        if (s.cancelarAlVencer) throw noSePuede('Tiene una cancelación programada.');
        if (s.facturaAbierta) {
          throw noSePuede(`Ya tiene la factura ${s.facturaAbierta.numero} sin pagar.`);
        }
        return {
          resumen: `Emitir la factura de renovación de ${s.cliente.nombre} (${planDe(s)}, en ${s.moneda}). No cobra nada.`,
        };
      }
      case 'responder_ticket': {
        const p = PARAMETROS_HERRAMIENTA.responder_ticket.parse(argumentos);
        const t = await this.tickets.obtener(auth, p.ticketId);
        if (t.estado === 'cerrado') throw noSePuede('El ticket está cerrado.');
        return {
          resumen: p.interno
            ? `Agregar una nota interna al ticket #${t.numero} de ${t.cliente.nombre} («${t.asunto}»)`
            : `Responder al cliente ${t.cliente.nombre} en el ticket #${t.numero} («${t.asunto}»)`,
        };
      }
      case 'actualizar_ticket': {
        const p = PARAMETROS_HERRAMIENTA.actualizar_ticket.parse(argumentos);
        const t = await this.tickets.obtener(auth, p.ticketId);
        const cambios: string[] = [];
        if (p.estado && p.estado !== t.estado) cambios.push(`estado ${t.estado} → ${p.estado}`);
        if (p.prioridad && p.prioridad !== t.prioridad) {
          cambios.push(`prioridad ${t.prioridad} → ${p.prioridad}`);
        }
        if (!cambios.length) throw noSePuede('El ticket ya tiene ese estado y esa prioridad.');
        return {
          resumen: `Cambiar el ticket #${t.numero} de ${t.cliente.nombre}: ${cambios.join('; ')}`,
        };
      }
      case 'agregar_nota_cliente': {
        const p = PARAMETROS_HERRAMIENTA.agregar_nota_cliente.parse(argumentos);
        const c = await this.clientes.obtener(auth, p.clienteId);
        return { resumen: `Guardar una nota interna en la ficha de ${c.nombre}` };
      }
      default:
        throw new ErrorApp(400, 'HERRAMIENTA_NO_ACCION', 'Esa herramienta no es una acción.');
    }
  }

  /**
   * Ejecuta una acción confirmada con la autenticación de QUIEN CONFIRMA (sus
   * permisos y su cartera) y los datos de su petición. Los servicios auditan el
   * cambio como siempre. Devuelve una frase con el resultado.
   */
  async ejecutar(
    nombre: NombreHerramienta,
    parametros: unknown,
    auth: ContextoAuth,
    cliente: InfoCliente,
  ): Promise<string> {
    switch (nombre) {
      case 'pausar_suscripcion': {
        const p = PARAMETROS_HERRAMIENTA.pausar_suscripcion.parse(parametros);
        const s = await this.suscripciones.pausar(auth, p.suscripcionId, p.motivo, cliente);
        return `Suscripción de ${s.cliente.nombre} pausada.`;
      }
      case 'reanudar_suscripcion': {
        const p = PARAMETROS_HERRAMIENTA.reanudar_suscripcion.parse(parametros);
        const s = await this.suscripciones.reanudar(auth, p.suscripcionId, cliente);
        return `Suscripción de ${s.cliente.nombre} reanudada; vence el ${fechaCaracas(s.venceEn)}.`;
      }
      case 'emitir_renovacion': {
        const p = PARAMETROS_HERRAMIENTA.emitir_renovacion.parse(parametros);
        const r = await this.suscripciones.renovar(auth, p.suscripcionId, undefined, cliente);
        return `Factura ${r.factura.numero} emitida para ${r.suscripcion.cliente.nombre}.`;
      }
      case 'responder_ticket': {
        const p = PARAMETROS_HERRAMIENTA.responder_ticket.parse(parametros);
        const t = await this.tickets.responder(
          auth,
          p.ticketId,
          { texto: p.texto, interno: p.interno },
          cliente,
        );
        return p.interno
          ? `Nota interna guardada en el ticket #${t.numero}.`
          : `Respuesta enviada en el ticket #${t.numero}.`;
      }
      case 'actualizar_ticket': {
        const p = PARAMETROS_HERRAMIENTA.actualizar_ticket.parse(parametros);
        const t = await this.tickets.actualizar(
          auth,
          p.ticketId,
          {
            ...(p.estado ? { estado: p.estado } : {}),
            ...(p.prioridad ? { prioridad: p.prioridad } : {}),
          },
          cliente,
        );
        return `Ticket #${t.numero} actualizado: estado ${t.estado}, prioridad ${t.prioridad}.`;
      }
      case 'agregar_nota_cliente': {
        const p = PARAMETROS_HERRAMIENTA.agregar_nota_cliente.parse(parametros);
        await this.clientes.agregarNota(auth, p.clienteId, p.texto, cliente);
        return 'Nota interna guardada en la ficha del cliente.';
      }
      default:
        throw new ErrorApp(400, 'HERRAMIENTA_NO_ACCION', 'Esa herramienta no es una acción.');
    }
  }
}
