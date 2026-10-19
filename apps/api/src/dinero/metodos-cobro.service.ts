import { Inject, Injectable } from '@nestjs/common';
import type { MetodoCobro, Moneda, PrismaClient } from '@nv/db';
import {
  INFO_PASARELA,
  type MetodoCobroEntrada,
  type MetodoCobroPublico,
  type Pasarela,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { esPasarela, pasarelaAdmiteMoneda } from '../pagos-en-linea/pasarelas.js';

export const metodoPublico = (m: MetodoCobro): MetodoCobroPublico => ({
  id: m.id,
  nombre: m.nombre,
  moneda: m.moneda,
  instrucciones: m.instrucciones,
  requiereReferencia: m.requiereReferencia,
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
      });
      const m = await tx.metodoCobro.update({
        where: { id },
        data: {
          ...entrada,
          tipo: combinado.tipo,
          pasarela: combinado.pasarela,
          requiereReferencia: combinado.requiereReferencia,
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
  },
>(e: T): T {
  const invalido = (campo: string, mensaje: string) =>
    new ErrorApp(400, 'DATOS_INVALIDOS', mensaje, { [campo]: [mensaje] });
  if (e.tipo === 'manual') {
    if (e.pasarela) throw invalido('pasarela', 'Un método manual no lleva pasarela.');
    return e;
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
  return { ...e, requiereReferencia: false };
}
