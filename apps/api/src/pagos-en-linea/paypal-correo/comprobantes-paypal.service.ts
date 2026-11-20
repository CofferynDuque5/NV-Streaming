import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type { ComprobantePaypalLectura, LeerComprobantePaypalEntrada } from '@nv/shared';
import type { ArchivoRecibido } from '../../almacen/almacen.service.js';
import { alcanceClientes } from '../../comun/alcance.js';
import type { ContextoAuth } from '../../comun/contexto.js';
import { ErrorApp, Errores } from '../../comun/errores.js';
import { PRISMA } from '../../comun/tokens.js';
import { LimitesService } from '../../limites/limites.service.js';
import { leerComprobantePaypal, nombraAlTitular } from './comprobante-paypal.js';
import { esImagenLegible, LectorOcr } from './lector-ocr.js';

const LIMITE_LECTURAS = { maximo: 20, ventanaSegundos: 15 * 60 };
const PASARELAS_PAYPAL = ['paypal_correo', 'paypal'];

/**
 * Lee la captura de un pago de PayPal que el cliente va a subir, para llenar solo el
 * ID de transacción y el monto, y avisarle si algo no cuadra. No guarda la imagen ni
 * confirma nada: el pago se confirma con el correo de PayPal o lo revisa el equipo.
 */
@Injectable()
export class ComprobantesPaypalService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(LectorOcr) private readonly ocr: LectorOcr,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  async leer(
    auth: ContextoAuth,
    e: LeerComprobantePaypalEntrada,
    archivo: ArchivoRecibido | null,
  ): Promise<ComprobantePaypalLectura> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta la captura del pago.', {
        comprobante: ['Adjunta la captura del pago en PayPal.'],
      });
    }
    const [factura, metodo] = await Promise.all([
      this.prisma.factura.findFirst({
        where: { id: e.facturaId, cliente: alcanceClientes(auth) },
        select: { total: true, moneda: true },
      }),
      this.prisma.metodoCobro.findFirst({
        where: { id: e.metodoCobroId, activo: true, pasarela: { in: PASARELAS_PAYPAL } },
        select: { instrucciones: true },
      }),
    ]);
    if (!factura) throw Errores.noEncontrado('La factura');
    if (!metodo) throw Errores.noEncontrado('El método de pago');
    await this.limites.consumir(`paypal:leer-captura:${auth.usuario.id}`, LIMITE_LECTURAS);

    const vacio: ComprobantePaypalLectura = {
      leido: false,
      monto: null,
      moneda: null,
      idTransaccion: null,
      destinatario: null,
      avisos: ['No pudimos leer la captura. Escribe los datos a mano.'],
    };
    if (!esImagenLegible(archivo.buffer)) {
      return { ...vacio, avisos: ['Solo se pueden leer capturas en imagen (PNG, JPG o WebP).'] };
    }
    const texto = await this.ocr.texto(archivo.buffer);
    if (!texto?.trim()) return vacio;

    const leido = leerComprobantePaypal(texto);
    const avisos: string[] = [];
    const total = Number(factura.total);
    if (leido.monto !== null) {
      const otraMoneda = leido.moneda !== null && leido.moneda !== factura.moneda;
      if (otraMoneda || Math.abs(Number(leido.monto) - total) > 0.005) {
        avisos.push(
          `El monto de la captura (${leido.monto} ${leido.moneda ?? ''}) no coincide con el total de la factura (${total.toFixed(2)} ${factura.moneda}).`.replace(
            ' )',
            ')',
          ),
        );
      }
    }
    if (nombraAlTitular(texto, metodo.instrucciones) === false) {
      avisos.push(
        'La captura no muestra que el pago se haya enviado a la cuenta de PayPal indicada. Revisa que lo enviaste a la cuenta correcta.',
      );
    }
    if (!leido.idTransaccion) {
      avisos.push(
        'No encontramos el ID de transacción en la captura. Escríbelo a mano si lo tienes.',
      );
    }
    return {
      leido: true,
      monto: leido.monto,
      moneda: leido.moneda,
      idTransaccion: leido.idTransaccion,
      destinatario: leido.destinatario,
      avisos,
    };
  }
}
