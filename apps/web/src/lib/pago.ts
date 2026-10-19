import type {
  BilleteraPublica,
  CatalogoPublico,
  FacturaDetalle,
  MetodoCobroPublico,
  OpcionesPagoEnLinea,
  PedidoPublico,
} from '@nv/shared';
import type { DatosPago } from '@/componentes/cliente/vista-pago';
import { leerApi } from './api-servidor';
import { monedaAdmitePagoEnLinea } from './pagos-en-linea';

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);

type Resultado = { estado: 'ok'; datos: DatosPago } | { estado: 'no-existe' | 'error' };

/**
 * Lee todo lo que necesita la página de pago de una factura: su pedido, el
 * saldo y, si se puede pagar ahora, los métodos del panel y los de pago en línea.
 */
export async function cargarPago(
  facturaId: string,
  desde: DatosPago['desde'],
  pedidoLeido?: PedidoPublico,
): Promise<Resultado> {
  const { estado, datos: factura } = await leerApi<FacturaDetalle>(`/mi/facturas/${facturaId}`);
  if (estado === 404 || estado === 400) return { estado: 'no-existe' };
  if (!factura) return { estado: 'error' };

  const porPagar =
    factura.estado === 'emitida' && !factura.pagoEnRevision && !factura.gestionadaPorRevendedor;
  const [pedido, billetera, manuales, catalogo, enLinea] = await Promise.all([
    pedidoLeido
      ? Promise.resolve({ datos: pedidoLeido })
      : factura.pedidoId
        ? leerApi<PedidoPublico>(`/mi/pedidos/${factura.pedidoId}`)
        : Promise.resolve({ datos: null }),
    leerApi<BilleteraPublica>('/mi/billetera'),
    porPagar
      ? leerApi<MetodoCobroPublico[]>(`/mi/metodos-cobro?moneda=${factura.moneda}`)
      : Promise.resolve({ datos: null }),
    porPagar ? leerApi<CatalogoPublico>('/catalogo') : Promise.resolve({ datos: null }),
    porPagar && monedaAdmitePagoEnLinea(factura.moneda)
      ? leerApi<OpcionesPagoEnLinea>(`/mi/facturas/${factura.id}/pago-en-linea`)
      : Promise.resolve({ datos: null }),
  ]);

  return {
    estado: 'ok',
    datos: {
      factura,
      pedido: pedido.datos,
      billetera: billetera.datos,
      // Solo los manuales (con comprobante); los de pasarela llegan por pago en línea.
      manuales: (manuales.datos ?? []).filter((m) => (m.tipo ?? 'manual') === 'manual'),
      enLinea: enLinea.datos?.opciones.length ? enLinea.datos : null,
      monedas: catalogo.datos?.monedas ?? [],
      maxMb: MAX_MB,
      desde,
      ahora: Date.now(),
    },
  };
}
