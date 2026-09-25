import type { Cifrador } from '../../comun/cripto.js';
import type { Adaptador, ContextoEntrega, ResultadoEntrega } from './tipos.js';

/** Contexto del cifrado de cada código de inventario. */
export const contextoCodigo = (id: string) => `codigo:${id}`;
/** Contexto de la huella de los códigos (una para todo el inventario: los repetidos se rechazan entre planes). */
export const CONTEXTO_HUELLA_CODIGO = 'codigos-inventario';

/**
 * Códigos de inventario (tarjetas o códigos del distribuidor oficial): toma el
 * código disponible más antiguo del plan con `FOR UPDATE SKIP LOCKED` dentro de
 * la transacción de la entrega, así dos entregas simultáneas nunca reciben el
 * mismo. Sin existencias, la entrega queda pendiente, se avisa al equipo y se
 * reintenta (también al subir un lote nuevo). El código nunca se registra.
 */
export class AdaptadorCodigos implements Adaptador {
  readonly adaptador = 'codigos' as const;
  readonly transaccional = true;

  constructor(private readonly cifrador: Cifrador) {}

  async entregar(ctx: ContextoEntrega): Promise<ResultadoEntrega> {
    const tx = ctx.tx;
    if (!tx) throw new Error('El adaptador de códigos necesita la transacción de la entrega.');
    const [libre] = await tx.$queryRaw<{ id: string; codigo_cifrado: string }[]>`
      SELECT id, codigo_cifrado FROM codigos_inventario
      WHERE plan_id = ${ctx.plan.id}::uuid AND estado = 'disponible'
        AND (vence_en IS NULL OR vence_en > now())
      ORDER BY creado_en, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    if (!libre) {
      return {
        estado: 'pendiente',
        reintentar: true,
        aviso: 'sin_stock',
        mensaje: 'No hay códigos disponibles de este plan: se entregará al subir un lote nuevo.',
      };
    }
    const codigo = this.cifrador.descifrar(libre.codigo_cifrado, contextoCodigo(libre.id));
    await tx.codigoInventario.update({
      where: { id: libre.id },
      data: { estado: 'entregado', entregaId: ctx.entrega.id, entregadoEn: new Date() },
    });
    return {
      estado: 'entregada',
      datosCliente: { codigo },
      codigoInventarioId: libre.id,
    };
  }
}
