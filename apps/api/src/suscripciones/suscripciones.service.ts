import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EstadoSuscripcion,
  Factura,
  Moneda,
  Prisma,
  PrismaClient,
  Suscripcion,
  TipoEventoSuscripcion,
} from '@nv/db';
import {
  type CancelarSuscripcionEntrada,
  type Cotizacion,
  type ListarSuscripcionesEntrada,
  type Pagina,
  REGLAS_COBRO,
  type SuscripcionDetalle,
  type SuscripcionPublica,
  tienePermiso,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { INCLUIR_PLAN, planVendible, type PlanCompleto } from '../catalogo/catalogo.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FacturacionService } from '../cobros/facturacion.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { sumarDuracion } from '../dinero/dinero.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { type OrigenEntrega, registrarEntrega, solicitarRevocacion } from '../entregas/registro.js';
import { INCLUIR_SUSCRIPCION, suscripcionDetalle, suscripcionPublica } from './presentacion.js';

type Tx = Prisma.TransactionClient;
const DIA_MS = 24 * 3600_000;
/** Llave del bloqueo que evita dos pasadas de vencimientos a la vez. */
const BLOQUEO_VENCIMIENTOS = 7_411_002;

const transicionInvalida = (mensaje: string) =>
  new ErrorApp(409, 'TRANSICION_NO_PERMITIDA', mensaje);

export interface ResultadoAlta {
  suscripcion: SuscripcionPublica;
  factura: { id: string; numero: string; estado: string };
}

/**
 * Ciclo de vida de las suscripciones (sección 5.9 de la arquitectura). Cada
 * transición bloquea la fila, comprueba el estado actual y deja un evento y
 * una entrada de auditoría en la misma transacción.
 */
@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger('Suscripciones');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
  ) {}

  async listar(
    auth: ContextoAuth,
    filtro: ListarSuscripcionesEntrada,
  ): Promise<Pagina<SuscripcionPublica>> {
    const where: Prisma.SuscripcionWhereInput = {
      cliente: alcanceClientes(auth),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.planId ? { planId: filtro.planId } : {}),
      ...(filtro.vencenEnDias
        ? {
            estado: filtro.estado ?? { in: ['activa', 'en_gracia'] },
            venceEn: { lte: new Date(Date.now() + filtro.vencenEnDias * DIA_MS) },
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.suscripcion.count({ where }),
      this.prisma.suscripcion.findMany({
        where,
        include: INCLUIR_SUSCRIPCION,
        orderBy: filtro.vencenEnDias
          ? [{ venceEn: 'asc' }, { id: 'asc' }]
          : [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(suscripcionPublica),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(auth: ContextoAuth, id: string): Promise<SuscripcionDetalle> {
    const s = await this.prisma.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: {
        ...INCLUIR_SUSCRIPCION,
        eventos: {
          orderBy: { creadoEn: 'desc' },
          include: { actor: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!s) throw Errores.noEncontrado('La suscripción');
    return suscripcionDetalle(s);
  }

  /** Precio final de un plan en una moneda, con cupón, sin guardar nada. */
  async cotizar(
    auth: ContextoAuth,
    e: { planId: string; moneda: Moneda; cupon?: string | undefined; clienteId?: string },
  ): Promise<Cotizacion> {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.planContratable(tx, auth, e.planId);
      const clienteId =
        auth.usuario.rol === 'cliente'
          ? (await this.clientes.deUsuario(auth.usuario, tx)).id
          : (e.clienteId ?? null);
      const c = await this.facturacion.calcular(tx, {
        plan,
        moneda: e.moneda,
        concepto: 'alta',
        cupon: e.cupon ?? null,
        clienteId,
      });
      return this.facturacion.cotizacion(c);
    });
  }

  /** Alta: la suscripción nace pendiente de pago con su factura. */
  async crear(
    auth: ContextoAuth,
    e: { clienteId?: string; planId: string; moneda: Moneda; cupon?: string | undefined },
    cliente: InfoCliente,
  ): Promise<ResultadoAlta> {
    return this.prisma.$transaction(async (tx) => {
      const titular =
        auth.usuario.rol === 'cliente'
          ? await this.clientes.deUsuario(auth.usuario, tx)
          : await this.clientes.exigirAlcance(auth, e.clienteId ?? '', tx);
      if (titular.estado !== 'activo') {
        throw new ErrorApp(
          409,
          'CLIENTE_ARCHIVADO',
          'El cliente está archivado; reactívalo primero.',
        );
      }
      // Serializa las altas del mismo cliente para que el límite de pendientes se cumpla.
      await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${titular.id}::uuid FOR UPDATE`;
      const pendientes = await tx.suscripcion.count({
        where: { clienteId: titular.id, estado: 'pendiente_pago' },
      });
      if (pendientes >= REGLAS_COBRO.pendientesPorCliente) {
        throw new ErrorApp(
          409,
          'DEMASIADAS_PENDIENTES',
          `Hay ${pendientes} suscripciones esperando pago. Paga o cancela alguna antes de contratar otra.`,
        );
      }
      const plan = await this.planContratable(tx, auth, e.planId);
      const s = await tx.suscripcion.create({
        data: {
          clienteId: titular.id,
          planId: plan.id,
          moneda: e.moneda,
          creadoPorId: auth.usuario.id,
        },
      });
      await this.evento(tx, s.id, 'alta', auth.usuario.id, null, {
        planId: plan.id,
        moneda: e.moneda,
      });
      const factura = await this.facturacion.emitir(tx, {
        clienteId: titular.id,
        suscripcionId: s.id,
        plan,
        moneda: e.moneda,
        concepto: 'alta',
        cupon: e.cupon ?? null,
        actorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'suscripcion.creada',
          entidad: 'suscripcion',
          entidadId: s.id,
          despues: {
            clienteId: titular.id,
            planId: plan.id,
            moneda: e.moneda,
            facturaId: factura.id,
            total: factura.total.toFixed(2),
            cupon: e.cupon ?? null,
          },
          cliente,
        },
        tx,
      );
      if (factura.estado === 'pagada') await this.aplicarPago(tx, factura, auth.usuario.id);
      return {
        suscripcion: suscripcionPublica(await this.cargar(tx, s.id)),
        factura: {
          id: factura.id,
          numero: `NV-${String(factura.numero).padStart(6, '0')}`,
          estado: factura.estado,
        },
      };
    });
  }

  /** Emite la factura de renovación. El periodo se extiende cuando se paga. */
  async renovar(
    auth: ContextoAuth,
    id: string,
    moneda: Moneda | undefined,
    cliente: InfoCliente,
  ): Promise<ResultadoAlta> {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.bloquear(tx, auth, id);
      const factura = await this.facturarRenovacion(
        tx,
        s,
        moneda ?? s.moneda,
        auth.usuario.id,
        cliente,
      );
      return {
        suscripcion: suscripcionPublica(await this.cargar(tx, id)),
        factura: {
          id: factura.id,
          numero: `NV-${String(factura.numero).padStart(6, '0')}`,
          estado: factura.estado,
        },
      };
    });
  }

  /**
   * Reglas de una renovación (manual o automática): comprueba el estado y el
   * plan, emite la factura y la audita. Exige la fila de la suscripción
   * bloqueada en la misma transacción. `actorId` nulo = la emite el sistema.
   */
  async facturarRenovacion(
    tx: Tx,
    s: Suscripcion,
    monedaFactura: Moneda,
    actorId: string | null,
    cliente?: InfoCliente,
  ): Promise<Factura> {
    if (!['activa', 'en_gracia', 'suspendida', 'vencida'].includes(s.estado)) {
      throw transicionInvalida(
        s.estado === 'pausada'
          ? 'Reanuda la suscripción antes de renovarla.'
          : 'Solo se renuevan suscripciones activas, en gracia, suspendidas o vencidas.',
      );
    }
    if (s.cancelarAlVencer) {
      throw transicionInvalida('Tiene una cancelación programada: reviértela antes de renovar.');
    }
    const plan = await tx.plan.findUnique({ where: { id: s.planId }, include: INCLUIR_PLAN });
    if (!plan || !plan.renovable || !plan.activo) {
      throw new ErrorApp(
        409,
        'PLAN_NO_RENOVABLE',
        'Este plan ya no se puede renovar. Contrata otro plan.',
      );
    }
    const factura = await this.facturacion.emitir(tx, {
      clienteId: s.clienteId,
      suscripcionId: s.id,
      plan,
      moneda: monedaFactura,
      concepto: 'renovacion',
      actorId,
    });
    if (monedaFactura !== s.moneda) {
      await tx.suscripcion.update({ where: { id: s.id }, data: { moneda: monedaFactura } });
    }
    await this.auditoria.registrar(
      {
        actorId,
        accion: 'suscripcion.renovacion_facturada',
        entidad: 'suscripcion',
        entidadId: s.id,
        despues: {
          facturaId: factura.id,
          total: factura.total.toFixed(2),
          moneda: monedaFactura,
          ...(actorId ? {} : { automatica: true }),
        },
        ...(cliente ? { cliente } : {}),
      },
      tx,
    );
    if (factura.estado === 'pagada') await this.aplicarPago(tx, factura, actorId);
    return factura;
  }

  async pausar(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (s.estado !== 'activa' || !s.venceEn) {
        throw transicionInvalida('Solo se pausan suscripciones activas.');
      }
      const ahora = new Date();
      const restantes = Math.max(0, Math.floor((s.venceEn.getTime() - ahora.getTime()) / 1000));
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'pausada', pausadaEn: ahora, segundosRestantes: restantes },
      });
      return {
        tipo: 'pausa',
        motivo,
        accion: 'suscripcion.pausada',
        datos: { segundosRestantes: restantes },
      };
    });
  }

  async reanudar(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (s.estado !== 'pausada') throw transicionInvalida('La suscripción no está pausada.');
      const venceEn = new Date(Date.now() + (s.segundosRestantes ?? 0) * 1000);
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'activa', venceEn, pausadaEn: null, segundosRestantes: null },
      });
      return {
        tipo: 'reanudacion',
        motivo: null,
        accion: 'suscripcion.reanudada',
        datos: { venceEn: venceEn.toISOString() },
      };
    });
  }

  /**
   * El cliente solo programa la cancelación al vencimiento (o cancela en el acto
   * si aún no pagó). El equipo con permiso puede cancelar en el acto.
   */
  async cancelar(
    auth: ContextoAuth,
    id: string,
    e: CancelarSuscripcionEntrada,
    cliente: InfoCliente,
  ) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (s.estado === 'cancelada') throw transicionInvalida('La suscripción ya está cancelada.');
      const puedeInmediata = tienePermiso(auth.usuario.rol, 'suscripciones.gestionar');
      const programable = ['activa', 'en_gracia'].includes(s.estado);
      const inmediata =
        s.estado === 'pendiente_pago' || !programable || (e.inmediata && puedeInmediata);
      if (inmediata && !puedeInmediata && s.estado !== 'pendiente_pago') {
        throw transicionInvalida(
          'Esta suscripción no se puede cancelar desde aquí. Escribe a soporte.',
        );
      }
      if (!inmediata) {
        if (s.cancelarAlVencer) throw transicionInvalida('La cancelación ya está programada.');
        await tx.suscripcion.update({ where: { id }, data: { cancelarAlVencer: true } });
        await this.anularFacturasAbiertas(tx, id, 'Cancelación programada', auth.usuario.id);
        return {
          tipo: 'cancelacion_programada',
          motivo: e.motivo,
          accion: 'suscripcion.cancelacion_programada',
          datos: { venceEn: s.venceEn?.toISOString() ?? null },
        };
      }
      await this.anularFacturasAbiertas(tx, id, 'Suscripción cancelada', auth.usuario.id);
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'cancelada', canceladaEn: new Date(), cancelarAlVencer: false },
      });
      await solicitarRevocacion(tx, id, `Suscripción cancelada: ${e.motivo}`);
      return {
        tipo: 'cancelacion',
        motivo: e.motivo,
        accion: 'suscripcion.cancelada',
        datos: { estadoAnterior: s.estado },
      };
    });
  }

  async revertirCancelacion(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (!s.cancelarAlVencer || !['activa', 'en_gracia'].includes(s.estado)) {
        throw transicionInvalida('No hay una cancelación programada que revertir.');
      }
      await tx.suscripcion.update({ where: { id }, data: { cancelarAlVencer: false } });
      return {
        tipo: 'cancelacion_revertida',
        motivo: null,
        accion: 'suscripcion.cancelacion_revertida',
        datos: {},
      };
    });
  }

  /**
   * Aplica una factura pagada: activa el alta o extiende el periodo. Se llama
   * dentro de la transacción que confirma el pago.
   */
  async aplicarPago(tx: Tx, factura: Factura, actorId: string | null): Promise<void> {
    if (!factura.suscripcionId) return;
    await this.aplicarPeriodo(tx, factura.suscripcionId, factura.concepto, actorId, {
      facturaId: factura.id,
    });
  }

  /**
   * Activa un alta (el periodo empieza hoy) o extiende el periodo de una
   * renovación, y deja el evento. La usan los pagos de facturas y las compras
   * de revendedores con saldo (que no generan factura). Devuelve el evento o
   * null si la suscripción no existe.
   */
  async aplicarPeriodo(
    tx: Tx,
    suscripcionId: string,
    concepto: 'alta' | 'renovacion',
    actorId: string | null,
    datos: Prisma.InputJsonObject,
  ): Promise<TipoEventoSuscripcion | null> {
    const [s] = await tx.$queryRaw<
      Suscripcion[]
    >`SELECT id FROM suscripciones WHERE id = ${suscripcionId}::uuid FOR UPDATE`;
    if (!s) return null;
    const actual = await tx.suscripcion.findUniqueOrThrow({
      where: { id: suscripcionId },
      include: { plan: true },
    });
    const ahora = new Date();
    const { duracionCantidad: n, duracionUnidad: u } = actual.plan;
    let tipo: TipoEventoSuscripcion;
    let data: Prisma.SuscripcionUpdateInput;
    let inicioPeriodo: Date;
    if (concepto === 'alta') {
      if (actual.estado !== 'pendiente_pago') {
        throw transicionInvalida('La suscripción de esta factura ya no espera el pago del alta.');
      }
      tipo = 'activacion';
      inicioPeriodo = ahora;
      data = { estado: 'activa', inicioEn: ahora, venceEn: sumarDuracion(ahora, n, u) };
    } else if (actual.estado === 'activa' || actual.estado === 'en_gracia') {
      tipo = 'renovacion';
      const base = actual.venceEn && actual.venceEn > ahora ? actual.venceEn : ahora;
      inicioPeriodo = base;
      data = { estado: 'activa', venceEn: sumarDuracion(base, n, u) };
    } else if (actual.estado === 'suspendida' || actual.estado === 'vencida') {
      tipo = 'recuperacion';
      inicioPeriodo = ahora;
      data = { estado: 'activa', venceEn: sumarDuracion(ahora, n, u) };
    } else {
      throw transicionInvalida('La suscripción no admite una renovación en su estado actual.');
    }
    await tx.suscripcion.update({ where: { id: actual.id }, data });
    await this.evento(tx, actual.id, tipo, actorId, null, datos);
    // Entrega del servicio (fase 6): se crea en esta misma transacción con su trabajo.
    const origen: OrigenEntrega | null =
      typeof datos['facturaId'] === 'string'
        ? { tipo: 'factura', facturaId: datos['facturaId'] }
        : typeof datos['compraRevendedorId'] === 'string'
          ? { tipo: 'compra', compraRevendedorId: datos['compraRevendedorId'] }
          : null;
    if (origen) {
      await registrarEntrega(tx, {
        origen,
        suscripcionId: actual.id,
        concepto,
        periodo: {
          inicio: inicioPeriodo,
          fin: data.venceEn instanceof Date ? data.venceEn : null,
        },
      });
    }
    // Vuelve a estar activa tras la gracia o una suspensión: aviso de reactivación
    // (bandeja de salida: se encola en la misma transacción que el pago).
    if (
      ['en_gracia', 'suspendida', 'vencida'].includes(actual.estado) &&
      actual.revendedorId === null &&
      data.venceEn instanceof Date
    ) {
      await encolarTrabajo(tx, {
        tipo: TRABAJO.avisoSuscripcion,
        carga: { automatizacion: 'aviso_recuperacion', suscripcionId: actual.id },
        claveUnica: `aviso_recuperacion:${actual.id}:${data.venceEn.toISOString()}`,
      });
    }
    return tipo;
  }

  /**
   * Vencimientos, gracia y suspensión. Los avisos de gracia y suspensión se
   * encolan en la misma transacción y los envía el trabajador.
   * Devuelve cuántas suscripciones cambiaron de estado.
   */
  async aplicarVencimientos(ahora = new Date()): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const [bloqueo] = await tx.$queryRaw<
          { ok: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(${BLOQUEO_VENCIMIENTOS}::bigint) AS ok`;
        if (!bloqueo?.ok) return 0;
        const finGracia = new Date(ahora.getTime() - REGLAS_COBRO.diasGracia * DIA_MS);
        const finSuspension = new Date(
          ahora.getTime() - (REGLAS_COBRO.diasGracia + REGLAS_COBRO.diasSuspension) * DIA_MS,
        );
        const pasos: {
          where: Prisma.SuscripcionWhereInput;
          a: EstadoSuscripcion;
          tipo: TipoEventoSuscripcion;
          motivo: string;
        }[] = [
          {
            where: {
              estado: { in: ['activa', 'en_gracia'] },
              cancelarAlVencer: true,
              venceEn: { lte: ahora },
            },
            a: 'cancelada',
            tipo: 'cancelacion',
            motivo: 'Cancelación programada al vencer',
          },
          {
            where: { estado: 'activa', venceEn: { lte: ahora } },
            a: 'en_gracia',
            tipo: 'vencimiento',
            motivo: 'Venció el periodo pagado',
          },
          {
            where: { estado: 'en_gracia', venceEn: { lte: finGracia } },
            a: 'suspendida',
            tipo: 'suspension',
            motivo: `Sin pago tras ${REGLAS_COBRO.diasGracia} días de gracia`,
          },
          {
            where: { estado: 'suspendida', venceEn: { lte: finSuspension } },
            a: 'vencida',
            tipo: 'vencimiento',
            motivo: `Suspendida más de ${REGLAS_COBRO.diasSuspension} días`,
          },
        ];
        let cambios = 0;
        for (const paso of pasos) {
          const filas = await tx.suscripcion.findMany({
            where: paso.where,
            select: { id: true, estado: true, venceEn: true, revendedorId: true },
            take: 500,
          });
          for (const f of filas) {
            await tx.suscripcion.update({
              where: { id: f.id },
              data: {
                estado: paso.a,
                ...(paso.a === 'cancelada' ? { canceladaEn: ahora, cancelarAlVencer: false } : {}),
              },
            });
            if (paso.a === 'cancelada') {
              await this.anularFacturasAbiertas(tx, f.id, paso.motivo, null);
            }
            // Fin del servicio: se anulan las entregas pendientes y se revocan las del proveedor.
            if (paso.a === 'cancelada' || paso.a === 'vencida') {
              await solicitarRevocacion(tx, f.id, paso.motivo, ahora);
            }
            await this.evento(tx, f.id, paso.tipo, null, paso.motivo, { de: f.estado, a: paso.a });
            // Avisos de gracia y suspensión: se encolan en la misma transacción que el cambio.
            const aviso =
              paso.a === 'en_gracia'
                ? 'aviso_gracia'
                : paso.a === 'suspendida'
                  ? 'aviso_suspension'
                  : null;
            if (aviso && f.revendedorId === null) {
              await encolarTrabajo(tx, {
                tipo: TRABAJO.avisoSuscripcion,
                carga: { automatizacion: aviso, suscripcionId: f.id },
                claveUnica: `${aviso}:${f.id}:${f.venceEn?.toISOString() ?? 'sin-fecha'}`,
              });
            }
            await this.auditoria.registrar(
              {
                actorTipo: 'sistema',
                accion: `suscripcion.${paso.a}`,
                entidad: 'suscripcion',
                entidadId: f.id,
                antes: { estado: f.estado },
                despues: { estado: paso.a, motivo: paso.motivo },
              },
              tx,
            );
            cambios += 1;
          }
        }
        if (cambios > 0) this.logger.log(`Vencimientos aplicados: ${cambios}`);
        return cambios;
      },
      { timeout: 60_000 },
    );
  }

  /** Anula las facturas emitidas de una suscripción (si no tienen un pago en revisión). */
  async anularFacturasAbiertas(
    tx: Tx,
    suscripcionId: string,
    motivo: string,
    actorId: string | null,
  ) {
    const abiertas = await tx.factura.findMany({
      where: { suscripcionId, estado: 'emitida' },
      include: { pagos: { where: { estado: 'en_revision' }, select: { id: true } } },
    });
    for (const f of abiertas) {
      if (f.pagos.length > 0) {
        throw new ErrorApp(
          409,
          'PAGO_EN_REVISION',
          'Hay un pago en revisión para esta suscripción. Resuélvelo antes de cancelarla.',
        );
      }
      await tx.factura.update({
        where: { id: f.id },
        data: {
          estado: 'anulada',
          anuladaEn: new Date(),
          motivoAnulacion: motivo,
          anuladaPorId: actorId,
        },
      });
      await this.facturacion.liberarCupon(tx, f.id);
    }
  }

  private async transicion(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
    fn: (
      tx: Tx,
      s: Suscripcion,
    ) => Promise<{
      tipo: TipoEventoSuscripcion;
      motivo: string | null;
      accion: string;
      datos: Prisma.InputJsonObject;
    }>,
  ): Promise<SuscripcionPublica> {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.bloquear(tx, auth, id);
      const r = await fn(tx, s);
      await this.evento(tx, id, r.tipo, auth.usuario.id, r.motivo, r.datos);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: r.accion,
          entidad: 'suscripcion',
          entidadId: id,
          antes: { estado: s.estado, cancelarAlVencer: s.cancelarAlVencer },
          despues: { ...r.datos, ...(r.motivo ? { motivo: r.motivo } : {}) },
          cliente,
        },
        tx,
      );
      return suscripcionPublica(await this.cargar(tx, id));
    });
  }

  private async bloquear(tx: Tx, auth: ContextoAuth, id: string): Promise<Suscripcion> {
    const visible = await tx.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('La suscripción');
    await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.suscripcion.findUniqueOrThrow({ where: { id } });
  }

  private cargar(tx: Tx, id: string) {
    return tx.suscripcion.findUniqueOrThrow({ where: { id }, include: INCLUIR_SUSCRIPCION });
  }

  private async planContratable(tx: Tx, auth: ContextoAuth, planId: string): Promise<PlanCompleto> {
    const plan = await tx.plan.findFirst({
      where: {
        id: planId,
        ...planVendible,
        // El cliente solo contrata planes visibles; el equipo también los ocultos.
        ...(auth.usuario.rol === 'cliente' ? { visible: true } : {}),
      },
      include: INCLUIR_PLAN,
    });
    if (!plan) throw new ErrorApp(409, 'PLAN_NO_DISPONIBLE', 'Ese plan no está disponible.');
    return plan;
  }

  private async evento(
    tx: Tx,
    suscripcionId: string,
    tipo: TipoEventoSuscripcion,
    actorId: string | null,
    motivo: string | null,
    datos: Prisma.InputJsonObject,
  ) {
    await tx.eventoSuscripcion.create({
      data: { suscripcionId, tipo, actorId, motivo, datos },
    });
  }
}
