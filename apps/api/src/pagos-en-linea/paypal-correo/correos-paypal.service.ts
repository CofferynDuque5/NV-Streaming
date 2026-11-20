import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { ConfigPaypalCorreo, PrismaClient } from '@nv/db';
import {
  type ConfigPaypalCorreoEntrada,
  type ConfigPaypalCorreoPublica,
  type CorreoPaypalPublico,
  type DeclararPagoPaypalEntrada,
  type IntentoPagoPublico,
  MINUTOS_ESPERA_PAYPAL,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../../almacen/almacen.service.js';
import { AuditoriaService } from '../../auditoria/auditoria.service.js';
import { TRABAJO } from '../../automatizaciones/trabajos.js';
import { TrabajosService } from '../../automatizaciones/trabajos.service.js';
import { ErrorBuzon, LectorImap, type ConexionBuzon } from '../../codigos/lector-imap.js';
import { alcanceClientes } from '../../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../../comun/contexto.js';
import { Cifrador } from '../../comun/cripto.js';
import { ErrorApp, Errores } from '../../comun/errores.js';
import { dec2, iso } from '../../comun/formato.js';
import { PRISMA } from '../../comun/tokens.js';
import { pistaUsuario } from '../../cuentas/cuentas.service.js';
import { D } from '../../dinero/dinero.js';
import { AvisosEquipoPagosService } from '../avisos-equipo.service.js';
import { IntentosPagoService } from '../intentos.service.js';
import { ABIERTOS } from '../presentacion.js';
import { referenciaEn, revisarCorreoPaypal } from './correo-paypal.js';
import { AdaptadorPaypalCorreo } from './paypal-correo.adaptador.js';

const CTX_USUARIO = 'paypal-correo:usuario';
const CTX_CLAVE = 'paypal-correo:clave';
/** Intentos que se siguen intentando emparejar (un aviso puede llegar tarde). */
const DIAS_CONCILIAR = 7;

/**
 * Lee el buzón donde llegan los avisos «Ha recibido un pago» de PayPal, guarda
 * cada aviso (válido o descartado) y lo empareja con los pagos de los clientes.
 * También guarda la configuración del buzón, cifrada.
 */
@Injectable()
export class CorreosPaypalService implements OnModuleInit {
  private readonly logger = new Logger('PayPalCorreo');
  /** Resolver DNS para DKIM; las pruebas lo reemplazan. */
  resolverDkim: NonNullable<Parameters<typeof revisarCorreoPaypal>[1]>['resolver'];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(LectorImap) private readonly lector: LectorImap,
    @Inject(AdaptadorPaypalCorreo) private readonly adaptador: AdaptadorPaypalCorreo,
    @Inject(IntentosPagoService) private readonly intentos: IntentosPagoService,
    @Inject(AvisosEquipoPagosService) private readonly equipo: AvisosEquipoPagosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.leerCorreosPaypal, async () => {
      await this.leer();
    });
  }

  // ── Configuración (equipo) ─────────────────────────────────────────────────

  async config(): Promise<ConfigPaypalCorreoPublica> {
    return publica(await this.prisma.configPaypalCorreo.findUnique({ where: { id: 1 } }));
  }

  async guardarConfig(
    auth: ContextoAuth,
    e: ConfigPaypalCorreoEntrada,
    cliente: InfoCliente,
  ): Promise<ConfigPaypalCorreoPublica> {
    const actual = await this.prisma.configPaypalCorreo.findUnique({ where: { id: 1 } });
    const clave = e.clave?.trim() ? e.clave.trim() : null;
    if (!actual && !clave) {
      throw new ErrorApp(400, 'FALTA_CLAVE', 'Escribe la contraseña de aplicación del correo.');
    }
    const usuarioAnterior = actual
      ? this.cifrador.descifrar(actual.usuarioCifrado, CTX_USUARIO)
      : null;
    const cambiaBuzon =
      !actual ||
      actual.host !== e.host ||
      actual.puerto !== e.puerto ||
      actual.carpeta !== e.carpeta ||
      usuarioAnterior?.toLowerCase() !== e.usuario.trim().toLowerCase() ||
      !!clave;
    const datos = {
      host: e.host,
      puerto: e.puerto,
      carpeta: e.carpeta,
      activo: e.activo,
      usuarioCifrado: this.cifrador.cifrar(e.usuario.trim(), CTX_USUARIO),
      pista: pistaUsuario(e.usuario),
      ...(clave ? { claveCifrada: this.cifrador.cifrar(clave, CTX_CLAVE) } : {}),
      ...(cambiaBuzon
        ? { probadoEn: null, ultimoUid: null, uidValidez: null, ultimoError: null }
        : {}),
    };
    const guardada = await this.prisma.$transaction(async (tx) => {
      const g = await tx.configPaypalCorreo.upsert({
        where: { id: 1 },
        create: { id: 1, ...datos, claveCifrada: datos.claveCifrada ?? '' },
        update: datos,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'paypal_correo.configurado',
          entidad: 'config_paypal_correo',
          entidadId: '1',
          despues: {
            host: g.host,
            carpeta: g.carpeta,
            activo: g.activo,
            pista: g.pista,
            claveCambiada: !!clave,
          },
          cliente,
        },
        tx,
      );
      return g;
    });
    await this.adaptador.refrescar();
    return publica(guardada);
  }

  /** Conecta con el buzón; si sale bien, PayPal personal queda disponible para los clientes. */
  async probar(auth: ContextoAuth, cliente: InfoCliente): Promise<ConfigPaypalCorreoPublica> {
    const c = await this.prisma.configPaypalCorreo.findUnique({ where: { id: 1 } });
    if (!c) throw Errores.noEncontrado('La configuración de PayPal');
    try {
      await this.lector.probar(this.conexion(c));
    } catch (err) {
      const mensaje = err instanceof ErrorBuzon ? err.message : 'No se pudo leer el buzón.';
      await this.prisma.configPaypalCorreo.update({
        where: { id: 1 },
        data: { probadoEn: null, ultimoError: mensaje },
      });
      await this.adaptador.refrescar();
      throw new ErrorApp(422, 'BUZON_NO_RESPONDE', mensaje);
    }
    const g = await this.prisma.configPaypalCorreo.update({
      where: { id: 1 },
      data: { probadoEn: new Date(), ultimoError: null },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'paypal_correo.probado',
      entidad: 'config_paypal_correo',
      entidadId: '1',
      cliente,
    });
    await this.adaptador.refrescar();
    return publica(g);
  }

  async correos(): Promise<CorreoPaypalPublico[]> {
    const filas = await this.prisma.correoPaypal.findMany({
      orderBy: { recibidoEn: 'desc' },
      take: 50,
      include: { intento: { select: { id: true, referencia: true, facturaId: true } } },
    });
    return filas.map((c) => ({
      id: c.id,
      pagador: c.pagador,
      monto: c.monto ? dec2(c.monto) : null,
      referencia: c.referencia,
      idTransaccion: c.idTransaccion,
      pagadoEn: iso(c.pagadoEn),
      recibidoEn: iso(c.recibidoEn)!,
      estado: c.estado as CorreoPaypalPublico['estado'],
      motivo: c.motivo,
      intento: c.intento,
    }));
  }

  // ── Cliente ────────────────────────────────────────────────────────────────

  /**
   * El cliente dice a nombre de quién está su PayPal y sube la captura del pago.
   * NV espera el aviso de PayPal hasta MINUTOS_ESPERA_PAYPAL; si ya llegó, confirma en el acto.
   */
  async declarar(
    auth: ContextoAuth,
    id: string,
    e: DeclararPagoPaypalEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    const i = await this.prisma.intentoPago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
    });
    if (!i) throw Errores.noEncontrado('El pago');
    if (i.pasarela !== 'paypal_correo') {
      throw new ErrorApp(409, 'NO_ES_PAYPAL', 'Este pago no es por PayPal.');
    }
    if (!(ABIERTOS as readonly string[]).includes(i.estado)) {
      throw new ErrorApp(
        409,
        'PAGO_CERRADO',
        'Este pago ya terminó. Si enviaste el dinero, escríbenos con el comprobante.',
      );
    }
    if (!archivo && !i.comprobanteId) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta la captura del pago.', {
        comprobante: ['Adjunta la captura del pago en PayPal.'],
      });
    }
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const comprobante = archivo ? await this.almacen.guardar(tx, archivo, auth.usuario.id) : null;
      await tx.intentoPago.update({
        where: { id: i.id },
        data: {
          pagadorDeclarado: e.nombre.trim().slice(0, 80),
          transaccionDeclarada: e.idTransaccion ?? null,
          declaradoEn: ahora,
          expiraEn: new Date(ahora.getTime() + MINUTOS_ESPERA_PAYPAL * 60_000),
          ...(comprobante ? { comprobanteId: comprobante.id } : {}),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pago_en_linea.paypal_declarado',
          entidad: 'intento_pago',
          entidadId: i.id,
          despues: {
            nombre: e.nombre.trim(),
            idTransaccion: e.idTransaccion ?? null,
            comprobante: comprobante?.id ?? null,
          },
          cliente,
        },
        tx,
      );
      await this.trabajos.encolar(
        {
          tipo: TRABAJO.leerCorreosPaypal,
          claveUnica: `leer_paypal:${ahora.toISOString().slice(0, 16)}`,
          maxIntentos: 1,
        },
        tx,
      );
    });
    if (i.idExterno) {
      await this.intentos.resolverPorIdExterno('paypal_correo', i.idExterno).catch(() => null);
    }
    return this.intentos.publico(i.id);
  }

  /** Captura que subió el cliente (para él o para el equipo). */
  async comprobantePropio(auth: ContextoAuth, id: string) {
    const i = await this.prisma.intentoPago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: { comprobante: true },
    });
    if (!i?.comprobante) throw Errores.noEncontrado('El comprobante');
    return { archivo: i.comprobante, contenido: await this.almacen.leer(i.comprobante) };
  }

  // ── Trabajo periódico ──────────────────────────────────────────────────────

  /** Lee los avisos nuevos, los guarda y concilia. Devuelve cuántos avisos válidos llegaron. */
  async leer(): Promise<number> {
    const c = await this.prisma.configPaypalCorreo.findUnique({ where: { id: 1 } });
    if (!c || !c.activo || !c.probadoEn) return 0;
    let validos = 0;
    try {
      const r = await this.lector.nuevos(this.conexion(c), {
        uid: c.ultimoUid,
        validez: c.uidValidez,
      });
      let ultimo = c.uidValidez === r.validez ? c.ultimoUid : null;
      for (const m of r.correos) {
        const rev = await revisarCorreoPaypal(
          m.fuente,
          this.resolverDkim ? { resolver: this.resolverDkim } : {},
        );
        const datos = rev.valido
          ? {
              huella: rev.huella,
              pagador: rev.pago.pagador.slice(0, 120),
              monto: D(rev.pago.monto),
              moneda: rev.pago.moneda.slice(0, 10),
              idTransaccion: rev.pago.idTransaccion,
              referencia: referenciaEn(rev.pago.nota),
              pagadoEn: rev.pago.pagadoEn,
              estado: 'libre',
            }
          : { huella: rev.huella, estado: 'descartado', motivo: rev.motivo.slice(0, 200) };
        const creado = await this.prisma.correoPaypal.createMany({
          data: [datos],
          skipDuplicates: true,
        });
        if (rev.valido && creado.count === 1) validos += 1;
        const uid = BigInt(m.uid);
        if (ultimo === null || uid > ultimo) ultimo = uid;
      }
      await this.prisma.configPaypalCorreo.update({
        where: { id: 1 },
        data: {
          ultimoUid: ultimo,
          uidValidez: r.validez,
          ultimaLectura: new Date(),
          ultimoError: null,
        },
      });
    } catch (err) {
      const mensaje = err instanceof ErrorBuzon ? err.message : 'No se pudo leer el buzón.';
      if (!(err instanceof ErrorBuzon)) this.logger.warn(`Lectura de PayPal: ${String(err)}`);
      await this.prisma.configPaypalCorreo.update({
        where: { id: 1 },
        data: { ultimoError: mensaje },
      });
    }
    await this.conciliar();
    return validos;
  }

  /**
   * Empareja avisos y pagos: primero los avisos que traen la referencia de NV en
   * la nota (aunque el cliente no haya vuelto a la página), luego los pagos que el
   * cliente declaró. Avisa al equipo de los declarados que no llegaron a tiempo.
   */
  async conciliar(ahora = new Date()): Promise<void> {
    const desde = new Date(ahora.getTime() - DIAS_CONCILIAR * 86_400_000);
    const conReferencia = await this.prisma.correoPaypal.findMany({
      where: { estado: 'libre', intentoId: null, referencia: { not: null } },
      select: { referencia: true },
      take: 200,
    });
    const referencias = [
      ...new Set(conReferencia.map((c) => c.referencia).filter((r): r is string => !!r)),
    ];
    const pendientes = await this.prisma.intentoPago.findMany({
      where: {
        pasarela: 'paypal_correo',
        pagoId: null,
        correoPaypal: null,
        creadoEn: { gte: desde },
        estado: { in: ['creado', 'pendiente', 'expirado', 'cancelado'] },
        OR: [{ referencia: { in: referencias } }, { declaradoEn: { not: null, gte: desde } }],
      },
      orderBy: { creadoEn: 'asc' },
      take: 200,
    });
    for (const i of pendientes) {
      try {
        const correo = await this.adaptador.vincular(i);
        if (correo && i.idExterno) {
          await this.intentos.resolverPorIdExterno('paypal_correo', i.idExterno);
          continue;
        }
        if (!correo && i.declaradoEn && !i.avisoEquipoEn && i.expiraEn < ahora) {
          const marcado = await this.prisma.intentoPago.updateMany({
            where: { id: i.id, avisoEquipoEn: null },
            data: { avisoEquipoEn: ahora },
          });
          if (marcado.count === 1) await this.equipo.paypalSinConfirmar(i.id);
        }
      } catch (e) {
        this.logger.warn(`No se pudo conciliar el intento ${i.id}: ${String(e)}`);
      }
    }
  }

  private conexion(c: ConfigPaypalCorreo): ConexionBuzon {
    return {
      host: c.host,
      puerto: c.puerto,
      seguro: c.puerto === 993,
      usuario: this.cifrador.descifrar(c.usuarioCifrado, CTX_USUARIO),
      clave: this.cifrador.descifrar(c.claveCifrada, CTX_CLAVE),
      carpeta: c.carpeta,
    };
  }
}

function publica(c: ConfigPaypalCorreo | null): ConfigPaypalCorreoPublica {
  return {
    configurada: !!c,
    activo: c?.activo ?? false,
    host: c?.host ?? 'imap.gmail.com',
    puerto: c?.puerto ?? 993,
    pista: c?.pista ?? null,
    carpeta: c?.carpeta ?? 'NV-PayPal',
    probadoEn: iso(c?.probadoEn ?? null),
    ultimaLectura: iso(c?.ultimaLectura ?? null),
    ultimoError: c?.ultimoError ?? null,
  };
}
