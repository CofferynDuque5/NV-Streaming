import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { OperacionSandbox, PrismaClient } from '@nv/db';
import type { Moneda } from '@nv/shared';
import { ErrorApp } from '../../comun/errores.js';
import { esUnicoDuplicado } from '../../comun/formato.js';
import { ENTORNO, PRISMA } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { D } from '../../dinero/dinero.js';
import {
  type AdaptadorPasarela,
  type DatosCobro,
  type DatosCrearPago,
  redactarCarga,
  type ResultadoPago,
  type ResultadoReembolso,
  type TipoEventoNormalizado,
  type VerificacionWebhook,
} from '../adaptador.js';

/** Cabecera con la firma de los webhooks de la pasarela de pruebas: `t=<segundos>,v1=<hmac hex>`. */
export const CABECERA_FIRMA_SANDBOX = 'x-sandbox-firma';
/** Un webhook firmado hace más de esto se rechaza (repetición). */
const TOLERANCIA_FIRMA_S = 300;

/** Qué hará el próximo cobro con un token (gancho de pruebas). */
export type ForzarToken = 'rechazar' | 'invalido' | null;

export type TipoEventoSandbox =
  | 'orden.aprobada'
  | 'orden.rechazada'
  | 'cobro.completado'
  | 'cobro.rechazado'
  | 'reembolso.completado'
  | 'token.revocado';

const NORMALIZADO: Record<TipoEventoSandbox, TipoEventoNormalizado> = {
  'orden.aprobada': 'pago_aprobado',
  'orden.rechazada': 'pago_rechazado',
  'cobro.completado': 'pago_aprobado',
  'cobro.rechazado': 'pago_rechazado',
  'reembolso.completado': 'reembolso_completado',
  'token.revocado': 'metodo_revocado',
};

const id = (prefijo: string) => `sbx_${prefijo}_${randomBytes(9).toString('base64url')}`;
const centavos = (monto: string) => D(monto).mul(100).mod(100).toNumber();

/**
 * Pasarela de pruebas: nunca mueve dinero. Guarda su "estado de pasarela" en
 * `operaciones_sandbox` (la API y el trabajador son procesos distintos) y se
 * comporta como una pasarela real: la orden se aprueba en su propia página
 * (`/pago-sandbox/<intento>` de la web), se captura al volver o al consultar,
 * emite webhooks firmados y guarda métodos con tokens `sbx_tok_…`.
 *
 * Cómo forzar resultados (pruebas y demostraciones):
 * - En la página de pago se elige aprobar, rechazar o cancelar.
 * - Importe de la orden terminado en ,15 → la pasarela informa 1,00 menos de lo
 *   cobrado (sirve para probar la revisión por monto distinto).
 * - Cobro automático por un importe terminado en ,13 → rechazado (fondos
 *   insuficientes); terminado en ,14 → token inválido (tarjeta vencida).
 * - `forzarToken(token, 'rechazar' | 'invalido')` fuerza el siguiente cobro con
 *   ese token; `revocarToken(token)` lo invalida del lado de la pasarela.
 * - `firmar(cuerpo)` firma un webhook como lo haría la pasarela.
 */
@Injectable()
export class AdaptadorSandbox implements AdaptadorPasarela {
  readonly pasarela = 'sandbox' as const;
  readonly modo = 'pruebas' as const;
  private readonly claveFirma: Buffer;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {
    this.claveFirma = createHmac('sha256', Buffer.from(entorno.CLAVE_CIFRADO, 'base64'))
      .update('nv:pasarela-sandbox:webhook')
      .digest();
  }

  configurada(): boolean {
    return this.entorno.PASARELA_SANDBOX_HABILITADA;
  }

  async crearPago(e: DatosCrearPago): Promise<{ idExterno: string; urlPago: string }> {
    const existente = await this.prisma.operacionSandbox.findFirst({
      where: { tipo: 'orden', idInterno: e.idInterno },
    });
    const orden =
      existente ??
      (await this.prisma.operacionSandbox.create({
        data: {
          id: id('ord'),
          tipo: 'orden',
          estado: 'creada',
          referencia: e.referencia,
          idInterno: e.idInterno,
          monto: D(e.monto),
          moneda: e.moneda,
          descripcion: e.descripcion.slice(0, 200),
          guardarMetodo: e.guardarMetodo,
          datos: { urlRetorno: e.urlRetorno, urlCancelacion: e.urlCancelacion },
        },
      }));
    return {
      idExterno: orden.id,
      urlPago: `${this.entorno.WEB_ORIGEN}/pago-sandbox/${e.idInterno}`,
    };
  }

  confirmarRetorno(idExterno: string): Promise<ResultadoPago> {
    return this.consultarPago(idExterno);
  }

  async consultarPago(idExterno: string): Promise<ResultadoPago> {
    const orden = await this.prisma.operacionSandbox.findUnique({ where: { id: idExterno } });
    if (orden?.tipo === 'cobro') return this.resultadoCobro(orden);
    if (!orden || orden.tipo !== 'orden') {
      return this.sinResultado('rechazado', 'La pasarela de pruebas no conoce ese pago.');
    }
    if (orden.estado === 'creada') return this.sinResultado('pendiente');
    if (orden.estado === 'rechazada') {
      return this.sinResultado('rechazado', 'La pasarela de pruebas rechazó el pago.');
    }
    if (orden.estado === 'cancelada') {
      return this.sinResultado('cancelado', 'Cancelaste el pago en la pasarela.');
    }
    return this.resultadoCobro(await this.capturar(orden));
  }

  async cobrarConMetodo(token: string, e: DatosCobro): Promise<ResultadoPago> {
    const previo = await this.prisma.operacionSandbox.findUnique({
      where: { claveIdempotencia: `cobro:${e.claveIdempotencia}` },
    });
    if (previo) return this.resultadoCobro(previo);
    const t = await this.prisma.operacionSandbox.findUnique({ where: { id: token } });
    let estado = 'completado';
    let motivo: string | null = null;
    let invalido = false;
    const forzado = (t?.datos as { forzar?: ForzarToken } | null)?.forzar ?? null;
    if (!t || t.tipo !== 'token' || t.estado !== 'activo' || forzado === 'invalido') {
      [estado, motivo, invalido] = ['rechazado', 'La tarjeta de prueba ya no es válida.', true];
    } else if (t.moneda !== e.moneda) {
      [estado, motivo] = ['rechazado', 'La tarjeta de prueba no cobra en esa moneda.'];
    } else if (centavos(e.monto) === 14) {
      [estado, motivo, invalido] = ['rechazado', 'La tarjeta de prueba está vencida.', true];
    } else if (forzado === 'rechazar' || centavos(e.monto) === 13) {
      [estado, motivo] = ['rechazado', 'Fondos insuficientes (pasarela de pruebas).'];
    }
    if (invalido && t?.tipo === 'token' && t.estado === 'activo') {
      await this.prisma.operacionSandbox.update({
        where: { id: t.id },
        data: { estado: 'invalido' },
      });
    }
    try {
      const cobro = await this.prisma.operacionSandbox.create({
        data: {
          id: id('cap'),
          tipo: 'cobro',
          estado,
          referencia: e.referencia,
          monto: D(e.monto),
          moneda: e.moneda,
          descripcion: e.descripcion.slice(0, 200),
          relacionadoId: token.slice(0, 60),
          claveIdempotencia: `cobro:${e.claveIdempotencia}`,
          datos: { motivo, invalido },
        },
      });
      return this.resultadoCobro(cobro);
    } catch (err) {
      if (!esUnicoDuplicado(err)) throw err;
      const otro = await this.prisma.operacionSandbox.findUniqueOrThrow({
        where: { claveIdempotencia: `cobro:${e.claveIdempotencia}` },
      });
      return this.resultadoCobro(otro);
    }
  }

  async reembolsar(
    idCobro: string,
    monto: string,
    moneda: Moneda,
    claveIdempotencia: string,
  ): Promise<ResultadoReembolso> {
    const clave = `reembolso:${claveIdempotencia}`;
    const previo = await this.prisma.operacionSandbox.findUnique({
      where: { claveIdempotencia: clave },
    });
    if (previo) return this.resultadoReembolso(previo);
    const cobro = await this.prisma.operacionSandbox.findUnique({ where: { id: idCobro } });
    let estado = 'completado';
    let motivo: string | null = null;
    if (!cobro || cobro.tipo !== 'cobro' || cobro.estado !== 'completado') {
      [estado, motivo] = ['fallido', 'La pasarela de pruebas no encuentra ese cobro.'];
    } else if (cobro.moneda !== moneda) {
      [estado, motivo] = ['fallido', 'La moneda no coincide con la del cobro.'];
    } else {
      const previos = await this.prisma.operacionSandbox.aggregate({
        where: { tipo: 'reembolso', relacionadoId: idCobro, estado: 'completado' },
        _sum: { monto: true },
      });
      const total = (previos._sum.monto ?? D(0)).add(D(monto));
      if (total.gt(cobro.monto ?? D(0))) {
        [estado, motivo] = ['fallido', 'La devolución supera lo cobrado.'];
      }
    }
    try {
      const r = await this.prisma.operacionSandbox.create({
        data: {
          id: id('ref'),
          tipo: 'reembolso',
          estado,
          monto: D(monto),
          moneda,
          relacionadoId: idCobro.slice(0, 60),
          claveIdempotencia: clave,
          datos: { motivo },
        },
      });
      return this.resultadoReembolso(r);
    } catch (err) {
      if (!esUnicoDuplicado(err)) throw err;
      return this.resultadoReembolso(
        await this.prisma.operacionSandbox.findUniqueOrThrow({
          where: { claveIdempotencia: clave },
        }),
      );
    }
  }

  async verificarWebhook(
    cabeceras: Record<string, string | string[] | undefined>,
    cuerpoCrudo: Buffer,
  ): Promise<VerificacionWebhook> {
    const firma = cabeceras[CABECERA_FIRMA_SANDBOX];
    if (typeof firma !== 'string') return { valido: false };
    const partes = Object.fromEntries(
      firma.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
    );
    const t = Number(partes['t']);
    const v1 = partes['v1'] ?? '';
    if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCIA_FIRMA_S) {
      return { valido: false };
    }
    const esperada = this.hmac(t, cuerpoCrudo);
    const recibida = Buffer.from(v1, 'hex');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      return { valido: false };
    }
    let cuerpo: { id?: unknown; tipo?: unknown; recurso?: unknown };
    try {
      cuerpo = JSON.parse(cuerpoCrudo.toString('utf8')) as typeof cuerpo;
    } catch {
      return { valido: false };
    }
    const tipo = String(cuerpo.tipo ?? '');
    const recurso = typeof cuerpo.recurso === 'string' ? cuerpo.recurso : null;
    if (typeof cuerpo.id !== 'string' || !cuerpo.id) return { valido: false };
    const normal = (NORMALIZADO as Record<string, TipoEventoNormalizado>)[tipo] ?? 'otro';
    const esToken = tipo.startsWith('token.');
    return {
      valido: true,
      evento: {
        idEvento: cuerpo.id.slice(0, 160),
        tipo: tipo.slice(0, 120) || 'desconocido',
        // Un token nunca se guarda en claro: ni como recurso ni en la carga.
        idRecurso: esToken ? null : recurso,
        normalizado: {
          tipo: normal,
          idExterno: tipo.startsWith('orden.') ? recurso : null,
          idCobro: tipo.startsWith('cobro.') ? recurso : null,
          idReembolso: tipo.startsWith('reembolso.') ? recurso : null,
          token: tipo.startsWith('token.') ? recurso : null,
        },
        carga: redactarCarga(esToken ? { ...cuerpo, recurso: '[token]' } : cuerpo) as Record<
          string,
          unknown
        >,
      },
    };
  }

  async revocarMetodo(token: string): Promise<void> {
    await this.prisma.operacionSandbox.updateMany({
      where: { id: token, tipo: 'token', estado: 'activo' },
      data: { estado: 'revocado' },
    });
  }

  // ── Página de pago de pruebas ─────────────────────────────────────────────

  /** La orden de un intento de NV, para la página `/pago-sandbox/<intento>`. */
  orden(idInterno: string) {
    return this.prisma.operacionSandbox.findFirst({
      where: { tipo: 'orden', idInterno },
      orderBy: { creadoEn: 'desc' },
    });
  }

  /** Quien prueba elige el resultado en la página de la pasarela. Solo una vez por orden. */
  async simular(
    idInterno: string,
    resultado: 'aprobar' | 'rechazar' | 'cancelar',
  ): Promise<OperacionSandbox> {
    const orden = await this.orden(idInterno);
    if (!orden) throw new ErrorApp(404, 'NO_ENCONTRADO', 'El pago de prueba no existe.');
    const estado =
      resultado === 'aprobar' ? 'aprobada' : resultado === 'rechazar' ? 'rechazada' : 'cancelada';
    const n = await this.prisma.operacionSandbox.updateMany({
      where: { id: orden.id, estado: 'creada' },
      data: { estado },
    });
    if (n.count === 0) {
      throw new ErrorApp(409, 'PAGO_YA_RESUELTO', 'Este pago de prueba ya se resolvió.');
    }
    return this.prisma.operacionSandbox.findUniqueOrThrow({ where: { id: orden.id } });
  }

  // ── Ganchos de pruebas ────────────────────────────────────────────────────

  /** Fuerza el resultado de los próximos cobros con un token (null = normal). */
  async forzarToken(token: string, forzar: ForzarToken): Promise<void> {
    await this.prisma.operacionSandbox.update({
      where: { id: token },
      data: { datos: { forzar } },
    });
  }

  /** La pasarela invalida un token por su cuenta (p. ej. el cliente lo borró allí). */
  async revocarToken(token: string): Promise<void> {
    await this.revocarMetodo(token);
  }

  /** Cuerpo de un webhook de la pasarela de pruebas. */
  cuerpoWebhook(tipo: TipoEventoSandbox, recurso: string, idEvento = id('evt')): string {
    return JSON.stringify({ id: idEvento, tipo, recurso, creado: new Date().toISOString() });
  }

  /** Cabeceras firmadas para un cuerpo de webhook. */
  firmar(cuerpo: string, segundos = Math.floor(Date.now() / 1000)): Record<string, string> {
    const firma = this.hmac(segundos, Buffer.from(cuerpo, 'utf8')).toString('hex');
    return { [CABECERA_FIRMA_SANDBOX]: `t=${segundos},v1=${firma}` };
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private hmac(segundos: number, cuerpo: Buffer): Buffer {
    return createHmac('sha256', this.claveFirma).update(`${segundos}.`).update(cuerpo).digest();
  }

  /** Captura una orden aprobada una sola vez (idempotente aunque lleguen dos a la vez). */
  private async capturar(orden: OperacionSandbox): Promise<OperacionSandbox> {
    const clave = `captura:${orden.id}`;
    const previa = await this.prisma.operacionSandbox.findUnique({
      where: { claveIdempotencia: clave },
    });
    if (previa) return previa;
    const monto = orden.monto ?? D(0);
    // Importe terminado en ,15: la pasarela informa 1,00 menos (prueba de revisión).
    const cobrado = centavos(monto.toFixed(2)) === 15 ? monto.sub(1) : monto;
    let token: string | null = null;
    if (orden.guardarMetodo) {
      token = id('tok');
      await this.prisma.operacionSandbox.create({
        data: {
          id: token,
          tipo: 'token',
          estado: 'activo',
          moneda: orden.moneda,
          descripcion: 'Tarjeta de prueba ···· 4242',
          relacionadoId: orden.id,
        },
      });
    }
    try {
      const cobro = await this.prisma.operacionSandbox.create({
        data: {
          id: id('cap'),
          tipo: 'cobro',
          estado: 'completado',
          referencia: orden.referencia,
          monto: cobrado,
          moneda: orden.moneda,
          relacionadoId: orden.id,
          claveIdempotencia: clave,
          datos: { token },
        },
      });
      await this.prisma.operacionSandbox.update({
        where: { id: orden.id },
        data: { relacionadoId: cobro.id },
      });
      return cobro;
    } catch (err) {
      if (!esUnicoDuplicado(err)) throw err;
      // Otra captura simultánea ganó: el token que creamos queda huérfano (sin uso).
      if (token) await this.prisma.operacionSandbox.delete({ where: { id: token } });
      return this.prisma.operacionSandbox.findUniqueOrThrow({
        where: { claveIdempotencia: clave },
      });
    }
  }

  private async resultadoCobro(cobro: OperacionSandbox): Promise<ResultadoPago> {
    const datos = (cobro.datos ?? {}) as {
      motivo?: string | null;
      invalido?: boolean;
      token?: string | null;
    };
    if (cobro.estado !== 'completado') {
      return {
        ...this.sinResultado(
          'rechazado',
          datos.motivo ?? 'La pasarela de pruebas rechazó el cobro.',
        ),
        ...(datos.invalido ? { metodoInvalido: true } : {}),
      };
    }
    let metodoGuardado: ResultadoPago['metodoGuardado'];
    if (datos.token) {
      const t = await this.prisma.operacionSandbox.findUnique({ where: { id: datos.token } });
      if (t) metodoGuardado = { token: t.id, descripcion: t.descripcion ?? 'Tarjeta de prueba' };
    }
    return {
      estado: 'aprobado',
      idCobro: cobro.id,
      montoRecibido: (cobro.monto ?? D(0)).toFixed(2),
      moneda: cobro.moneda,
      ...(metodoGuardado ? { metodoGuardado } : {}),
    };
  }

  private resultadoReembolso(r: OperacionSandbox): ResultadoReembolso {
    const motivo = (r.datos as { motivo?: string | null } | null)?.motivo ?? undefined;
    return {
      estado: r.estado === 'completado' ? 'completado' : 'fallido',
      idReembolso: r.id,
      ...(motivo ? { mensaje: motivo } : {}),
    };
  }

  private sinResultado(estado: ResultadoPago['estado'], mensaje?: string): ResultadoPago {
    return {
      estado,
      idCobro: null,
      montoRecibido: null,
      moneda: null,
      ...(mensaje ? { mensaje } : {}),
    };
  }
}
