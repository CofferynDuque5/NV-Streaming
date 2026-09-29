import type { BilleteraPublica, CatalogoPublico, Pagina, PedidoPublico } from '@nv/shared';
import { formatearMonto } from '@nv/shared';
import { ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ResumenCarritoCuenta } from '@/componentes/cliente/carrito';
import { monedaValida } from '@/componentes/planes';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoPedidoInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = { title: 'Carrito y pedidos' };

export default async function Carrito({
  searchParams,
}: {
  searchParams: Promise<{ moneda?: string }>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const [{ datos: catalogo }, { estado, datos: billetera }, { datos: pedidos }, filtro, ubicacion] =
    await Promise.all([
      leerApi<CatalogoPublico>('/catalogo'),
      leerApi<BilleteraPublica>('/mi/billetera'),
      leerApi<Pagina<PedidoPublico>>('/mi/pedidos?porPagina=10'),
      searchParams,
      ubicacionVisitante(),
    ]);
  const moneda = monedaValida(catalogo?.monedas ?? ['USD'], filtro.moneda, ubicacion.moneda);
  const pendiente = billetera?.pedidoPendiente ?? null;

  return (
    <>
      <CabeceraPagina
        titulo="Carrito y pedidos"
        descripcion="Junta varios planes en un solo pedido y págalos juntos, con tu saldo o por factura."
      />
      {estado === 403 && (
        <Alerta tono="info">
          Tu cuenta la gestiona tu revendedor: pídele a él tus servicios y renovaciones.
        </Alerta>
      )}
      {pendiente && (
        <Alerta tono="aviso" titulo={`Tienes el pedido ${pendiente.numero} por pagar`}>
          Págalo o cancélalo antes de hacer otro pedido.{' '}
          <Link href={`/cuenta/carrito/${pendiente.id}`} className="font-medium underline">
            Ver el pedido
          </Link>
        </Alerta>
      )}
      {estado !== 403 && (
        <Tarjeta>
          <CabeceraTarjeta titulo="Tu carrito" />
          <ResumenCarritoCuenta moneda={moneda} />
        </Tarjeta>
      )}

      <Tarjeta>
        <CabeceraTarjeta titulo="Tus pedidos" descripcion="Los 10 más recientes." />
        {!pedidos || pedidos.elementos.length === 0 ? (
          <EstadoVacio icono={ShoppingBag} titulo="Todavía no has hecho pedidos" />
        ) : (
          <ul className="divide-y divide-borde">
            {pedidos.elementos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/cuenta/carrito/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm hover:bg-elevada sm:px-6"
                >
                  <span>
                    <span className="block font-medium">
                      Pedido {p.numero} · {p.facturas.length}{' '}
                      {p.facturas.length === 1 ? 'plan' : 'planes'}
                    </span>
                    <span className="block text-tinta-suave">
                      {formatearFecha(p.creadoEn)} · {formatearMonto(p.total, p.moneda)}
                    </span>
                  </span>
                  <EstadoPedidoInsignia estado={p.estado} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
