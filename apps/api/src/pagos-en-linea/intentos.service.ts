import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { IntentoPago, MetodoPagoAutorizado, Pago, Prisma, PrismaClient } from '@nv/db';
import {
  formatearMonto,
  INFO_PASARELA,
  type IniciarPagoEnLineaEntrada,
  type IntentoPagoPublico,
  type OpcionesPagoEnLinea,
  type Pasarela,
  textoAutorizacion,
  VERSION_TEXTO_AUTORIZACION,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { TRABAJO } from '../automatizaciones/trabajos.js';
import { TrabajosService } from '../automatizaciones/trabajos.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FacturasService } from '../cobros/facturas.service.js';
import { PagosService } from '../cobros/pagos.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { D } from '../dinero/dinero.js';
import type { ResultadoPago } from './adaptador.js';
import { AvisosEquipoPagosService } from './avisos-equipo.service.js';
import { MetodosAutorizadosService } from './metodos-autorizados.service.js';
import { admiteRecurrente, esPasarela, pasarelaAdmiteMoneda } from './pasarelas.js';
import { ABIERTOS, intentoPublico } from './presentacion.js';
import { RegistroPasarelas } from './registro.service.js';

type Tx = Prisma.TransactionClient;

/** Tiempo para completar un pago en la pasarela antes de darlo por vencido. */
export const MINUTOS_INTENTO = 120;
/** Trabajo que vence los intentos abandonados (lo programa el planificador). */
export const TRABAJO_EXPIRAR_INTENTOS = TRABAJO.expirarIntentosPago;

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const nuevaReferencia = () => {
  let r = 'L-';
  for (let i = 0; i < 8; i += 1) r += ALFABETO[randomInt(ALFABETO.length)];
  return r;
};

const MENSAJE_REVISION = 'Recibimos tu pago y lo estamos revisando. Te avisaremos al confirmarlo.';

/** De dónde llegó el resultado de la pasarela (queda en la auditoría). */
export type OrigenResultado = 'retorno' | 'webhook' | 'consulta' | 'cancelacion' | 'expiracion';

/**
 * Pagos en línea de facturas: el cliente elige un método en línea, va a la
 * pasarela y vuelve. La aprobación puede llegar por el retorno, por un webhook
 * o por una consulta de estado, en cualquier orden y hasta a la vez: se aplica
 * una sola vez bajo el bloqueo de la fila del intento.
 */
@Injectable()
export class IntentosPagoService implements OnModuleInit {
  private readonly logger = new Logger('PagosEnLinea');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(FacturasService) private readonly facturas: FacturasService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(MetodosAutorizadosService) private readonly metodos: MetodosAutorizadosService,
    @Inject(AvisosEquipoPagosService) private readonly equipo: AvisosEquipoPagosService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO_EXPIRAR_INTENTOS, async () => {
      await this.expirar();
    });
  }

  // ── Cliente ────────────────────────────────────────────────────────────────

  /** Métodos en línea con los que el cliente puede pagar esta factura. VES nunca. */
  async opciones(auth: ContextoAuth, facturaId: string): Promise<OpcionesPagoEnLinea> {
    const f = await this.prisma.factura.findFirst({
      where: { id: facturaId, cliente: alcanceClientes(auth) },
      include: {
        cliente: { select: { nombre: true, revendedorId: true } },
        suscripcion: { select: { revendedorId: true } },
        pagos: { where: { estado: 'en_revision' }, select: { id: true }, take: 1 },
      },
    });
    if (!f) throw Errores.noEncontrado('La factura');
    const base = {
      factura: {
        id: f.id,
        numero: numeroFactura(f.numero),
        total: f.total.toFixed(2),
        moneda: f.moneda,
      },
      versionTexto: VERSION_TEXTO_AUTORIZACION,
    };
    if (f.estado !== 'emitida' || f.moneda === 'VES' || f.pagos.length > 0) {
      return { ...base, opciones: [], textosAutorizacion: {} };
    }
    const metodos = await this.prisma.metodoCobro.findMany({
      where: { tipo: 'pasarela', activo: true, moneda: f.moneda },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    const deRevendedor =
      f.cliente.revendedorId !== null || (f.suscripcion?.revendedorId ?? null) !== null;
    const opciones: OpcionesPagoEnLinea['opciones'] = [];
    const textos: OpcionesPagoEnLinea['textosAutorizacion'] = {};
    for (const m of metodos) {
      if (!esPasarela(m.pasarela)) continue;
      if (!pasarelaAdmiteMoneda(m.pasarela, f.moneda) || !this.registro.disponible(m.pasarela)) {
        continue;
      }
      const admiteGuardar =
        admiteRecurrente(m.pasarela) && !deRevendedor && f.suscripcionId !== null;
      opciones.push({
        metodoCobroId: m.id,
        nombre: m.nombre,
        pasarela: m.pasarela,
        moneda: m.moneda,
        admiteGuardar,
      });
      if (admiteGuardar) textos[m.pasarela] = this.texto(m.pasarela, f.moneda, f.cliente.nombre);
    }
    return { ...base, opciones, textosAutorizacion: textos };
  }

  /** Crea el intento y la orden en la pasarela. Devuelve a dónde mandar al cliente. */
  async iniciar(
    auth: ContextoAuth,
    facturaId: string,
    e: IniciarPagoEnLineaEntrada,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    const titular = await this.clientes.deUsuario(auth.usuario);
    // 1) Lo que se puede comprobar antes de tocar la pasarela.
    const previa = await this.prisma.$transaction((tx) =>
      this.validarInicio(tx, auth, facturaId, e),
    );
    // 2) Un intento abierto anterior se consulta y se cierra (o se aprueba si ya se pagó).
    const abiertos = await this.prisma.intentoPago.findMany({
      where: { facturaId, estado: { in: [...ABIERTOS] } },
    });
    for (const a of abiertos) {
      const final = await this.cerrarAbierto(a, 'cancelacion', 'Reemplazado por un pago nuevo.');
      if (final.estado === 'aprobado') {
        throw new ErrorApp(
          409,
          'FACTURA_CERRADA',
          'Ya recibimos un pago en línea de esta factura. Revisa su estado.',
        );
      }
    }
    // 3) El intento nuevo, con la evidencia de la autorización si pidió guardar el método.
    const intento = await this.prisma.$transaction(async (tx) => {
      const { factura, metodo } = await this.validarInicio(tx, auth, facturaId, e);
      const ahora = new Date();
      const pasarela = metodo.pasarela as Pasarela;
      const guardar = e.guardarMetodo && previa.admiteGuardar;
      let creado: IntentoPago | null = null;
      for (let i = 0; i < 5 && !creado; i += 1) {
        try {
          creado = await tx.intentoPago.create({
            data: {
              referencia: nuevaReferencia(),
              facturaId: factura.id,
              clienteId: factura.clienteId,
              metodoCobroId: metodo.id,
              pasarela,
              moneda: factura.moneda,
              monto: factura.total,
              guardarMetodo: guardar,
              ...(guardar
                ? {
                    textoAutorizacion: this.texto(pasarela, factura.moneda, titular.nombre),
                    versionTexto: VERSION_TEXTO_AUTORIZACION,
                    autorizadoEn: ahora,
                    autorizadoIp: cliente.ip?.slice(0, 64) ?? null,
                    autorizadoAgente: cliente.agenteUsuario?.slice(0, 300) ?? null,
                  }
                : {}),
              expiraEn: new Date(ahora.getTime() + MINUTOS_INTENTO * 60_000),
            },
          });
        } catch (err) {
          if (!esUnicoDuplicado(err)) throw err;
          const otro = await tx.intentoPago.count({
            where: { facturaId, estado: { in: [...ABIERTOS] } },
          });
          if (otro > 0) {
            throw new ErrorApp(
              409,
              'PAGO_EN_CURSO',
              'Ya hay un pago en línea en curso para esta factura. Termínalo o espera unos minutos.',
            );
          }
        }
      }
      if (!creado) throw new Error('No se pudo generar una referencia de intento única.');
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pago_en_linea.iniciado',
          entidad: 'intento_pago',
          entidadId: creado.id,
          despues: {
            referencia: creado.referencia,
            facturaId,
            pasarela,
            monto: creado.monto.toFixed(2),
            moneda: creado.moneda,
            guardarMetodo: guardar,
            ...(guardar ? { versionTexto: VERSION_TEXTO_AUTORIZACION } : {}),
          },
          cliente,
        },
        tx,
      );
      return creado;
    });
    // 4) La orden en la pasarela (fuera de la transacción: es una llamada de red).
    const adaptador = this.registro.exigir(intento.pasarela);
    const retorno = this.correo.urlWeb('/cuenta/pagos/retorno', { intento: intento.id });
    const descripcion = `Factura ${numeroFactura(previa.numero)} · NV Streaming`;
    try {
      const orden = await adaptador.crearPago({
        referencia: intento.referencia,
        idInterno: intento.id,
        monto: intento.monto.toFixed(2),
        moneda: intento.moneda,
        descripcion,
        urlRetorno: retorno,
        urlCancelacion: `${retorno}&cancelado=1`,
        guardarMetodo: intento.guardarMetodo,
        pagador: { nombre: titular.nombre, correo: auth.usuario.correo },
      });
      const listo = await this.prisma.intentoPago.update({
        where: { id: intento.id },
        data: { idExterno: orden.idExterno, urlPago: orden.urlPago, estado: 'pendiente' },
      });
      return intentoPublico(listo);
    } catch (err) {
      this.logger.warn(
        `La pasarela ${intento.pasarela} no creó la orden del intento ${intento.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.prisma.intentoPago.updateMany({
        where: { id: intento.id, estado: 'creado' },
        data: {
          estado: 'rechazado',
          error: 'No pudimos conectar con la pasarela. Inténtalo de nuevo en unos minutos.',
        },
      });
      throw new ErrorApp(
        503,
        'PASARELA_NO_RESPONDE',
        'No pudimos conectar con la pasarela de pago. Inténtalo de nuevo en unos minutos.',
      );
    }
  }

  /** Estado del intento (consulta la pasarela si sigue abierto). */
  async obtener(auth: ContextoAuth, id: string): Promise<IntentoPagoPublico> {
    const i = await this.propio(auth, id);
    if ((ABIERTOS as readonly string[]).includes(i.estado) && i.idExterno) {
      await this.consultarYAplicar(i, 'consulta');
    }
    return this.publico(id);
  }

  /** El cliente volvió de la pasarela. */
  async retorno(
    auth: ContextoAuth,
    id: string,
    parametros: Record<string, string>,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    const i = await this.propio(auth, id);
    if (parametros['cancelado'] === '1') return this.cancelar(auth, id, cliente);
    if (i.estado !== 'aprobado' && i.idExterno && this.registro.disponible(i.pasarela)) {
      const adaptador = this.registro.exigir(i.pasarela);
      let r: ResultadoPago;
      try {
        r = await adaptador.confirmarRetorno(i.idExterno, parametros);
      } catch (err) {
        this.logger.warn(`Retorno del intento ${id} sin respuesta de la pasarela: ${String(err)}`);
        return this.publico(id);
      }
      await this.aplicarResultado(i.id, r, 'retorno', cliente);
    }
    return this.publico(id);
  }

  /** El cliente canceló (o volvió por la URL de cancelación). Antes se consulta la pasarela. */
  async cancelar(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    const i = await this.propio(auth, id);
    if ((ABIERTOS as readonly string[]).includes(i.estado)) {
      await this.cerrarAbierto(i, 'cancelacion', 'Cancelaste el pago.', cliente, auth.usuario.id);
    }
    return this.publico(id);
  }

  // ── Núcleo: aplicar el resultado de la pasarela ────────────────────────────

  /**
   * Aplica lo que dice la pasarela. Idempotente y seguro ante llamadas
   * simultáneas (bloquea la fila del intento). Un intento cancelado o vencido
   * que la pasarela sí cobró se registra igual: el dinero nunca se pierde.
   */
  async aplicarResultado(
    intentoId: string,
    r: ResultadoPago,
    origen: OrigenResultado,
    cliente?: InfoCliente,
  ): Promise<IntentoPago> {
    if (r.estado === 'pendiente') {
      return this.prisma.intentoPago.findUniqueOrThrow({ where: { id: intentoId } });
    }
    if (r.estado !== 'aprobado') return this.cerrarSinPago(intentoId, r, origen, cliente);
    if (!r.idCobro || !r.montoRecibido || !r.moneda) {
      throw new Error(`La pasarela aprobó el intento ${intentoId} sin cobro, monto o moneda.`);
    }
    const idCobro = r.idCobro;
    const recibido = D(r.montoRecibido);
    const monedaRecibida = r.moneda;
    const hecho = await this.prisma.$transaction(async (tx) => {
      const i = await this.bloquear(tx, intentoId);
      if (i.estado === 'aprobado') return null;
      const factura = await tx.factura.findUniqueOrThrow({ where: { id: i.facturaId } });
      let revision: string | null = null;
      if (monedaRecibida !== i.moneda || !recibido.eq(i.monto)) {
        revision = `La pasarela informó ${formatearMonto(recibido.toFixed(2), monedaRecibida)} y se esperaban ${formatearMonto(i.monto.toFixed(2), i.moneda)}.`;
      } else if (factura.estado !== 'emitida') {
        revision = `La factura ya no estaba pendiente (${factura.estado}) cuando llegó el pago.`;
      } else if (factura.moneda !== i.moneda || !factura.total.eq(i.monto)) {
        revision = `La factura cambió después de iniciar el pago (ahora ${formatearMonto(factura.total.toFixed(2), factura.moneda)}).`;
      } else if (
        (await tx.pago.count({ where: { facturaId: factura.id, estado: 'en_revision' } })) > 0
      ) {
        revision = 'La factura tenía otro pago en revisión.';
      }
      const existente = await tx.pago.findUnique({
        where: { pasarela_idExterno: { pasarela: i.pasarela, idExterno: idCobro } },
      });
      const pago: Pago =
        existente ??
        (await this.pagos.registrarDePasarela(tx, {
          facturaId: factura.id,
          metodoCobroId: i.metodoCobroId,
          pasarela: i.pasarela,
          idCobro,
          moneda: monedaRecibida,
          montoDeclarado: i.monto,
          recibido,
          revision,
          creadoPorId: null,
          ...(cliente ? { cliente } : {}),
        }));
      await tx.intentoPago.update({
        where: { id: i.id },
        data: { estado: 'aprobado', pagoId: pago.id, error: revision ? MENSAJE_REVISION : null },
      });
      let metodo: MetodoPagoAutorizado | null = null;
      if (r.metodoGuardado && i.guardarMetodo) {
        metodo = await this.metodos.crearDesdeIntento(tx, i, r.metodoGuardado);
        // El cliente lo guardó al pagar esta suscripción: se activa en ella si se puede.
        if (metodo && !revision && factura.suscripcionId) {
          await this.metodos
            .asignarEnTx(tx, factura.suscripcionId, metodo.id, null, null)
            .catch((err: unknown) => {
              if (!(err instanceof ErrorApp)) throw err;
            });
        }
      }
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: revision ? 'pago_en_linea.revision' : 'pago_en_linea.aprobado',
          entidad: 'intento_pago',
          entidadId: i.id,
          antes: { estado: i.estado },
          despues: {
            estado: 'aprobado',
            origen,
            pagoId: pago.id,
            idCobro,
            recibido: recibido.toFixed(2),
            moneda: monedaRecibida,
            ...(revision ? { revision } : {}),
            ...(metodo ? { metodoAutorizadoId: metodo.id } : {}),
          },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      return { pago, revision, metodo, nuevo: !existente };
    });
    if (hecho?.nuevo) {
      if (hecho.revision) await this.equipo.revision(hecho.pago.id, hecho.revision);
      else await this.pagos.avisar(hecho.pago.id, 'confirmado');
    }
    if (hecho?.metodo) {
      await this.metodos.avisarCliente(
        hecho.metodo,
        'metodoAutorizadoGuardado',
        `guardado:${hecho.metodo.id}`,
      );
    }
    return this.prisma.intentoPago.findUniqueOrThrow({ where: { id: intentoId } });
  }

  /** Webhook o tarea: busca el intento por el id de la orden en la pasarela y lo resuelve. */
  async resolverPorIdExterno(pasarela: string, idExterno: string): Promise<IntentoPago | null> {
    const i = await this.prisma.intentoPago.findUnique({
      where: { pasarela_idExterno: { pasarela, idExterno } },
    });
    if (!i) return null;
    if (i.estado === 'aprobado') return i;
    return this.consultarYAplicar(i, 'webhook');
  }

  /** Vence los intentos abandonados. Antes consulta la pasarela por si sí se pagó. */
  async expirar(ahora = new Date()): Promise<number> {
    const vencidos = await this.prisma.intentoPago.findMany({
      where: { estado: { in: [...ABIERTOS] }, expiraEn: { lt: ahora } },
      orderBy: { expiraEn: 'asc' },
      take: 200,
    });
    let n = 0;
    for (const i of vencidos) {
      try {
        const final = await this.cerrarAbierto(i, 'expiracion', 'El pago no se completó a tiempo.');
        if (final.estado === 'expirado') n += 1;
      } catch (e) {
        this.logger.warn(`No se pudo vencer el intento ${i.id}: ${String(e)}`);
      }
    }
    return n;
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private texto(pasarela: Pasarela, moneda: IntentoPago['moneda'], titular: string): string {
    return textoAutorizacion({ pasarela: INFO_PASARELA[pasarela].nombre, moneda, titular });
  }

  private async validarInicio(
    tx: Tx,
    auth: ContextoAuth,
    facturaId: string,
    e: IniciarPagoEnLineaEntrada,
  ) {
    const factura = await this.facturas.bloquear(tx, auth, facturaId);
    if (factura.estado !== 'emitida') {
      throw new ErrorApp(409, 'FACTURA_CERRADA', 'Esta factura ya no está pendiente de pago.');
    }
    const noValido = (mensaje: string) =>
      new ErrorApp(400, 'DATOS_INVALIDOS', mensaje, { metodoCobroId: [mensaje] });
    if (factura.moneda === 'VES') {
      throw noValido('Las facturas en bolívares se pagan a mano (Pago Móvil o transferencia).');
    }
    const enRevision = await tx.pago.count({ where: { facturaId, estado: 'en_revision' } });
    if (enRevision > 0) {
      throw new ErrorApp(
        409,
        'PAGO_EN_REVISION',
        'Ya hay un pago de esta factura en revisión. Espera a que lo confirmemos.',
      );
    }
    const metodo = await tx.metodoCobro.findUnique({ where: { id: e.metodoCobroId } });
    if (
      !metodo ||
      !metodo.activo ||
      metodo.tipo !== 'pasarela' ||
      !esPasarela(metodo.pasarela) ||
      !this.registro.disponible(metodo.pasarela)
    ) {
      throw noValido('Elige un método de pago en línea disponible.');
    }
    if (
      metodo.moneda !== factura.moneda ||
      !pasarelaAdmiteMoneda(metodo.pasarela, factura.moneda)
    ) {
      throw noValido(`Elige un método que cobre en ${factura.moneda}.`);
    }
    let admiteGuardar = false;
    if (e.guardarMetodo) {
      if (!e.aceptoAutorizacion) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'Para guardar el método tienes que aceptar la autorización de cobro.',
          { aceptoAutorizacion: ['Acepta la autorización de cobro.'] },
        );
      }
      const s = factura.suscripcionId
        ? await tx.suscripcion.findUnique({
            where: { id: factura.suscripcionId },
            include: { cliente: { select: { revendedorId: true } } },
          })
        : null;
      if (!admiteRecurrente(metodo.pasarela) || !s || s.revendedorId || s.cliente.revendedorId) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'Este pago no admite guardar el método para cobros automáticos.',
          { guardarMetodo: ['No disponible para este pago.'] },
        );
      }
      admiteGuardar = true;
    }
    return { factura, metodo, admiteGuardar, numero: factura.numero };
  }

  /**
   * Cierra un intento abierto: primero pregunta a la pasarela (si ya se pagó,
   * lo aprueba); si no, lo deja cancelado o vencido.
   */
  private async cerrarAbierto(
    i: IntentoPago,
    origen: 'cancelacion' | 'expiracion',
    mensaje: string,
    cliente?: InfoCliente,
    actorId?: string,
  ): Promise<IntentoPago> {
    if (i.idExterno && this.registro.disponible(i.pasarela)) {
      try {
        const r = await this.registro.exigir(i.pasarela).consultarPago(i.idExterno);
        if (r.estado === 'aprobado') return this.aplicarResultado(i.id, r, origen, cliente);
        if (r.estado === 'rechazado') return this.aplicarResultado(i.id, r, origen, cliente);
      } catch (e) {
        // Sin respuesta: una expiración se reintenta en la próxima pasada.
        if (origen === 'expiracion') throw e;
      }
    }
    const estado = origen === 'expiracion' ? 'expirado' : 'cancelado';
    return this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquear(tx, i.id);
      if (!(ABIERTOS as readonly string[]).includes(actual.estado)) return actual;
      const f = await tx.intentoPago.update({
        where: { id: i.id },
        data: { estado, error: mensaje },
      });
      await this.auditoria.registrar(
        {
          ...(actorId ? { actorId } : { actorTipo: 'sistema' as const }),
          accion: `pago_en_linea.${estado}`,
          entidad: 'intento_pago',
          entidadId: i.id,
          antes: { estado: actual.estado },
          despues: { estado, motivo: mensaje },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      return f;
    });
  }

  private async cerrarSinPago(
    intentoId: string,
    r: ResultadoPago,
    origen: OrigenResultado,
    cliente?: InfoCliente,
  ): Promise<IntentoPago> {
    const estado = r.estado === 'cancelado' ? 'cancelado' : 'rechazado';
    const mensaje =
      r.mensaje ??
      (estado === 'cancelado' ? 'Cancelaste el pago.' : 'La pasarela rechazó el pago.');
    return this.prisma.$transaction(async (tx) => {
      const i = await this.bloquear(tx, intentoId);
      if (!(ABIERTOS as readonly string[]).includes(i.estado)) return i;
      const f = await tx.intentoPago.update({
        where: { id: i.id },
        data: { estado, error: mensaje.slice(0, 500) },
      });
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: `pago_en_linea.${estado}`,
          entidad: 'intento_pago',
          entidadId: i.id,
          antes: { estado: i.estado },
          despues: { estado, origen, motivo: mensaje },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      return f;
    });
  }

  private async consultarYAplicar(i: IntentoPago, origen: OrigenResultado): Promise<IntentoPago> {
    if (!i.idExterno || !this.registro.disponible(i.pasarela)) return i;
    let r: ResultadoPago;
    try {
      r = await this.registro.exigir(i.pasarela).consultarPago(i.idExterno);
    } catch (e) {
      if (origen === 'webhook') throw e;
      this.logger.warn(`Consulta del intento ${i.id} sin respuesta: ${String(e)}`);
      return i;
    }
    return this.aplicarResultado(i.id, r, origen);
  }

  private async propio(auth: ContextoAuth, id: string): Promise<IntentoPago> {
    const i = await this.prisma.intentoPago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
    });
    if (!i) throw Errores.noEncontrado('El pago');
    return i;
  }

  private async publico(id: string): Promise<IntentoPagoPublico> {
    return intentoPublico(await this.prisma.intentoPago.findUniqueOrThrow({ where: { id } }));
  }

  private async bloquear(tx: Tx, id: string): Promise<IntentoPago> {
    await tx.$queryRaw`SELECT id FROM intentos_pago WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.intentoPago.findUniqueOrThrow({ where: { id } });
  }
}
