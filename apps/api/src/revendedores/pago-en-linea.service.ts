import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type {
  DeclararPagoBinanceEntrada,
  DeclararPagoPaypalEntrada,
  IntentoPagoPublico,
  LeerComprobantePaypalEntrada,
  MetodoEnLineaRevendedor,
  PagarRenovacionEnLineaEntrada,
} from '@nv/shared';
import type { ArchivoRecibido } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { D, redondear } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { CorreosBinanceService } from '../pagos-en-linea/binance/correos-binance.service.js';
import { IntentosPagoService } from '../pagos-en-linea/intentos.service.js';
import { esPasarela } from '../pagos-en-linea/pasarelas.js';
import { ComprobantesPaypalService } from '../pagos-en-linea/paypal-correo/comprobantes-paypal.service.js';
import { CorreosPaypalService } from '../pagos-en-linea/paypal-correo/correos-paypal.service.js';
import { RegistroPasarelas } from '../pagos-en-linea/registro.service.js';
import { ComprasService } from './compras.service.js';
import { bloquearRevendedor, exigirOperativo, revendedorPropio, usd } from './libro-mayor.js';
import { serviciosRenovables } from './renovables.js';

/** Horas que tiene para pagar la factura de la renovación. */
const HORAS_PARA_PAGAR = 24;
const RUTA_RETORNO = '/revendedor/pagos/retorno';

/**
 * El revendedor paga la factura de su renovación con su ficha de cliente: los
 * servicios de pago en línea solo ven esa ficha (nunca a los clientes de su
 * cartera ni a los de otros).
 */
function comoTitular(auth: ContextoAuth): ContextoAuth {
  return { ...auth, usuario: { ...auth.usuario, rol: 'cliente' } };
}

/** Las páginas de pago del cliente tienen su par en el panel del revendedor. */
function paraRevendedor(i: IntentoPagoPublico): IntentoPagoPublico {
  if (!i.urlPago) return i;
  try {
    const url = new URL(i.urlPago);
    if (url.pathname.startsWith('/cuenta/pagos/')) {
      url.pathname = url.pathname.replace('/cuenta/pagos/', '/revendedor/pagos/');
      return { ...i, urlPago: url.toString() };
    }
  } catch {
    // Una URL de la pasarela que no se puede leer se deja como vino.
  }
  return i;
}

/**
 * Renovar servicios de la cartera pagando en línea, como en las compras de los
 * clientes: Binance Pay y PayPal se confirman solos (leyendo sus avisos) y lo
 * que no cuadre pasa a revisión del equipo. Se emite una factura a nombre de la
 * ficha del revendedor; al quedar pagada, el monto entra a su saldo y los
 * servicios se renuevan solos (ver acreditarPagoRenovacion).
 */
@Injectable()
export class PagoEnLineaRevendedorService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(IntentosPagoService) private readonly intentos: IntentosPagoService,
    @Inject(CorreosBinanceService) private readonly binance: CorreosBinanceService,
    @Inject(CorreosPaypalService) private readonly paypal: CorreosPaypalService,
    @Inject(ComprobantesPaypalService) private readonly capturas: ComprobantesPaypalService,
    @Inject(ComprasService) private readonly compras: ComprasService,
  ) {}

  /** Métodos en línea activos (Binance Pay, PayPal…). Bolívares siempre a mano. */
  async metodos(): Promise<MetodoEnLineaRevendedor[]> {
    const metodos = await this.prisma.metodoCobro.findMany({
      where: { tipo: 'pasarela', activo: true, moneda: { not: 'VES' } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    return metodos
      .filter(
        (m) =>
          esPasarela(m.pasarela) &&
          this.registro.disponible(m.pasarela) &&
          this.registro.admiteMoneda(m.pasarela, m.moneda),
      )
      .map((m) => ({
        metodoCobroId: m.id,
        nombre: m.nombre,
        pasarela: m.pasarela!,
        moneda: m.moneda,
      }));
  }

  /** Emite la factura de la renovación y abre el pago en la pasarela elegida. */
  async iniciar(
    auth: ContextoAuth,
    e: PagarRenovacionEnLineaEntrada,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    exigirOperativo(await revendedorPropio(auth, this.prisma));
    const facturaId = await this.prisma.$transaction(async (tx) => {
      const propio = await revendedorPropio(auth, tx);
      const r = await bloquearRevendedor(tx, propio.id);
      exigirOperativo(r);
      const metodo = await tx.metodoCobro.findUnique({ where: { id: e.metodoCobroId } });
      if (
        !metodo ||
        !metodo.activo ||
        metodo.tipo !== 'pasarela' ||
        metodo.moneda === 'VES' ||
        !esPasarela(metodo.pasarela) ||
        !this.registro.disponible(metodo.pasarela) ||
        !this.registro.admiteMoneda(metodo.pasarela, metodo.moneda)
      ) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige un método de pago en línea disponible.', {
          metodoCobroId: ['Elige un método de pago en línea disponible.'],
        });
      }
      const encontrados = new Map(
        (await serviciosRenovables(tx, r, e.suscripcionIds)).map((x) => [
          x.suscripcion.id,
          x.servicio,
        ]),
      );
      const malos = e.suscripcionIds.filter(
        (id) => (encontrados.get(id)?.precioUsd ?? null) === null,
      );
      if (malos.length > 0) {
        throw new ErrorApp(
          409,
          'NO_RENOVABLE',
          malos.length === 1
            ? 'Uno de los servicios no está en tu cartera o no se puede renovar ahora.'
            : `${malos.length} de los servicios no están en tu cartera o no se pueden renovar ahora.`,
        );
      }
      const totalUsd = e.suscripcionIds.reduce(
        (suma, id) => suma.add(D(encontrados.get(id)!.precioUsd!)),
        D(0),
      );
      const moneda = metodo.moneda;
      const tasa = moneda === 'USD' ? D(1) : await this.tasas.tasaDe(moneda, tx);
      const total = redondear(totalUsd.mul(tasa), moneda);
      const ficha = await this.clientes.deUsuario(auth.usuario, tx);
      const n = e.suscripcionIds.length;
      const descripcion = `Renovación de ${n} ${n === 1 ? 'servicio' : 'servicios'} de tu cartera`;
      const factura = await tx.factura.create({
        data: {
          clienteId: ficha.id,
          concepto: 'renovacion',
          moneda,
          subtotal: total,
          total,
          tasa,
          totalUsd,
          venceEn: new Date(Date.now() + HORAS_PARA_PAGAR * 3600_000),
          creadoPorId: auth.usuario.id,
          lineas: {
            create: [{ descripcion, cantidad: 1, precioUnitario: total, total }],
          },
        },
      });
      await tx.pagoRenovacionRevendedor.create({
        data: {
          revendedorId: r.id,
          facturaId: factura.id,
          renovarIds: e.suscripcionIds,
          totalUsd,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'revendedor.renovacion_en_linea',
          entidad: 'factura',
          entidadId: factura.id,
          despues: {
            revendedorId: r.id,
            renovarIds: e.suscripcionIds,
            totalUsd: usd(totalUsd),
            metodo: metodo.nombre,
          },
          cliente,
        },
        tx,
      );
      return factura.id;
    });
    const intento = await this.intentos.iniciar(
      comoTitular(auth),
      facturaId,
      { metodoCobroId: e.metodoCobroId, guardarMetodo: false, aceptoAutorizacion: false },
      cliente,
      RUTA_RETORNO,
    );
    return paraRevendedor(intento);
  }

  /** Estado del pago. Si ya se pagó, la renovación se hace en el momento. */
  async obtener(auth: ContextoAuth, id: string): Promise<IntentoPagoPublico> {
    await this.exigirPropio(auth, id);
    const i = await this.intentos.obtener(comoTitular(auth), id);
    await this.renovarSiToca(i.facturaId);
    return paraRevendedor(i);
  }

  async retorno(
    auth: ContextoAuth,
    id: string,
    parametros: Record<string, string>,
    cliente: InfoCliente,
  ): Promise<IntentoPagoPublico> {
    await this.exigirPropio(auth, id);
    const i = await this.intentos.retorno(comoTitular(auth), id, parametros, cliente);
    await this.renovarSiToca(i.facturaId);
    return paraRevendedor(i);
  }

  async cancelar(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    await this.exigirPropio(auth, id);
    return paraRevendedor(await this.intentos.cancelar(comoTitular(auth), id, cliente));
  }

  async declararBinance(
    auth: ContextoAuth,
    id: string,
    e: DeclararPagoBinanceEntrada,
    cliente: InfoCliente,
  ) {
    await this.exigirPropio(auth, id);
    return paraRevendedor(await this.binance.declarar(comoTitular(auth), id, e, cliente));
  }

  async declararPaypal(
    auth: ContextoAuth,
    id: string,
    e: DeclararPagoPaypalEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ) {
    await this.exigirPropio(auth, id);
    return paraRevendedor(await this.paypal.declarar(comoTitular(auth), id, e, archivo, cliente));
  }

  async leerCapturaPaypal(
    auth: ContextoAuth,
    e: LeerComprobantePaypalEntrada,
    archivo: ArchivoRecibido | null,
  ) {
    const r = await revendedorPropio(auth, this.prisma);
    const propia = await this.prisma.pagoRenovacionRevendedor.count({
      where: { facturaId: e.facturaId, revendedorId: r.id },
    });
    if (propia === 0) throw Errores.noEncontrado('La factura');
    return this.capturas.leer(comoTitular(auth), e, archivo);
  }

  async comprobantePaypal(auth: ContextoAuth, id: string) {
    await this.exigirPropio(auth, id);
    return this.paypal.comprobantePropio(comoTitular(auth), id);
  }

  /** Solo los pagos de sus propias renovaciones en línea; lo demás responde 404. */
  private async exigirPropio(auth: ContextoAuth, intentoId: string): Promise<void> {
    const r = await revendedorPropio(auth, this.prisma);
    const i = await this.prisma.intentoPago.findFirst({
      where: {
        id: intentoId,
        cliente: { usuarioId: auth.usuario.id },
        factura: { pagoRenovacion: { revendedorId: r.id } },
      },
      select: { id: true },
    });
    if (!i) throw Errores.noEncontrado('El pago');
  }

  /** Ya acreditado y sin renovar: se renueva ahora (el trabajo en cola lo haría igual). */
  private async renovarSiToca(facturaId: string): Promise<void> {
    const p = await this.prisma.pagoRenovacionRevendedor.findUnique({
      where: { facturaId },
      select: { recarga: { select: { id: true, renovacionResultado: true } } },
    });
    if (!p?.recarga || p.recarga.renovacionResultado !== null) return;
    await this.compras.renovarPorRecarga(null, p.recarga.id, {
      ip: null,
      agenteUsuario: null,
      idPeticion: 'renovar-pago-en-linea',
    });
  }
}
