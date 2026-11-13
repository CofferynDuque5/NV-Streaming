import type { PorPagar } from '@nv/shared';
import clsx from 'clsx';
import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PorPagarTarjeta } from '@/componentes/admin/por-pagar';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Por pagar a proveedores' };

const PLAZOS = [7, 15, 30, 60] as const;

export default async function PorPagarPagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'cuentas.ver' });
  const pedido = Number((await searchParams).dias);
  const dias = (PLAZOS as readonly number[]).includes(pedido) ? pedido : 7;
  const { datos } = await leerApi<PorPagar>(`/balance/por-pagar?dias=${dias}`);
  const conPagar = sesion.permisos.includes('cuentas.gestionar');
  const vacio = datos && datos.atrasadas.length + datos.proximas.length === 0;

  return (
    <>
      <CabeceraPagina
        titulo="Por pagar a proveedores"
        descripcion="Lo que cobran los proveedores de tus cuentas: lo atrasado y lo que vence pronto. Con «Pagado» queda registrado y el próximo cobro se corre un ciclo."
      />
      <nav className="flex flex-wrap gap-2" aria-label="Plazo">
        {PLAZOS.map((d) => (
          <Link
            key={d}
            href={`/admin/cuentas/por-pagar?dias=${d}`}
            aria-current={d === dias ? 'page' : undefined}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              d === dias
                ? 'border-cian bg-acento-suave text-tinta'
                : 'border-borde text-tinta-suave hover:text-tinta',
            )}
          >
            Próximos {d} días
          </Link>
        ))}
      </nav>
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar lo que está por pagar. Recarga la página.</Alerta>
      ) : vacio ? (
        <Tarjeta>
          <EstadoVacio icono={Wallet} titulo="Nada por pagar en este plazo">
            Las cuentas con costo y fecha de cobro del proveedor aparecen aquí.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <PorPagarTarjeta
          datos={datos}
          dias={dias}
          conPagar={conPagar}
          titulo="Cobros del proveedor"
        />
      )}
    </>
  );
}
