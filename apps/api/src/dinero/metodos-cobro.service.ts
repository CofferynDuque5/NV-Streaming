import { Inject, Injectable } from '@nestjs/common';
import type { MetodoCobro, Moneda, PrismaClient } from '@nv/db';
import {
  INFO_PASARELA,
  type MetodoCobroEntrada,
  type MetodoCobroPublico,
  type Pasarela,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { esPasarela, pasarelaAdmiteMoneda } from '../pagos-en-linea/pasarelas.js';

/** Tamaño máximo de la imagen QR de un método de cobro. */
const QR_MAX_MB = 3;

export const metodoPublico = (m: MetodoCobro): MetodoCobroPublico => ({
  id: m.id,
  nombre: m.nombre,
  moneda: m.moneda,
  instrucciones: m.instrucciones,
  requiereReferencia: m.requiereReferencia,
  referenciaUltimos4: m.tipo === 'pasarela' ? false : m.referenciaUltimos4,
  qrId: m.qrId,
  tipo: m.tipo === 'pasarela' ? 'pasarela' : 'manual',
  pasarela: esPasarela(m.pasarela) ? m.pasarela : null,
  activo: m.activo,
  orden: m.orden,
});

@Injectable()
export class MetodosCobroService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
  ) {}

  async listar(
    filtro: { moneda?: Moneda; soloActivos?: boolean; tipo?: 'manual' | 'pasarela' } = {},
  ): Promise<MetodoCobroPublico[]> {
    const filas = await this.prisma.metodoCobro.findMany({
      where: {
        ...(filtro.moneda ? { moneda: filtro.moneda } : {}),
        ...(filtro.soloActivos ? { activo: true } : {}),
        ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      },
      orderBy: [{ moneda: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
    });
    return filas.map(metodoPublico);
  }

  async crear(
    auth: ContextoAuth,
    entrada: MetodoCobroEntrada,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    const datos = validarTipo(entrada);
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.metodoCobro.create({ data: datos });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.creado',
          entidad: 'metodo_cobro',
          entidadId: m.id,
          despues: metodoPublico(m) as object,
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    entrada: Partial<MetodoCobroEntrada>,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.metodoCobro.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El método de cobro');
      const combinado = validarTipo({
        moneda: entrada.moneda ?? antes.moneda,
        tipo: entrada.tipo ?? (antes.tipo === 'pasarela' ? 'pasarela' : 'manual'),
        pasarela:
          entrada.pasarela !== undefined
            ? entrada.pasarela
            : entrada.tipo === 'manual'
              ? null
              : esPasarela(antes.pasarela)
                ? antes.pasarela
                : null,
        requiereReferencia: entrada.requiereReferencia ?? antes.requiereReferencia,
        referenciaUltimos4: entrada.referenciaUltimos4 ?? antes.referenciaUltimos4,
      });
      const m = await tx.metodoCobro.update({
        where: { id },
        data: {
          ...entrada,
          tipo: combinado.tipo,
          pasarela: combinado.pasarela,
          requiereReferencia: combinado.requiereReferencia,
          referenciaUltimos4: combinado.referenciaUltimos4,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.actualizado',
          entidad: 'metodo_cobro',
          entidadId: id,
          antes: metodoPublico(antes) as object,
          despues: metodoPublico(m) as object,
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }

  /**
   * Pone (o cambia) la imagen QR del método. La imagen entra en la biblioteca de
   * imágenes del sitio (almacén, carpeta «medios») y se sirve públicamente,
   * porque el cliente la ve al pagar. La anterior no se borra: queda en la biblioteca.
   */
  async ponerQr(
    auth: ContextoAuth,
    id: string,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige la imagen del QR.', {
        archivo: ['Elige la imagen del QR en JPG, PNG o WebP.'],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.metodoCobro.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El método de cobro');
      const guardado = await this.almacen.guardarImagen(tx, archivo, auth.usuario.id, QR_MAX_MB);
      const medio = await tx.medio.create({
        data: {
          archivoId: guardado.id,
          textoAlternativo: `QR de ${antes.nombre}`.slice(0, 200),
          subidoPorId: auth.usuario.id,
        },
      });
      const m = await tx.metodoCobro.update({ where: { id }, data: { qrId: medio.id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.qr_puesto',
          entidad: 'metodo_cobro',
          entidadId: id,
          antes: { qrId: antes.qrId },
          despues: { qrId: medio.id, sha256: guardado.sha256, tamano: guardado.tamano },
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }

  /** Quita el QR del método. La imagen sigue en la biblioteca (no se borra nada). */
  async quitarQr(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
  ): Promise<MetodoCobroPublico> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.metodoCobro.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El método de cobro');
      const m = await tx.metodoCobro.update({ where: { id }, data: { qrId: null } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_cobro.qr_quitado',
          entidad: 'metodo_cobro',
          entidadId: id,
          antes: { qrId: antes.qrId },
          despues: { qrId: null },
          cliente,
        },
        tx,
      );
      return metodoPublico(m);
    });
  }
}

/**
 * Reglas de un método de pago en línea: la pasarela es obligatoria solo si el
 * tipo es "pasarela", la moneda debe admitirla esa pasarela y nunca VES (el
 * bolívar sigue con pago manual). Un método en línea no pide referencia.
 */
function validarTipo<
  T extends {
    moneda: Moneda;
    tipo: 'manual' | 'pasarela';
    pasarela: Pasarela | null;
    requiereReferencia: boolean;
    referenciaUltimos4: boolean;
  },
>(e: T): T {
  const invalido = (campo: string, mensaje: string) =>
    new ErrorApp(400, 'DATOS_INVALIDOS', mensaje, { [campo]: [mensaje] });
  if (e.tipo === 'manual') {
    if (e.pasarela) throw invalido('pasarela', 'Un método manual no lleva pasarela.');
    // Pedir los 4 últimos dígitos implica pedir la referencia.
    return e.referenciaUltimos4 ? { ...e, requiereReferencia: true } : e;
  }
  if (!e.pasarela) throw invalido('pasarela', 'Elige la pasarela del pago en línea.');
  if (e.moneda === 'VES') {
    throw invalido(
      'moneda',
      'Los pagos en bolívares siguen siendo manuales: ninguna pasarela cobra en VES.',
    );
  }
  if (!pasarelaAdmiteMoneda(e.pasarela, e.moneda)) {
    throw invalido(
      'moneda',
      `${INFO_PASARELA[e.pasarela].nombre} no cobra en ${e.moneda}. Monedas: ${INFO_PASARELA[e.pasarela].monedas.join(', ')}.`,
    );
  }
  return { ...e, requiereReferencia: false, referenciaUltimos4: false };
}
