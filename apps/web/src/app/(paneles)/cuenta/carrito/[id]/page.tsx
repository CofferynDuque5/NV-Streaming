import type { PedidoPublico } from '@nv/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VistaPago } from '@/componentes/cliente/vista-pago';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { cargarPago } from '@/lib/pago';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Paga tu pedido' };

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Página del pedido: la misma vista de pago, con la factura pedida en
 * `?factura=` o, si no, la primera que se puede pagar ahora.
 */
export default async function Pedido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Parametros>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const { estado, datos: pedido } = await leerApi<PedidoPublico>(`/mi/pedidos/${id}`);
  if (estado === 404 || estado === 400) notFound();
  if (!pedido || pedido.facturas.length === 0) {
    return <Alerta tono="peligro">No pudimos cargar el pedido. Recarga la página.</Alerta>;
  }
  const pedida = pedido.facturas.find((f) => f.id === parametros.factura);
  const elegida =
    pedida ??
    pedido.facturas.find((f) => f.estado === 'emitida' && f.ultimoPago !== 'en_revision') ??
    pedido.facturas.find((f) => f.estado === 'emitida') ??
    pedido.facturas[0]!;
  const r = await cargarPago(elegida.id, 'pedido', pedido);
  if (r.estado !== 'ok') {
    return <Alerta tono="peligro">No pudimos cargar el pedido. Recarga la página.</Alerta>;
  }
  return <VistaPago datos={r.datos} />;
}
