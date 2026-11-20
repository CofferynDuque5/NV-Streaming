import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { ConfigBinance, PrismaClient } from '@nv/db';
import {
  type ConfigBinanceEntrada,
  type ConfigBinancePublica,
  type CorreoBinancePublico,
  type DeclararPagoBinanceEntrada,
  type IntentoPagoPublico,
  MINUTOS_ESPERA_BINANCE,
} from '@nv/shared';
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
import { AdaptadorBinance } from './binance.adaptador.js';
import { revisarCorreoBinance } from './correo-binance.js';

const CTX_USUARIO = 'binance:usuario';
const CTX_CLAVE = 'binance:clave';
const CTX_CODIGO = 'binance:antiphishing';
/** Intentos declarados que se siguen intentando emparejar (un correo puede llegar tarde). */
const DIAS_CONCILIAR = 7;

/**
 * Lee el buzón donde llegan los avisos de Binance, guarda cada correo (válido o
 * descartado, sin datos sensibles) y empareja los válidos con los pagos que
 * declararon los clientes. También guarda la configuración del buzón, cifrada.
 */
@Injectable()
export class CorreosBinanceService implements OnModuleInit {
  private readonly logger = new Logger('Binance');
  /** Resolver DNS para DKIM; las pruebas lo reemplazan. */
  resolverDkim: Parameters<typeof revisarCorreoBinance>[1]['resolver'];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(LectorImap) private readonly lector: LectorImap,
    @Inject(AdaptadorBinance) private readonly adaptador: AdaptadorBinance,
    @Inject(IntentosPagoService) private readonly intentos: IntentosPagoService,
    @Inject(AvisosEquipoPagosService) private readonly equipo: AvisosEquipoPagosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.leerCorreosBinance, async () => {
      await this.leer();
    });
  }

  // ── Configuración (equipo) ─────────────────────────────────────────────────

  async config(): Promise<ConfigBinancePublica> {
    return publica(await this.prisma.configBinance.findUnique({ where: { id: 1 } }));
  }

  async guardarConfig(
    auth: ContextoAuth,
    e: ConfigBinanceEntrada,
    cliente: InfoCliente,
  ): Promise<ConfigBinancePublica> {
    const actual = await this.prisma.configBinance.findUnique({ where: { id: 1 } });
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
    const codigo = e.codigoAntiPhishing?.trim() ? e.codigoAntiPhishing.trim() : null;
    const datos = {
      host: e.host,
      puerto: e.puerto,
      carpeta: e.carpeta,
      activo: e.activo,
      usuarioCifrado: this.cifrador.cifrar(e.usuario.trim(), CTX_USUARIO),
      pista: pistaUsuario(e.usuario),
      ...(clave ? { claveCifrada: this.cifrador.cifrar(clave, CTX_CLAVE) } : {}),
      ...(codigo ? { codigoCifrado: this.cifrador.cifrar(codigo, CTX_CODIGO) } : {}),
      // Otro buzón o carpeta: hay que volver a probarlo y leer desde cero.
      ...(cambiaBuzon
        ? { probadoEn: null, ultimoUid: null, uidValidez: null, ultimoError: null }
        : {}),
    };
    const guardada = await this.prisma.$transaction(async (tx) => {
      const g = await tx.configBinance.upsert({
        where: { id: 1 },
        create: { id: 1, ...datos, claveCifrada: datos.claveCifrada ?? '' },
        update: datos,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'binance.configurado',
          entidad: 'config_binance',
          entidadId: '1',
          despues: {
            host: g.host,
            carpeta: g.carpeta,
            activo: g.activo,
            pista: g.pista,
            claveCambiada: !!clave,
            codigoCambiado: !!codigo,
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

  /** Conecta con el buzón; si sale bien, Binance queda disponible para los clientes. */
  async probar(auth: ContextoAuth, cliente: InfoCliente): Promise<ConfigBinancePublica> {
    const c = await this.prisma.configBinance.findUnique({ where: { id: 1 } });
    if (!c) throw Errores.noEncontrado('La configuración de Binance');
    try {
      await this.lector.probar(this.conexion(c));
    } catch (err) {
      const mensaje = err instanceof ErrorBuzon ? err.message : 'No se pudo leer el buzón.';
      await this.prisma.configBinance.update({
        where: { id: 1 },
        data: { probadoEn: null, ultimoError: mensaje },
      });
      await this.adaptador.refrescar();
      throw new ErrorApp(422, 'BUZON_NO_RESPONDE', mensaje);
    }
    const g = await this.prisma.configBinance.update({
      where: { id: 1 },
      data: { probadoEn: new Date(), ultimoError: null },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'binance.probado',
      entidad: 'config_binance',
      entidadId: '1',
      cliente,
    });
    await this.adaptador.refrescar();
    return publica(g);
  }

  /** Últimos correos leídos (para que el equipo vea qué llegó y por qué se descartó). */
  async correos(): Promise<CorreoBinancePublico[]> {
    const filas = await this.prisma.correoBinance.findMany({
      orderBy: { recibidoEn: 'desc' },
      take: 50,
      include: { intento: { select: { id: true, referencia: true, facturaId: true } } },
    });
    return filas.map((c) => ({
      id: c.id,
      remitente: c.remitente,
      monto: c.monto ? dec2(c.monto) : null,
      pagadoEn: iso(c.pagadoEn),
      recibidoEn: iso(c.recibidoEn)!,
      estado: c.estado as CorreoBinancePublico['estado'],
      motivo: c.motivo,
      intento: c.intento,
    }));
  }

  // ── Cliente ────────────────────────────────────────────────────────────────

  /**
   * El cliente dice con qué usuario de Binance pagó y cuánto envió. NV espera el
   * correo de Binance hasta MINUTOS_ESPERA_BINANCE; si ya llegó, confirma en el acto.
   */
  async declarar(
    auth: ContextoAuth,
    id: string,
    e: DeclararPagoBinanceEntrada,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    const i = await this.prisma.intentoPago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
    });
    if (!i) throw Errores.noEncontrado('El pago');
    if (i.pasarela !== 'binance') {
      throw new ErrorApp(409, 'NO_ES_BINANCE', 'Este pago no es por Binance.');
    }
    if (!(ABIERTOS as readonly string[]).includes(i.estado)) {
      throw new ErrorApp(
        409,
        'PAGO_CERRADO',
        'Este pago ya terminó. Si enviaste el dinero, escríbenos con el comprobante.',
      );
    }
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.intentoPago.update({
        where: { id: i.id },
        data: {
          pagadorDeclarado: e.usuario.trim(),
          montoDeclarado: D(e.monto),
          declaradoEn: ahora,
          expiraEn: new Date(ahora.getTime() + MINUTOS_ESPERA_BINANCE * 60_000),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pago_en_linea.binance_declarado',
          entidad: 'intento_pago',
          entidadId: i.id,
          despues: { usuario: e.usuario.trim(), monto: D(e.monto).toFixed(2) },
          cliente,
        },
        tx,
      );
      // Lee el buzón cuanto antes (una vez por minuto como mucho).
      await this.trabajos.encolar(
        {
          tipo: TRABAJO.leerCorreosBinance,
          claveUnica: `leer_binance:${ahora.toISOString().slice(0, 16)}`,
          maxIntentos: 1,
        },
        tx,
      );
    });
    if (i.idExterno)
      await this.intentos.resolverPorIdExterno('binance', i.idExterno).catch(() => null);
    return this.intentos.publico(i.id);
  }

  // ── Trabajo periódico ──────────────────────────────────────────────────────

  /** Lee los correos nuevos, los guarda y concilia. Devuelve cuántos correos válidos llegaron. */
  async leer(): Promise<number> {
    const c = await this.prisma.configBinance.findUnique({ where: { id: 1 } });
    if (!c || !c.activo || !c.probadoEn) return 0;
    let validos = 0;
    try {
      // El código anti-phishing ya no se exige (pedido de Nathan, 20-11-2026): basta la firma
      // DKIM de binance.com. Si había uno guardado, se conserva cifrado pero no se usa.
      const codigo: string | null = null;
      const r = await this.lector.nuevos(this.conexion(c), {
        uid: c.ultimoUid,
        validez: c.uidValidez,
      });
      let ultimo = c.uidValidez === r.validez ? c.ultimoUid : null;
      for (const m of r.correos) {
        const rev = await revisarCorreoBinance(m.fuente, {
          codigoAntiPhishing: codigo,
          ...(this.resolverDkim ? { resolver: this.resolverDkim } : {}),
        });
        const datos = rev.valido
          ? {
              huella: rev.huella,
              remitente: rev.pago.remitente.slice(0, 80),
              monto: D(rev.pago.monto),
              moneda: rev.pago.moneda.slice(0, 10),
              pagadoEn: rev.pago.pagadoEn,
              estado: 'libre',
            }
          : { huella: rev.huella, estado: 'descartado', motivo: rev.motivo.slice(0, 200) };
        const creado = await this.prisma.correoBinance.createMany({
          data: [datos],
          skipDuplicates: true,
        });
        if (rev.valido && creado.count === 1) validos += 1;
        if (rev.valido && creado.count === 0) {
          // Ya se había leído y descartado (p. ej. por el código anti-phishing que ya no se
          // exige): si ahora es válido y sigue sin usar, se rescata. Nunca toca uno usado.
          const rescatado = await this.prisma.correoBinance.updateMany({
            where: { huella: rev.huella, estado: 'descartado', intentoId: null },
            data: { ...datos, motivo: null },
          });
          validos += rescatado.count;
        }
        const uid = BigInt(m.uid);
        if (ultimo === null || uid > ultimo) ultimo = uid;
      }
      await this.prisma.configBinance.update({
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
      if (!(err instanceof ErrorBuzon)) this.logger.warn(`Lectura de Binance: ${String(err)}`);
      await this.prisma.configBinance.update({ where: { id: 1 }, data: { ultimoError: mensaje } });
    }
    await this.conciliar();
    return validos;
  }

  /** Empareja los pagos declarados con los correos libres y avisa de los que no llegaron. */
  async conciliar(ahora = new Date()): Promise<void> {
    const declarados = await this.prisma.intentoPago.findMany({
      where: {
        pasarela: 'binance',
        pagoId: null,
        declaradoEn: { not: null, gte: new Date(ahora.getTime() - DIAS_CONCILIAR * 86_400_000) },
        estado: { in: ['pendiente', 'expirado', 'cancelado'] },
        correoBinance: null,
      },
      orderBy: { declaradoEn: 'asc' },
      take: 200,
    });
    for (const i of declarados) {
      try {
        const correo = await this.adaptador.vincular(i);
        if (correo && i.idExterno) {
          await this.intentos.resolverPorIdExterno('binance', i.idExterno);
          continue;
        }
        if (!correo && !i.avisoEquipoEn && i.expiraEn < ahora) {
          const marcado = await this.prisma.intentoPago.updateMany({
            where: { id: i.id, avisoEquipoEn: null },
            data: { avisoEquipoEn: ahora },
          });
          if (marcado.count === 1) await this.equipo.binanceSinConfirmar(i.id);
        }
      } catch (e) {
        this.logger.warn(`No se pudo conciliar el intento ${i.id}: ${String(e)}`);
      }
    }
  }

  private conexion(c: ConfigBinance): ConexionBuzon {
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

function publica(c: ConfigBinance | null): ConfigBinancePublica {
  return {
    configurada: !!c,
    activo: c?.activo ?? false,
    host: c?.host ?? 'imap.gmail.com',
    puerto: c?.puerto ?? 993,
    pista: c?.pista ?? null,
    carpeta: c?.carpeta ?? 'NV-Binance',
    tieneCodigoAntiPhishing: !!c?.codigoCifrado,
    probadoEn: iso(c?.probadoEn ?? null),
    ultimaLectura: iso(c?.ultimaLectura ?? null),
    ultimoError: c?.ultimoError ?? null,
  };
}
