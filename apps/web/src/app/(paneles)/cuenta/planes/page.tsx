import type { CatalogoPublico, ResumenCliente } from '@nv/shared';
import { Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { Contratar } from '@/componentes/cliente/contratar';
import {
  agruparPorServicio,
  monedaValida,
  SelectorMoneda,
  TarjetaPlan,
} from '@/componentes/planes';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = { title: 'Contratar' };

export default async function ContratarPlan({
  searchParams,
}: {
  searchParams: Promise<{ moneda?: string; plan?: string }>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const [{ datos: catalogo }, { datos: resumen }, filtro, ubicacion] = await Promise.all([
    leerApi<CatalogoPublico>('/catalogo'),
    leerApi<ResumenCliente>('/mi/resumen'),
    searchParams,
    ubicacionVisitante(),
  ]);
  const monedas = catalogo?.monedas ?? ['USD'];
  // La moneda del enlace manda; luego la última que eligió, la de su perfil y la de su país.
  const moneda = monedaValida(
    monedas,
    filtro.moneda,
    ubicacion.origen === 'eleccion' ? ubicacion.moneda : null,
    resumen?.cliente.monedaPreferida,
    ubicacion.moneda,
  );
  const grupos = agruparPorServicio(catalogo?.planes ?? []);
  const contratados = new Set(
    (resumen?.suscripciones ?? [])
      .filter((s) => !['cancelada', 'vencida'].includes(s.estado))
      .map((s) => s.plan.id),
  );

  return (
    <>
      <CabeceraPagina
        titulo="Contratar un plan"
        descripcion="Elige la moneda en la que vas a pagar. El importe queda fijado en tu factura."
        acciones={<SelectorMoneda monedas={monedas} actual={moneda} ruta="/cuenta/planes" />}
      />
      {!catalogo && (
        <Alerta tono="peligro">
          No pudimos cargar el catálogo. Recarga la página en un momento.
        </Alerta>
      )}
      {catalogo && grupos.length === 0 && (
        <Tarjeta>
          <EstadoVacio icono={Layers} titulo="No hay planes disponibles ahora">
            Estamos preparando el catálogo. Te avisaremos cuando haya planes para contratar.
          </EstadoVacio>
        </Tarjeta>
      )}
      {grupos.map((g) => (
        <section key={g.servicio.id} className="grid gap-4" aria-label={g.servicio.nombre}>
          <h2 className="text-lg font-semibold">{g.servicio.nombre}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.planes.map((p) => {
              const precio = p.precios[moneda];
              return (
                <TarjetaPlan
                  key={p.id}
                  plan={p}
                  moneda={moneda}
                  destacado={p.id === filtro.plan ? 'Tu elección' : undefined}
                  accion={
                    contratados.has(p.id) ? (
                      <p className="text-sm text-tinta-suave">
                        Ya tienes este plan. Renuévalo desde Mis servicios.
                      </p>
                    ) : precio ? (
                      <Contratar
                        planId={p.id}
                        moneda={moneda}
                        precio={precio.precio}
                        abierto={p.id === filtro.plan}
                      />
                    ) : (
                      <p className="text-sm text-tinta-suave">Elige otra moneda para este plan.</p>
                    )
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
