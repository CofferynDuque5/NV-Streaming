import { type BilleteraPublica, formatearMonto, type PedidoPublico } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccionesPedido } from '@/componentes/cliente/carrito';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoFacturaInsignia, EstadoPedidoInsignia } from '@/componentes/ui/estado';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pedido' };

export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion({ roles: ['cliente'] });
  const { id } = await params;
  const [{ estado, datos: p }, { datos: billetera }] = await Promise.all([
    leerApi<PedidoPublico>(`/mi/pedidos/${id}`),
    leerApi<BilleteraPublica>('/mi/billetera'),
  ]);
  if (estado === 404 || estado === 400) notFound();
  if (!p) {
    return <Alerta tono="peligro">No pudimos cargar el pedido. Recarga la página.</Alerta>;
  }

  return (
    <>
      <Link
        href="/cuenta/carrito"
        className="inline-flex items-center gap-1.5 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Carrito y pedidos
      </Link>
      <CabeceraPagina
        titulo={`Pedido ${p.numero}`}
        descripcion={`Hecho el ${formatearFecha(p.creadoEn)}. Total ${formatearMonto(p.total, p.moneda)}.`}
        acciones={<EstadoPedidoInsignia estado={p.estado} />}
      />
      {p.estado === 'pagado' && (
        <Alerta tono="exito" titulo="Pedido pagado">
          Tus servicios ya están activos. Encuéntralos en Mis servicios y Mis accesos.
        </Alerta>
      )}
      {p.estado === 'pendiente' && p.pagarAlRecargar && (
        <Alerta tono="info" titulo="Esperando tu recarga">
          Cuando confirmemos tu recarga, pagamos este pedido con ese saldo. Faltan{' '}
          {formatearMonto(p.pendienteUsd, 'USD')}.
        </Alerta>
      )}
      {p.estado === 'pendiente' && billetera && (
        <Tarjeta className="px-5 py-5 sm:px-6">
          <p className="mb-3 text-sm text-tinta-suave">
            Saldo en tu billetera: {formatearMonto(billetera.saldoUsd, 'USD')}. Por pagar:{' '}
            {formatearMonto(p.pendienteUsd, 'USD')}. También puedes pagar cada factura por separado.
          </p>
          <AccionesPedido pedido={p} saldoUsd={billetera.saldoUsd} />
        </Tarjeta>
      )}
      <Tarjeta>
        <CabeceraTarjeta titulo="Facturas del pedido" descripcion="Una por cada plan." />
        <ul className="divide-y divide-borde">
          {p.facturas.map((f) => (
            <li key={f.id}>
              <Link
                href={`/cuenta/facturas/${f.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm hover:bg-elevada sm:px-6"
              >
                <span>
                  <span className="block font-medium">{f.descripcion}</span>
                  <span className="block text-tinta-suave">
                    Factura {f.numero} · {formatearMonto(f.total, f.moneda)}
                  </span>
                </span>
                <EstadoFacturaInsignia estado={f.estado} />
              </Link>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </>
  );
}
