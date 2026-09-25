import { listarTicketsSchema, type Pagina, type TicketResumen } from '@nv/shared';
import { LifeBuoy, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Paginacion } from '@/componentes/panel/paginacion';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoTicketInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { CATEGORIA_TICKET } from '@/lib/estados';
import { haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Soporte' };

export default async function MiSoporte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const { filtro, consulta, parametros } = leerFiltro(listarTicketsSchema, await searchParams, {
    porPagina: 20,
  });
  const { datos } = await leerApi<Pagina<TicketResumen>>(`/mi/tickets?${consulta}`);
  const nueva = (
    <BotonEnlace href="/cuenta/soporte/nueva">
      <Plus className="size-4" aria-hidden="true" /> Nueva solicitud
    </BotonEnlace>
  );

  return (
    <>
      <CabeceraPagina
        titulo="Soporte"
        descripcion="Escríbenos por aquí y te responderemos en esta misma conversación."
        acciones={nueva}
      />
      <Tarjeta>
        {!datos || datos.elementos.length === 0 ? (
          <EstadoVacio icono={LifeBuoy} titulo="No tienes solicitudes" accion={nueva}>
            Si algo no funciona o tienes una duda sobre un pago, abre una solicitud.
          </EstadoVacio>
        ) : (
          <>
            <ul className="divide-y divide-borde">
              {datos.elementos.map((t) => (
                <li key={t.id} className="relative px-5 py-4 hover:bg-hundida/60 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/cuenta/soporte/${t.id}`}
                      className="text-sm font-medium after:absolute after:inset-0"
                    >
                      #{t.numero} · {t.asunto}
                    </Link>
                    <EstadoTicketInsignia estado={t.estado} />
                  </div>
                  <p className="mt-1 text-sm text-tinta-suave">
                    {CATEGORIA_TICKET[t.categoria]} · actualizada {haceCuanto(t.actualizadoEn)}
                  </p>
                </li>
              ))}
            </ul>
            <Paginacion
              ruta="/cuenta/soporte"
              parametros={parametros}
              pagina={filtro.pagina}
              porPagina={filtro.porPagina}
              total={datos.total}
            />
          </>
        )}
      </Tarjeta>
    </>
  );
}
