import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Entrega, Prisma, PrismaClient } from '@nv/db';
import {
  type CompletarEntregaEntrada,
  ESTADOS_ENTREGA,
  type EntregaDetalle,
  type EstadoEntrega,
  type EventoEntrega,
  type FiltroEntregasEntrada,
  leerConfiguracionProveedor,
  type PaginaEntregas,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { equipoConPermiso, mensajeError } from '../automatizaciones/recuento.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { type TrabajoReclamado, TrabajosService } from '../automatizaciones/trabajos.service.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { AdaptadoresEntrega } from './adaptadores/registro.js';
import type { ContextoEntrega, ResultadoEntrega } from './adaptadores/tipos.js';
import { guardarDatos } from './datos.js';
import { contextoSecretoWebhook } from './firma.js';
import { entregaDetalle, entregaResumen, huellaVisible, INCLUIR_ENTREGA } from './presentacion.js';

type Tx = Prisma.TransactionClient;

/**
 * Esperas entre intentos del webhook: 1 min, 5 min, 30 min, 2 h y 12 h. Tras
 * el último, la entrega queda fallida y se avisa al equipo.
 */
export const ESPERAS_REINTENTO_SEGUNDOS = [60, 300, 1800, 7200, 43200] as const;
/** Sin códigos: se vuelve a mirar cada hora (y en cuanto se sube un lote). */
export const ESPERA_SIN_STOCK_SEGUNDOS = 3600;
/** Una entrega «en curso» más vieja que esto se da por abandonada (el proceso se cayó). */
export const EN_CURSO_ABANDONADA_MS = 10 * 60_000;

/** Qué pasó al procesar, para avisar después de confirmar la transacción. */
type Desenlace =
  | { tipo: 'entregada' }
  | { tipo: 'manual' }
  | { tipo: 'sin_stock' }
  | { tipo: 'reintento' }
  | { tipo: 'fallida'; mensaje: string }
  | { tipo: 'nada' };

const INCLUIR_CONTEXTO = {
  proveedor: true,
  plan: {
    select: {
      id: true,
      nombre: true,
      skuProveedor: true,
      servicio: { select: { nombre: true } },
    },
  },
  cliente: { select: { id: true, nombre: true, correo: true } },
  revendedor: { select: { id: true, usuarioId: true, nombreComercial: true } },
} as const satisfies Prisma.EntregaInclude;

type EntregaConContexto = Prisma.EntregaGetPayload<{ include: typeof INCLUIR_CONTEXTO }>;

const texto500 = (t: string | undefined | null) => (t ? t.slice(0, 500) : null);

/**
 * Orquesta las entregas: ejecuta el adaptador del proveedor (desde la cola),
 * guarda el resultado, programa reintentos, avisa al cliente (sin el código) y
 * al equipo, y atiende las acciones del panel (reintentar, completar a mano y
 * anular). El código o enlace se guarda cifrado y nunca va a registros,
 * auditoría, correos ni al asistente.
 */
@Injectable()
export class EntregasService implements OnModuleInit {
  private readonly logger = new Logger('Entregas');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AdaptadoresEntrega) private readonly adaptadores: AdaptadoresEntrega,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.procesarEntrega, async (carga) => {
      await this.procesar(String(carga['entregaId']));
    });
    this.trabajos.registrar(TRABAJO.revocarEntrega, async (carga, t) => {
      await this.revocar(
        String(carga['entregaId']),
        typeof carga['motivo'] === 'string' ? carga['motivo'] : null,
        t,
      );
    });
  }

  // ── Procesamiento (cola) ───────────────────────────────────────────────

  /** Ejecuta el adaptador de una entrega. Idempotente: si ya no está pendiente, no hace nada. */
  async procesar(entregaId: string, ahora = new Date()): Promise<void> {
    const e = await this.cargar(entregaId);
    if (!e || (e.estado !== 'pendiente' && e.estado !== 'en_curso')) return;
    const adaptador = this.adaptadores.de(e.adaptador);
    let desenlace: Desenlace;
    if (adaptador.transaccional) {
      desenlace = await this.prisma.$transaction(async (tx) => {
        const actual = await this.bloquear(tx, entregaId);
        if (actual.estado !== 'pendiente') return { tipo: 'nada' } as const;
        await tx.entrega.update({
          where: { id: entregaId },
          data: { intentos: { increment: 1 } },
        });
        const ctx = this.contexto({ ...e, ...actual, intentos: actual.intentos + 1 }, tx);
        const r = await adaptador.entregar(ctx);
        return this.aplicar(tx, ctx.entrega, e, r, ahora);
      });
    } else {
      // Sistema externo: se reserva la entrega («en curso»), se llama fuera de
      // cualquier transacción y se guarda el resultado en otra.
      const reservada = await this.prisma.$transaction(async (tx) => {
        const actual = await this.bloquear(tx, entregaId);
        const abandonada =
          actual.estado === 'en_curso' &&
          actual.actualizadoEn.getTime() < ahora.getTime() - EN_CURSO_ABANDONADA_MS;
        if (actual.estado !== 'pendiente' && !abandonada) return null;
        return tx.entrega.update({
          where: { id: entregaId },
          data: { estado: 'en_curso', intentos: { increment: 1 }, proximoIntentoEn: null },
        });
      });
      if (!reservada) return;
      const ctx = this.contexto({ ...e, ...reservada });
      let r: ResultadoEntrega;
      try {
        r = await adaptador.entregar(ctx);
      } catch (err) {
        r = { estado: 'pendiente', reintentar: true, mensaje: mensajeError(err) };
      }
      desenlace = await this.prisma.$transaction(async (tx) => {
        const actual = await this.bloquear(tx, entregaId);
        if (actual.estado === 'anulada') {
          // Se anuló (cancelación o panel) mientras el proveedor la activaba.
          if (r.estado === 'entregada') await this.revocarTrasAnulacion(tx, actual, r, ahora);
          return { tipo: 'nada' } as const;
        }
        if (actual.estado !== 'en_curso') return { tipo: 'nada' } as const;
        return this.aplicar(tx, reservada, e, r, ahora);
      });
    }
    await this.avisarDesenlace(e, desenlace);
  }

  /** Guarda el resultado del adaptador en la entrega bloqueada. */
  private async aplicar(
    tx: Tx,
    entrega: Entrega,
    e: EntregaConContexto,
    r: ResultadoEntrega,
    ahora: Date,
  ): Promise<Desenlace> {
    const id = entrega.id;
    if (r.estado === 'entregada') {
      const config = leerConfiguracionProveedor(e.proveedor.configuracion);
      const datosCifrados = guardarDatos(this.cifrador, id, r.datosCliente);
      const instrucciones = r.datosCliente?.instrucciones ?? config.instrucciones ?? null;
      await tx.entrega.update({
        where: { id },
        data: {
          estado: 'entregada',
          entregadaEn: ahora,
          referenciaExterna: r.referenciaExterna ?? entrega.referenciaExterna,
          datosCifrados,
          instrucciones,
          error: null,
          proximoIntentoEn: null,
        },
      });
      let huella: string | null = null;
      if (r.codigoInventarioId) {
        const c = await tx.codigoInventario.findUnique({
          where: { id: r.codigoInventarioId },
          select: { huella: true },
        });
        huella = c ? huellaVisible(c.huella) : null;
      }
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: 'entrega.entregada',
          entidad: 'entrega',
          entidadId: id,
          despues: {
            adaptador: entrega.adaptador,
            intento: entrega.intentos,
            referenciaExterna: r.referenciaExterna ?? null,
            tieneCodigo: Boolean(r.datosCliente?.codigo),
            tieneEnlace: Boolean(r.datosCliente?.enlace),
            ...(huella ? { huellaCodigo: huella } : {}),
          },
        },
        tx,
      );
      return { tipo: 'entregada' };
    }

    if (r.estado === 'fallida') {
      return this.marcarFallida(tx, entrega, r.mensaje ?? 'El proveedor rechazó la entrega.');
    }

    // Pendiente.
    if (r.aviso === 'manual') {
      await tx.entrega.update({
        where: { id },
        data: { estado: 'pendiente', error: null, proximoIntentoEn: null },
      });
      return { tipo: 'manual' };
    }
    if (r.aviso === 'sin_stock') {
      const proximo = new Date(ahora.getTime() + ESPERA_SIN_STOCK_SEGUNDOS * 1000);
      await tx.entrega.update({
        where: { id },
        data: { estado: 'pendiente', error: texto500(r.mensaje), proximoIntentoEn: proximo },
      });
      await encolarTrabajo(tx, {
        tipo: TRABAJO.procesarEntrega,
        carga: { entregaId: id },
        claveUnica: `entrega:${id}:stock:${Math.floor(proximo.getTime() / 1000)}`,
        ejecutarEn: proximo,
        maxIntentos: 3,
      });
      return { tipo: 'sin_stock' };
    }
    const espera = ESPERAS_REINTENTO_SEGUNDOS[entrega.intentos - 1];
    if (!r.reintentar || espera === undefined) {
      const base = r.mensaje ?? 'No se pudo entregar.';
      return this.marcarFallida(
        tx,
        entrega,
        r.reintentar
          ? `${base.replace(/ Se reintentará\.$/, '')} Se agotaron los reintentos.`
          : base,
      );
    }
    const proximo = new Date(ahora.getTime() + espera * 1000);
    await tx.entrega.update({
      where: { id },
      data: { estado: 'pendiente', error: texto500(r.mensaje), proximoIntentoEn: proximo },
    });
    await encolarTrabajo(tx, {
      tipo: TRABAJO.procesarEntrega,
      carga: { entregaId: id },
      claveUnica: `entrega:${id}:reintento:${randomUUID()}`,
      ejecutarEn: proximo,
      maxIntentos: 3,
    });
    return { tipo: 'reintento' };
  }

  private async marcarFallida(tx: Tx, entrega: Entrega, mensaje: string): Promise<Desenlace> {
    await tx.entrega.update({
      where: { id: entrega.id },
      data: { estado: 'fallida', error: texto500(mensaje), proximoIntentoEn: null },
    });
    await this.auditoria.registrar(
      {
        actorTipo: 'sistema',
        accion: 'entrega.fallida',
        entidad: 'entrega',
        entidadId: entrega.id,
        despues: { adaptador: entrega.adaptador, intentos: entrega.intentos, error: mensaje },
      },
      tx,
    );
    return { tipo: 'fallida', mensaje };
  }

  /**
   * El proveedor activó el servicio de una entrega que ya estaba anulada: se
   * deja constancia de que se entregó y se le pide que lo revoque.
   */
  private async revocarTrasAnulacion(
    tx: Tx,
    actual: Entrega,
    r: ResultadoEntrega,
    ahora: Date,
  ): Promise<void> {
    await tx.entrega.update({
      where: { id: actual.id },
      data: {
        estado: 'entregada',
        entregadaEn: ahora,
        anuladaEn: null,
        referenciaExterna: r.referenciaExterna ?? actual.referenciaExterna,
        error: 'Se anuló mientras el proveedor la activaba: se le pide que la revoque.',
      },
    });
    await encolarTrabajo(tx, {
      tipo: TRABAJO.revocarEntrega,
      carga: { entregaId: actual.id, motivo: actual.motivoAnulacion ?? 'Entrega anulada.' },
      claveUnica: `entrega_revocar:${actual.id}:${randomUUID()}`,
      maxIntentos: 6,
    });
  }

  /**
   * Revoca una entrega (cancelación, fin de la suspensión, reembolso o panel).
   * Con webhook avisa al proveedor; las demás solo se marcan: el código ya se
   * entregó y no se puede recuperar.
   */
  async revocar(
    entregaId: string,
    motivo: string | null,
    trabajo?: TrabajoReclamado,
    ahora = new Date(),
  ): Promise<void> {
    const e = await this.cargar(entregaId);
    if (!e) return;
    const razon = (motivo ?? e.motivoAnulacion ?? 'La suscripción terminó.').slice(0, 300);
    if (e.estado === 'anulada' || e.estado === 'revocada') return;
    if (e.estado === 'pendiente' || e.estado === 'fallida') {
      await this.prisma.$transaction(async (tx) => {
        const a = await this.bloquear(tx, entregaId);
        if (a.estado !== 'pendiente' && a.estado !== 'fallida') return;
        await tx.entrega.update({
          where: { id: entregaId },
          data: {
            estado: 'anulada',
            anuladaEn: ahora,
            motivoAnulacion: razon,
            proximoIntentoEn: null,
          },
        });
      });
      return;
    }
    if (e.estado === 'en_curso') {
      // Se reintenta el trabajo cuando termine la llamada en curso.
      throw new Error('La entrega sigue en curso: se revocará cuando termine.');
    }
    // Entregada.
    const adaptador = this.adaptadores.de(e.adaptador);
    let resultado: { estado: 'revocada' | 'reintentar' | 'fallida'; mensaje?: string } = {
      estado: 'revocada',
    };
    if (adaptador.revocar) {
      resultado = await adaptador.revocar({ ...this.contexto(e), motivoRevocacion: razon });
    }
    if (resultado.estado === 'reintentar' && trabajo && trabajo.intentos < trabajo.maxIntentos) {
      throw new Error(resultado.mensaje ?? 'El proveedor no respondió a la revocación.');
    }
    if (resultado.estado === 'revocada') {
      await this.prisma.$transaction(async (tx) => {
        const a = await this.bloquear(tx, entregaId);
        if (a.estado !== 'entregada') return;
        await tx.entrega.update({
          where: { id: entregaId },
          data: {
            estado: 'revocada',
            revocadaEn: ahora,
            motivoAnulacion: a.motivoAnulacion ?? razon,
            error: null,
          },
        });
        await this.auditoria.registrar(
          {
            actorTipo: 'sistema',
            accion: 'entrega.revocada',
            entidad: 'entrega',
            entidadId: entregaId,
            despues: { adaptador: e.adaptador, motivo: razon },
          },
          tx,
        );
      });
      return;
    }
    const mensaje = `No se pudo revocar: ${resultado.mensaje ?? 'el proveedor no respondió.'}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.entrega.update({ where: { id: entregaId }, data: { error: texto500(mensaje) } });
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: 'entrega.revocacion_fallida',
          entidad: 'entrega',
          entidadId: entregaId,
          despues: { adaptador: e.adaptador, error: mensaje },
        },
        tx,
      );
    });
    await this.avisarEquipoFallida(e, mensaje, `revocar:${randomUUID()}`);
  }

  // ── Acciones del panel ─────────────────────────────────────────────────

  /** Vuelve a intentar una entrega pendiente o fallida con el adaptador actual del proveedor. */
  async reintentar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<EntregaDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.bloquearOError(tx, id);
      if (e.estado !== 'pendiente' && e.estado !== 'fallida') {
        throw new ErrorApp(
          409,
          'ENTREGA_NO_REINTENTABLE',
          'Solo se reintentan entregas pendientes o fallidas.',
        );
      }
      const proveedor = await tx.proveedor.findUniqueOrThrow({ where: { id: e.proveedorId } });
      if (proveedor.adaptador === 'manual') {
        throw new ErrorApp(
          409,
          'ENTREGA_MANUAL',
          'Este proveedor entrega a mano: complétala con los pasos para activar el servicio.',
        );
      }
      await tx.entrega.update({
        where: { id },
        data: {
          estado: 'pendiente',
          adaptador: proveedor.adaptador,
          intentos: 0,
          error: null,
          proximoIntentoEn: null,
        },
      });
      await encolarTrabajo(tx, {
        tipo: TRABAJO.procesarEntrega,
        carga: { entregaId: id },
        claveUnica: `entrega:${id}:manual:${randomUUID()}`,
        maxIntentos: 3,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'entrega.reintentada',
          entidad: 'entrega',
          entidadId: id,
          antes: { estado: e.estado, adaptador: e.adaptador, intentos: e.intentos },
          despues: { estado: 'pendiente', adaptador: proveedor.adaptador },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  /**
   * Completa a mano una entrega pendiente o fallida: pasos para activar y, si
   * corresponde, un enlace o un código oficial. Nunca credenciales de cuentas
   * (el esquema lo rechaza).
   */
  async completar(
    auth: ContextoAuth,
    id: string,
    entrada: CompletarEntregaEntrada,
    cliente: InfoCliente,
  ): Promise<EntregaDetalle> {
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const e = await this.bloquearOError(tx, id);
      if (e.estado !== 'pendiente' && e.estado !== 'fallida') {
        throw new ErrorApp(
          409,
          'ENTREGA_NO_COMPLETABLE',
          e.estado === 'en_curso'
            ? 'El proveedor está procesando esta entrega: espera a que termine.'
            : 'Esta entrega ya no está pendiente.',
        );
      }
      await tx.entrega.update({
        where: { id },
        data: {
          estado: 'entregada',
          entregadaEn: ahora,
          instrucciones: entrada.instrucciones,
          datosCifrados: guardarDatos(this.cifrador, id, {
            ...(entrada.codigo ? { codigo: entrada.codigo } : {}),
            ...(entrada.enlace ? { enlace: entrada.enlace } : {}),
          }),
          completadaPorId: auth.usuario.id,
          error: null,
          proximoIntentoEn: null,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'entrega.completada',
          entidad: 'entrega',
          entidadId: id,
          antes: { estado: e.estado },
          despues: {
            estado: 'entregada',
            tieneCodigo: Boolean(entrada.codigo),
            tieneEnlace: Boolean(entrada.enlace),
          },
          cliente,
        },
        tx,
      );
    });
    const e = await this.cargar(id);
    if (e) await this.avisarDesenlace(e, { tipo: 'entregada' });
    return this.obtener(id);
  }

  /**
   * Anula una entrega. Si aún no se hizo, queda anulada; si ya se entregó, se
   * revoca (con webhook se avisa al proveedor desde la cola).
   */
  async anular(
    auth: ContextoAuth,
    id: string,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<EntregaDetalle> {
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const e = await this.bloquearOError(tx, id);
      let despues: Prisma.InputJsonObject;
      if (e.estado === 'pendiente' || e.estado === 'fallida') {
        await tx.entrega.update({
          where: { id },
          data: {
            estado: 'anulada',
            anuladaEn: ahora,
            motivoAnulacion: motivo,
            proximoIntentoEn: null,
          },
        });
        despues = { estado: 'anulada' };
      } else if (e.estado === 'entregada') {
        if (e.adaptador === 'webhook') {
          await tx.entrega.update({ where: { id }, data: { motivoAnulacion: motivo } });
          await encolarTrabajo(tx, {
            tipo: TRABAJO.revocarEntrega,
            carga: { entregaId: id, motivo: motivo.slice(0, 300) },
            claveUnica: `entrega_revocar:${id}:${randomUUID()}`,
            maxIntentos: 6,
          });
          despues = { estado: 'entregada', revocacion: 'solicitada al proveedor' };
        } else {
          await tx.entrega.update({
            where: { id },
            data: { estado: 'revocada', revocadaEn: ahora, motivoAnulacion: motivo },
          });
          despues = { estado: 'revocada' };
        }
      } else if (e.estado === 'en_curso') {
        throw new ErrorApp(
          409,
          'ENTREGA_EN_CURSO',
          'El proveedor está procesando esta entrega: espera un momento y vuelve a intentarlo.',
        );
      } else {
        throw new ErrorApp(409, 'ENTREGA_CERRADA', 'Esta entrega ya está anulada o revocada.');
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'entrega.anulada',
          entidad: 'entrega',
          entidadId: id,
          antes: { estado: e.estado },
          despues: { ...despues, motivo },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  // ── Consultas del panel ────────────────────────────────────────────────

  async listar(filtro: FiltroEntregasEntrada): Promise<PaginaEntregas> {
    const base: Prisma.EntregaWhereInput = {
      ...(filtro.adaptador ? { adaptador: filtro.adaptador } : {}),
      ...(filtro.motivo ? { motivo: filtro.motivo } : {}),
      ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
      ...(filtro.planId ? { planId: filtro.planId } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { cliente: { nombre: { contains: filtro.busqueda, mode: 'insensitive' } } },
              { referenciaExterna: { contains: filtro.busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const where: Prisma.EntregaWhereInput = {
      ...base,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };
    const [total, filas, grupos] = await Promise.all([
      this.prisma.entrega.count({ where }),
      this.prisma.entrega.findMany({
        where,
        include: INCLUIR_ENTREGA,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.entrega.groupBy({ by: ['estado'], where: base, _count: { _all: true } }),
    ]);
    const contadores = Object.fromEntries(ESTADOS_ENTREGA.map((s) => [s, 0])) as Record<
      EstadoEntrega,
      number
    >;
    for (const g of grupos) contadores[g.estado] = g._count._all;
    return {
      elementos: filas.map(entregaResumen),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      contadores,
    };
  }

  async obtener(id: string): Promise<EntregaDetalle> {
    const e = await this.prisma.entrega.findUnique({
      where: { id },
      include: {
        ...INCLUIR_ENTREGA,
        completadaPor: { select: { id: true, nombre: true } },
        codigo: {
          select: { id: true, huella: true, lote: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!e) throw Errores.noEncontrado('La entrega');
    const registros = await this.prisma.auditoria.findMany({
      where: { entidad: 'entrega', entidadId: id },
      include: { actor: { select: { id: true, nombre: true } } },
      orderBy: { fecha: 'asc' },
      take: 100,
    });
    const historial: EventoEntrega[] = [
      { accion: 'entrega.creada', fecha: iso(e.creadoEn)!, actor: null, actorTipo: 'sistema' },
      ...registros.map((r) => ({
        accion: r.accion,
        fecha: iso(r.fecha)!,
        actor: r.actor,
        actorTipo: r.actorTipo,
      })),
    ];
    return entregaDetalle(e, historial);
  }

  // ── Avisos ─────────────────────────────────────────────────────────────

  private async avisarDesenlace(e: EntregaConContexto, d: Desenlace): Promise<void> {
    try {
      const servicio = `${e.plan.servicio.nombre} · ${e.plan.nombre}`;
      if (d.tipo === 'entregada') {
        if (e.revendedor) {
          const url = this.correo.urlWeb('/revendedor/accesos');
          await this.avisos.avisar({
            plantilla: 'accesoListoRevendedor',
            destinatario: { usuarioId: e.revendedor.usuarioId },
            claveUnica: `entrega_lista:${e.id}`,
            automatizacion: null,
            entidad: { tipo: 'entrega', id: e.id },
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.accesoListoRevendedor(nombre, e.cliente.nombre, servicio, url),
            }),
          });
        } else {
          const url = this.correo.urlWeb('/cuenta/accesos');
          await this.avisos.avisar({
            plantilla: 'servicioListo',
            destinatario: { clienteId: e.clienteId },
            claveUnica: `entrega_lista:${e.id}`,
            automatizacion: null,
            entidad: { tipo: 'entrega', id: e.id },
            canales: ['correo'],
            contenido: (nombre) => ({ correo: Plantillas.servicioListo(nombre, servicio, url) }),
          });
        }
      } else if (d.tipo === 'manual') {
        const url = this.correo.urlWeb('/admin/entregas', { id: e.id });
        for (const u of await equipoConPermiso(this.prisma, 'entregas.gestionar')) {
          await this.avisos.avisar({
            plantilla: 'entregaPendiente',
            destinatario: { usuarioId: u.id },
            claveUnica: `entrega_pendiente:${e.id}:${u.id}`,
            automatizacion: null,
            entidad: { tipo: 'entrega', id: e.id },
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.entregaPendiente(nombre, e.cliente.nombre, servicio, url),
            }),
          });
        }
      } else if (d.tipo === 'sin_stock') {
        const url = this.correo.urlWeb('/admin/inventario', { plan: e.planId });
        for (const u of await equipoConPermiso(this.prisma, 'inventario.gestionar')) {
          await this.avisos.avisar({
            plantilla: 'entregaSinStock',
            destinatario: { usuarioId: u.id },
            claveUnica: `entrega_sin_stock:${e.id}:${u.id}`,
            automatizacion: null,
            entidad: { tipo: 'entrega', id: e.id },
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.entregaSinStock(nombre, servicio, e.cliente.nombre, url),
            }),
          });
        }
      } else if (d.tipo === 'fallida') {
        await this.avisarEquipoFallida(e, d.mensaje, 'entrega');
      }
    } catch (err) {
      // El aviso no deshace la entrega: queda en el registro de notificaciones.
      this.logger.warn(`No se pudo avisar de la entrega ${e.id}: ${mensajeError(err)}`);
    }
  }

  private async avisarEquipoFallida(
    e: EntregaConContexto,
    mensaje: string,
    motivo: string,
  ): Promise<void> {
    const servicio = `${e.plan.servicio.nombre} · ${e.plan.nombre}`;
    const url = this.correo.urlWeb('/admin/entregas', { id: e.id });
    const actual = await this.prisma.entrega.findUnique({
      where: { id: e.id },
      select: { intentos: true },
    });
    for (const u of await equipoConPermiso(this.prisma, 'entregas.gestionar')) {
      await this.avisos.avisar({
        plantilla: 'entregaFallida',
        destinatario: { usuarioId: u.id },
        claveUnica: `entrega_fallida:${e.id}:${motivo}:${actual?.intentos ?? 0}:${u.id}`,
        automatizacion: null,
        entidad: { tipo: 'entrega', id: e.id },
        canales: ['correo'],
        contenido: (nombre) => ({
          correo: Plantillas.entregaFallida(nombre, e.cliente.nombre, servicio, mensaje, url),
        }),
      });
    }
  }

  // ── Ayudas ─────────────────────────────────────────────────────────────

  private cargar(id: string): Promise<EntregaConContexto | null> {
    return this.prisma.entrega.findUnique({ where: { id }, include: INCLUIR_CONTEXTO });
  }

  private async bloquear(tx: Tx, id: string): Promise<Entrega> {
    await tx.$queryRaw`SELECT id FROM entregas WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.entrega.findUniqueOrThrow({ where: { id } });
  }

  private async bloquearOError(tx: Tx, id: string): Promise<Entrega> {
    const filas = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM entregas WHERE id = ${id}::uuid FOR UPDATE`;
    if (filas.length === 0) throw Errores.noEncontrado('La entrega');
    return tx.entrega.findUniqueOrThrow({ where: { id } });
  }

  private contexto(e: EntregaConContexto, tx?: Tx): ContextoEntrega {
    const config = leerConfiguracionProveedor(e.proveedor.configuracion);
    let secreto: string | null = null;
    if (e.adaptador === 'webhook' && e.proveedor.secretoWebhookCifrado) {
      secreto = this.cifrador.descifrar(
        e.proveedor.secretoWebhookCifrado,
        contextoSecretoWebhook(e.proveedor.id),
      );
    }
    const { proveedor, plan, cliente, revendedor: _r, ...entrega } = e;
    return {
      ...(tx ? { tx } : {}),
      entrega,
      proveedor,
      configuracion: config,
      plan: {
        id: plan.id,
        nombre: plan.nombre,
        skuProveedor: plan.skuProveedor,
        servicio: plan.servicio.nombre,
      },
      cliente: { id: cliente.id, correo: cliente.correo },
      secreto,
    };
  }
}
