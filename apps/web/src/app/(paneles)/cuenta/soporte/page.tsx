import { listarTicketsSchema, type Pagina, type TicketResumen } from '@nv/shared';
import { MessageCircle, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PildoraEstado } from '@/componentes/cliente/pago';
import {
  CabeceraCuenta,
  claseFila,
  claseLista,
  ESTADO_SOLICITUD,
  Vacio,
} from '@/componentes/cliente/piezas-cuenta';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
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
  const hay = (datos?.total ?? 0) > 0;

  return (
    <>
      <CabeceraCuenta
        titulo="Soporte"
        descripcion="¿Algo no funciona o tienes una duda? Escríbenos y te respondemos aquí."
        accion={
          hay && (
            <BotonEnlace href="/cuenta/soporte/nueva">
              <Plus className="size-4" aria-hidden="true" />
              Nueva solicitud
            </BotonEnlace>
          )
        }
      />
      {!datos ? (
        <Alerta tono="peligro" titulo="No pudimos cargar tus solicitudes">
          Recarga la página en unos segundos.
        </Alerta>
      ) : !hay ? (
        <Vacio
          icono={<MessageCircle className="size-5" aria-hidden="true" />}
          color="#22d3ee"
          titulo="No tienes solicitudes"
          accion={<BotonEnlace href="/cuenta/soporte/nueva">Nueva solicitud</BotonEnlace>}
        >
          Si necesitas ayuda, escríbenos.
        </Vacio>
      ) : (
        <div className={claseLista}>
          {datos.elementos.map((t) => {
            const [estado, tono] = ESTADO_SOLICITUD[t.estado];
            return (
              <Link key={t.id} href={`/cuenta/soporte/${t.id}`} className={claseFila}>
                <span
                  className="grid size-[2.375rem] place-items-center rounded-xl border border-borde-fuerte text-cian"
                  aria-hidden="true"
                >
                  <MessageCircle className="size-4" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <b className="truncate text-[0.92rem] font-semibold">{t.asunto}</b>
                  <small className="truncate text-[0.8rem] text-tinta-suave">
                    #{t.numero} · {CATEGORIA_TICKET[t.categoria]} · actualizada{' '}
                    {haceCuanto(t.actualizadoEn)}
                  </small>
                </span>
                <span className="col-start-2 sm:col-start-auto">
                  <PildoraEstado texto={estado} tono={tono} />
                </span>
              </Link>
            );
          })}
          <Paginacion
            ruta="/cuenta/soporte"
            parametros={parametros}
            pagina={filtro.pagina}
            porPagina={filtro.porPagina}
            total={datos.total}
          />
        </div>
      )}
      <p className="text-[0.8rem] text-tinta-tenue">
        Te respondemos por aquí y te avisamos por correo.
      </p>
    </>
  );
}
