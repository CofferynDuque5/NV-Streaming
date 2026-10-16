import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { CobroAutomatico, Factura, Pago, Prisma, PrismaClient } from '@nv/db';
import {
  type CobroAutomaticoResumen,
  formatearMonto,
  type Pagina,
  type TipoAutomatizacion,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  type ConfigAutomatizacion,
  ConfigAutomatizacionesService,
} from '../automatizaciones/configuracion.service.js';
import { EjecutorAutomatizacionesService } from '../automatizaciones/ejecutor.service.js';
import { DIA_MS, fechaLarga, inicioDiaCaracas } from '../automatizaciones/horario.js';
import {
  mensajeError,
  plural,
  Recuento,
  type ResultadoTarea,
} from '../automatizaciones/recuento.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { INCLUIR_PLAN } from '../catalogo/catalogo.service.js';
import { FacturacionService } from '../cobros/facturacion.service.js';
import { PagosService } from '../cobros/pagos.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { D } from '../dinero/dinero.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import type { ResultadoPago } from './adaptador.js';
import { AvisosEquipoPagosService } from './avisos-equipo.service.js';
import { MetodosAutorizadosService, RUTA_METODOS } from './metodos-autorizados.service.js';
import { esPasarela } from './pasarelas.js';
import { cobroResumen, INCLUIR_COBRO } from './presentacion.js';
import { RegistroPasarelas } from './registro.service.js';

type Tx = Prisma.TransactionClient;
type Config = ConfigAutomatizacion<'cobro_automatico'>;

const TIPO: TipoAutomatizacion = 'cobro_automatico';
/** Un cobro "en curso" sin respuesta desde hace más de esto se vuelve a pedir (misma clave). */
const MINUTOS_REINTENTO_EN_CURSO = 10;
const POR_PAGINA = 20;

/** Suscripciones a las que NV cobra: sin revendedor de por medio. */
const SIN_REVENDEDOR = {
  revendedorId: null,
  cliente: { revendedorId: null, estado: 'activo' },
} as const;

/** Estados en los que una renovación todavía se puede cobrar. */
const COBRABLES = ['activa', 'en_gracia', 'suspendida', 'vencida'] as const;

export const claveCobro = (facturaId: string, intento: number) => `cobro:${facturaId}:${intento}`;

const servicioDe = (s: { plan: { nombre: string; servicio: { nombre: string } } }) =>
  `${s.plan.servicio.nombre} · ${s.plan.nombre}`;

interface Desenlace {
  cobro: CobroAutomatico;
  resultado: 'exitoso' | 'fallido' | 'cancelado' | 'pendiente' | 'sin_cambio';
  pago?: Pago;
  revision?: string | null;
  proximo?: Date | null;
  metodoInvalidado?: string | null;
  motivo?: string;
}

/**
 * Cobro automático autorizado (automatización `cobro_automatico`): el día del
 * vencimiento cobra la renovación con el método que el cliente autorizó; si
 * falla, reintenta los días configurados después del vencimiento y avisa; tras
 * el último intento se detiene y sigue el flujo normal de gracia y suspensión.
 *
 * Nunca cobra sin una autorización activa del mismo cliente enganchada a la
 * suscripción, y nunca dos veces la misma factura: un cobro por factura e
 * intento (índices únicos) y la misma clave de idempotencia en la pasarela.
 */
@Injectable()
export class CobrosAutomaticosService implements OnModuleInit {
  private readonly logger = new Logger('CobroAutomatico');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(MetodosAutorizadosService) private readonly metodos: MetodosAutorizadosService,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(AvisosEquipoPagosService) private readonly equipo: AvisosEquipoPagosService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(EjecutorAutomatizacionesService)
    private readonly ejecutor: EjecutorAutomatizacionesService,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
  ) {}

  onModuleInit(): void {
    this.ejecutor.registrarTarea(TIPO, (config, ahora) => this.ejecutar(config as Config, ahora));
  }

  // ── Equipo ─────────────────────────────────────────────────────────────────

  async listar(
    auth: ContextoAuth,
    filtro: { estado?: CobroAutomatico['estado'] | undefined; pagina: number },
  ): Promise<Pagina<CobroAutomaticoResumen>> {
    const where: Prisma.CobroAutomaticoWhereInput = {
      factura: { cliente: alcanceClientes(auth) },
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.cobroAutomatico.count({ where }),
      this.prisma.cobroAutomatico.findMany({
        where,
        include: INCLUIR_COBRO,
        orderBy: [{ programadoPara: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    return {
      elementos: filas.map(cobroResumen),
      total,
      pagina: filtro.pagina,
      porPagina: POR_PAGINA,
    };
  }

  // ── Automatización ─────────────────────────────────────────────────────────

  /** Una pasada diaria: avisos del día anterior, cobros del día y reintentos que tocan. */
  async ejecutar(config: Config, ahora: Date): Promise<ResultadoTarea> {
    const r = new Recuento();
    let exitosos = 0;
    let fallidos = 0;
    let avisados = 0;

    // 1) Aviso previo: "mañana cobraremos X con Y".
    for (const s of await this.conCobroAutomatico(
      inicioDiaCaracas(ahora, 1),
      inicioDiaCaracas(ahora, 2),
    )) {
      try {
        if (await this.avisoPrevio(s.id, config)) avisados += 1;
      } catch (e) {
        r.error(`Aviso previo de ${s.id}: ${mensajeError(e)}`);
      }
    }

    // 2) Vencen hoy: factura de renovación (si falta) y primer intento de cobro.
    for (const s of await this.conCobroAutomatico(
      inicioDiaCaracas(ahora),
      inicioDiaCaracas(ahora, 1),
    )) {
      try {
        await this.programarPrimero(s.id, ahora);
      } catch (e) {
        r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
      }
    }

    // 3) Ejecuta lo programado que ya toca (primeros intentos y reintentos) y
    //    vuelve a pedir los que quedaron sin respuesta de la pasarela.
    const pendientes = await this.prisma.cobroAutomatico.findMany({
      where: {
        OR: [
          { estado: 'programado', programadoPara: { lte: ahora } },
          {
            estado: 'en_curso',
            ejecutadoEn: { lt: new Date(ahora.getTime() - MINUTOS_REINTENTO_EN_CURSO * 60_000) },
          },
        ],
      },
      orderBy: [{ programadoPara: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true },
    });
    for (const c of pendientes) {
      try {
        const d = await this.ejecutarCobro(c.id, config, ahora);
        if (d.resultado === 'exitoso') exitosos += 1;
        else if (d.resultado === 'fallido') fallidos += 1;
        else r.omitidos += 1;
      } catch (e) {
        r.error(`Cobro ${c.id}: ${mensajeError(e)}`);
      }
    }
    r.procesados += exitosos + fallidos;
    const partes = [
      plural(exitosos, 'cobro exitoso', 'cobros exitosos'),
      plural(fallidos, 'fallido', 'fallidos'),
      plural(avisados, 'aviso previo', 'avisos previos'),
    ];
    if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
    return r.resultado(`${partes.join(', ')}.`);
  }

  /** Suscripciones con cobro automático activo que vencen en [desde, hasta). */
  private conCobroAutomatico(desde: Date, hasta: Date) {
    return this.prisma.suscripcion.findMany({
      where: {
        ...SIN_REVENDEDOR,
        estado: { in: ['activa', 'en_gracia'] },
        cancelarAlVencer: false,
        metodoAutorizado: { estado: 'activo' },
        venceEn: { gte: desde, lt: hasta },
      },
      select: { id: true },
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
  }

  private async avisoPrevio(suscripcionId: string, config: Config): Promise<boolean> {
    const s = await this.prisma.suscripcion.findUniqueOrThrow({
      where: { id: suscripcionId },
      include: {
        plan: { include: INCLUIR_PLAN },
        metodoAutorizado: true,
        facturas: { where: { estado: 'emitida' }, take: 1 },
      },
    });
    const m = s.metodoAutorizado;
    if (!m || m.estado !== 'activo' || !s.venceEn) return false;
    let monto: string;
    const abierta = s.facturas[0];
    if (abierta) {
      monto = formatearMonto(abierta.total.toFixed(2), abierta.moneda);
    } else {
      const c = await this.prisma.$transaction((tx) =>
        this.facturacion.calcular(tx, {
          plan: s.plan,
          moneda: s.moneda,
          concepto: 'renovacion',
          clienteId: s.clienteId,
        }),
      );
      monto = formatearMonto(c.total.toFixed(2), s.moneda);
    }
    const venceEn = s.venceEn;
    const url = this.correo.urlWeb(RUTA_METODOS);
    const servicio = servicioDe(s);
    const res = await this.avisos.avisar({
      plantilla: 'cobroAutomaticoProximo',
      destinatario: { clienteId: s.clienteId },
      claveUnica: `cobro_automatico:aviso:${s.id}:${venceEn.toISOString()}`,
      automatizacion: TIPO,
      canales: config.canales,
      entidad: { tipo: 'suscripcion', id: s.id },
      contenido: (nombre) => ({
        correo: Plantillas.cobroAutomaticoProximo(
          nombre,
          servicio,
          monto,
          m.descripcion,
          fechaLarga(venceEn),
          url,
        ),
      }),
    });
    return res.enviadas > 0;
  }

  /**
   * Asegura la factura de renovación (mismas reglas que una renovación manual)
   * y crea el primer intento de cobro, una sola vez por factura.
   */
  async programarPrimero(suscripcionId: string, ahora: Date): Promise<CobroAutomatico | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${suscripcionId}::uuid FOR UPDATE`;
      const s = await tx.suscripcion.findUniqueOrThrow({
        where: { id: suscripcionId },
        include: { metodoAutorizado: true, cliente: { select: { revendedorId: true } } },
      });
      const m = s.metodoAutorizado;
      if (
        !m ||
        m.estado !== 'activo' ||
        m.clienteId !== s.clienteId ||
        s.cancelarAlVencer ||
        s.revendedorId !== null ||
        s.cliente.revendedorId !== null ||
        !(['activa', 'en_gracia'] as string[]).includes(s.estado)
      ) {
        return null;
      }
      let factura: Factura | null = await tx.factura.findFirst({
        where: { suscripcionId: s.id, estado: 'emitida', concepto: 'renovacion' },
        orderBy: { creadoEn: 'desc' },
      });
      if (!factura) {
        factura = await this.suscripciones.facturarRenovacion(tx, s, s.moneda, null);
        if (factura.estado !== 'emitida') return null; // Gratis: ya quedó renovada.
      }
      if (factura.moneda !== m.moneda) {
        throw new Error(
          `La factura ${numeroFactura(factura.numero)} está en ${factura.moneda} y el método cobra en ${m.moneda}.`,
        );
      }
      const ya = await tx.cobroAutomatico.count({ where: { facturaId: factura.id } });
      if (ya > 0) return null;
      const cobro = await tx.cobroAutomatico.create({
        data: {
          facturaId: factura.id,
          suscripcionId: s.id,
          metodoId: m.id,
          intento: 1,
          programadoPara: ahora,
          claveIdempotencia: claveCobro(factura.id, 1),
        },
      });
      return cobro;
    });
  }

  /**
   * Ejecuta un cobro programado (o vuelve a pedir uno en curso con la misma
   * clave de idempotencia). Revisa todo de nuevo antes de cobrar.
   */
  async ejecutarCobro(cobroId: string, config: Config, ahora = new Date()): Promise<Desenlace> {
    // 1) Validar y marcarlo en curso.
    const previo = await this.prisma.$transaction(async (tx): Promise<Desenlace | null> => {
      const c = await this.bloquear(tx, cobroId);
      if (c.estado !== 'programado' && c.estado !== 'en_curso')
        return { cobro: c, resultado: 'sin_cambio' };
      // Uno "en curso" ya se pidió a la pasarela: se vuelve a pedir con la misma clave para
      // conocer su resultado (nunca se cancela a ciegas: podría estar cobrado).
      if (c.estado === 'en_curso') return null;
      const motivo = await this.motivoParaNoCobrar(tx, c);
      if (motivo) {
        const cancelado = await tx.cobroAutomatico.update({
          where: { id: c.id },
          data: { estado: 'cancelado', error: motivo },
        });
        await this.auditar(tx, cancelado, 'cobro_automatico.cancelado', { motivo });
        return { cobro: cancelado, resultado: 'cancelado', motivo };
      }
      {
        await tx.cobroAutomatico.update({
          where: { id: c.id },
          data: { estado: 'en_curso', ejecutadoEn: ahora },
        });
      }
      return null;
    });
    if (previo) return previo;

    // 2) Cobrar en la pasarela (fuera de la transacción).
    const c = await this.prisma.cobroAutomatico.findUniqueOrThrow({
      where: { id: cobroId },
      include: { factura: true, metodo: true },
    });
    let r: ResultadoPago;
    try {
      const adaptador = this.registro.exigir(c.metodo.pasarela);
      r = await adaptador.cobrarConMetodo(this.metodos.token(c.metodo), {
        referencia: `${numeroFactura(c.factura.numero)}-${c.intento}`,
        monto: c.factura.total.toFixed(2),
        moneda: c.factura.moneda,
        descripcion: `Renovación ${numeroFactura(c.factura.numero)} · NV Streaming`,
        claveIdempotencia: c.claveIdempotencia,
      });
    } catch (e) {
      // Sin respuesta: queda "en curso" y la próxima pasada lo pide de nuevo con la misma clave.
      await this.prisma.cobroAutomatico.update({
        where: { id: c.id },
        data: { error: `Sin respuesta de la pasarela: ${mensajeError(e)}`.slice(0, 500) },
      });
      throw e;
    }
    const d = await this.aplicarResultado(cobroId, r, config);
    await this.despues(d);
    return d;
  }

  /** Webhook de un cobro: vuelve a pedir el resultado con la misma clave (idempotente). */
  async resolverPorIdCobro(pasarela: string, idCobro: string, config?: Config): Promise<boolean> {
    const c = await this.prisma.cobroAutomatico.findFirst({
      where: { idExterno: idCobro, metodo: { pasarela } },
    });
    if (!c) return false;
    if (c.estado === 'en_curso') {
      await this.ejecutarCobro(c.id, config ?? (await this.configPorDefecto()));
    }
    return true;
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private configPorDefecto(): Promise<Config> {
    return this.config.leer('cobro_automatico');
  }

  /** Por qué ya no se debe cobrar (o null si se puede). Nunca sin autorización activa. */
  private async motivoParaNoCobrar(tx: Tx, c: CobroAutomatico): Promise<string | null> {
    const factura = await tx.factura.findUniqueOrThrow({ where: { id: c.facturaId } });
    const s = await tx.suscripcion.findUniqueOrThrow({
      where: { id: c.suscripcionId },
      include: { cliente: { select: { revendedorId: true } } },
    });
    const m = await tx.metodoPagoAutorizado.findUniqueOrThrow({ where: { id: c.metodoId } });
    if (factura.estado !== 'emitida') return 'La factura ya no está pendiente.';
    if (m.estado !== 'activo') return 'La autorización ya no está activa.';
    if (s.metodoAutorizadoId !== m.id)
      return 'El cobro automático se desactivó o cambió de método.';
    if (m.clienteId !== s.clienteId || m.clienteId !== factura.clienteId) {
      return 'El método no pertenece al titular de la factura.';
    }
    if (s.revendedorId !== null || s.cliente.revendedorId !== null) {
      return 'La suscripción la gestiona un revendedor.';
    }
    if (s.cancelarAlVencer || !(COBRABLES as readonly string[]).includes(s.estado)) {
      return 'La suscripción ya no se renueva.';
    }
    if (factura.moneda !== m.moneda) return 'La factura está en otra moneda que el método.';
    if (!esPasarela(m.pasarela) || !this.registro.disponible(m.pasarela)) {
      return 'La pasarela no está disponible.';
    }
    return null;
  }

  private async aplicarResultado(
    cobroId: string,
    r: ResultadoPago,
    config: Config,
  ): Promise<Desenlace> {
    return this.prisma.$transaction(async (tx): Promise<Desenlace> => {
      const c = await this.bloquear(tx, cobroId);
      if (c.estado !== 'en_curso') return { cobro: c, resultado: 'sin_cambio' };
      const factura = await tx.factura.findUniqueOrThrow({ where: { id: c.facturaId } });
      const m = await tx.metodoPagoAutorizado.findUniqueOrThrow({ where: { id: c.metodoId } });

      if (r.estado === 'pendiente') {
        const f = await tx.cobroAutomatico.update({
          where: { id: c.id },
          data: { idExterno: r.idCobro ?? c.idExterno },
        });
        return { cobro: f, resultado: 'pendiente' };
      }

      if (r.estado === 'aprobado') {
        if (!r.idCobro || !r.montoRecibido || !r.moneda) {
          throw new Error(`La pasarela aprobó el cobro ${c.id} sin id, monto o moneda.`);
        }
        const recibido = D(r.montoRecibido);
        let revision: string | null = null;
        if (r.moneda !== factura.moneda || !recibido.eq(factura.total)) {
          revision = `La pasarela cobró ${formatearMonto(recibido.toFixed(2), r.moneda)} y la factura es de ${formatearMonto(factura.total.toFixed(2), factura.moneda)}.`;
        } else if (factura.estado !== 'emitida') {
          revision = `La factura ya no estaba pendiente (${factura.estado}) cuando se cobró.`;
        } else if (
          (await tx.pago.count({ where: { facturaId: factura.id, estado: 'en_revision' } })) > 0
        ) {
          revision = 'La factura tenía otro pago en revisión.';
        }
        const metodoCobroId =
          m.metodoCobroId ?? (await this.metodoCobroDe(tx, m.pasarela, factura.moneda));
        const existente = await tx.pago.findUnique({
          where: { pasarela_idExterno: { pasarela: m.pasarela, idExterno: r.idCobro } },
        });
        const pago =
          existente ??
          (await this.pagos.registrarDePasarela(tx, {
            facturaId: factura.id,
            metodoCobroId,
            pasarela: m.pasarela,
            idCobro: r.idCobro,
            moneda: r.moneda,
            montoDeclarado: factura.total,
            recibido,
            revision,
            creadoPorId: null,
          }));
        const f = await tx.cobroAutomatico.update({
          where: { id: c.id },
          data: { estado: 'exitoso', pagoId: pago.id, idExterno: r.idCobro, error: revision },
        });
        await this.auditar(tx, f, 'cobro_automatico.exitoso', {
          pagoId: pago.id,
          idCobro: r.idCobro,
          recibido: recibido.toFixed(2),
          moneda: r.moneda,
          ...(revision ? { revision } : {}),
        });
        return { cobro: f, resultado: 'exitoso', pago, revision };
      }

      // Rechazado (o cancelado): falla este intento y se programa el siguiente, si queda.
      const motivo = r.mensaje ?? 'La pasarela rechazó el cobro.';
      const f = await tx.cobroAutomatico.update({
        where: { id: c.id },
        data: {
          estado: 'fallido',
          idExterno: r.idCobro ?? c.idExterno,
          error: motivo.slice(0, 500),
        },
      });
      let proximo: Date | null = null;
      let metodoInvalidado: string | null = null;
      if (r.metodoInvalido) {
        if (await this.metodos.invalidar(tx, m.id, motivo)) metodoInvalidado = m.id;
      } else {
        proximo = await this.programarReintento(tx, f, config);
      }
      await this.auditar(tx, f, 'cobro_automatico.fallido', {
        motivo,
        metodoInvalido: Boolean(r.metodoInvalido),
        proximoIntento: proximo?.toISOString() ?? null,
      });
      return { cobro: f, resultado: 'fallido', proximo, metodoInvalidado, motivo };
    });
  }

  /**
   * Reintento según `reintentosDias` (días después del día del primer cobro, a
   * la hora de la automatización). Tras el último, no se programa nada más.
   */
  private async programarReintento(
    tx: Tx,
    c: CobroAutomatico,
    config: Config,
  ): Promise<Date | null> {
    const dias = [...config.parametros.reintentosDias].sort((a, b) => a - b);
    const siguiente = dias[c.intento - 1];
    if (siguiente === undefined) return null;
    const primero = await tx.cobroAutomatico.findUnique({
      where: { facturaId_intento: { facturaId: c.facturaId, intento: 1 } },
    });
    const base = inicioDiaCaracas(primero?.programadoPara ?? c.programadoPara);
    const cuando = new Date(
      base.getTime() + siguiente * DIA_MS + config.parametros.hora * 3600_000,
    );
    const intento = c.intento + 1;
    await tx.cobroAutomatico.create({
      data: {
        facturaId: c.facturaId,
        suscripcionId: c.suscripcionId,
        metodoId: c.metodoId,
        intento,
        programadoPara: cuando,
        claveIdempotencia: claveCobro(c.facturaId, intento),
      },
    });
    return cuando;
  }

  /** Método de cobro con el que registrar el pago si el método autorizado no lo tiene. */
  private async metodoCobroDe(
    tx: Tx,
    pasarela: string,
    moneda: Factura['moneda'],
  ): Promise<string> {
    const m = await tx.metodoCobro.findFirst({
      where: { tipo: 'pasarela', pasarela, moneda },
      orderBy: [{ activo: 'desc' }, { orden: 'asc' }],
      select: { id: true },
    });
    if (!m)
      throw new Error(
        `No hay un método de cobro de ${pasarela} en ${moneda} para registrar el pago.`,
      );
    return m.id;
  }

  /** Avisos después de confirmar: al cliente (y al equipo si quedó en revisión). */
  private async despues(d: Desenlace): Promise<void> {
    try {
      if (d.resultado === 'exitoso' && d.pago) {
        if (d.revision) await this.equipo.revision(d.pago.id, d.revision);
        else await this.avisarCliente(d, 'cobroAutomaticoRealizado');
      } else if (d.resultado === 'fallido') {
        await this.avisarCliente(d, 'cobroAutomaticoFallido');
        if (d.metodoInvalidado) await this.metodos.avisarInvalido(d.metodoInvalidado);
      }
    } catch (e) {
      this.logger.warn(`Aviso del cobro ${d.cobro.id} no enviado: ${mensajeError(e)}`);
    }
  }

  private async avisarCliente(
    d: Desenlace,
    plantilla: 'cobroAutomaticoRealizado' | 'cobroAutomaticoFallido',
  ): Promise<void> {
    const c = await this.prisma.cobroAutomatico.findUniqueOrThrow({
      where: { id: d.cobro.id },
      include: {
        factura: true,
        metodo: { select: { descripcion: true } },
        suscripcion: { include: { plan: { include: { servicio: { select: { nombre: true } } } } } },
      },
    });
    const servicio = servicioDe(c.suscripcion);
    const monto = formatearMonto(c.factura.total.toFixed(2), c.factura.moneda);
    const numero = numeroFactura(c.factura.numero);
    const urlFactura = this.correo.urlWeb(`/cuenta/facturas/${c.facturaId}`);
    await this.avisos.avisar({
      plantilla,
      destinatario: { clienteId: c.factura.clienteId },
      claveUnica: `cobro_automatico:${plantilla}:${c.id}`,
      automatizacion: TIPO,
      entidad: { tipo: 'factura', id: c.facturaId },
      contenido: (nombre) => ({
        correo:
          plantilla === 'cobroAutomaticoRealizado'
            ? Plantillas.cobroAutomaticoRealizado(
                nombre,
                servicio,
                numero,
                monto,
                c.metodo.descripcion,
                this.correo.urlWeb('/cuenta'),
              )
            : Plantillas.cobroAutomaticoFallido(
                nombre,
                servicio,
                monto,
                c.metodo.descripcion,
                d.motivo ?? c.error ?? 'La pasarela rechazó el cobro.',
                d.proximo ? fechaLarga(d.proximo) : null,
                urlFactura,
              ),
      }),
    });
  }

  private async auditar(
    tx: Tx,
    c: CobroAutomatico,
    accion: string,
    despues: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        actorTipo: 'sistema',
        accion,
        entidad: 'cobro_automatico',
        entidadId: c.id,
        despues: {
          facturaId: c.facturaId,
          suscripcionId: c.suscripcionId,
          metodoId: c.metodoId,
          intento: c.intento,
          ...despues,
        },
      },
      tx,
    );
  }

  private async bloquear(tx: Tx, id: string): Promise<CobroAutomatico> {
    await tx.$queryRaw`SELECT id FROM cobros_automaticos WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.cobroAutomatico.findUniqueOrThrow({ where: { id } });
  }
}
