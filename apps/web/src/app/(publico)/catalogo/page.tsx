import { INFO_MONEDA, REGLAS_COBRO, serviciosTienda } from '@nv/shared';
import { Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { AvisoMayorista } from '@/componentes/tienda/aviso-mayorista';
import { CatalogoTienda } from '@/componentes/tienda/catalogo';
import { estadoDesdeUrl } from '@/componentes/tienda/catalogo-estado';
import { Migas } from '@/componentes/tienda/migas';
import { SinServicio } from '@/componentes/tienda/sin-servicio';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { nombrePais } from '@/lib/formato';
import { catalogoTienda, leerTemaPublico, mayoristaTienda, monedaTienda } from '@/lib/tienda';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = {
  title: 'Catálogo',
  description:
    'Todos los servicios autorizados de NV Streaming con precios en tu moneda. Filtra por universo, precio y duración.',
};

type Parametros = Record<string, string | string[] | undefined>;

export default async function Catalogo({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const pedida = typeof parametros.moneda === 'string' ? parametros.moneda : undefined;
  const [catalogo, moneda, tema, ubicacion] = await Promise.all([
    catalogoTienda(),
    monedaTienda(pedida),
    leerTemaPublico(),
    ubicacionVisitante(),
  ]);
  // Si la moneda sale del país de la conexión, se dice por qué (y que se puede cambiar).
  const porUbicacion =
    !pedida &&
    moneda === ubicacion.moneda &&
    (ubicacion.origen === 'conexion' || ubicacion.origen === 'idioma') &&
    ubicacion.pais !== null;
  const mayorista = await mayoristaTienda(moneda);
  const servicios = catalogo ? serviciosTienda(catalogo) : [];
  const universos = new Set(servicios.map((s) => s.servicio.categoria).filter(Boolean)).size;
  const inicial = estadoDesdeUrl(parametros);

  return (
    <div className="@container">
      <div className="contenedor grid gap-6 pt-7 pb-16">
        <Migas pasos={[{ texto: 'Inicio', href: '/' }, { texto: 'Catálogo' }]} />
        <header className="grid max-w-2xl gap-3">
          <h1 className="text-[clamp(2.1rem,6vw,3.6rem)] leading-[1.02]">
            Todo el <span className="texto-degradado">catálogo</span>
          </h1>
          {servicios.length > 0 && (
            <p className="text-tinta-suave">
              {servicios.length} {servicios.length === 1 ? 'servicio' : 'servicios'}
              {universos > 1 ? ` en ${universos} universos` : ''}. Filtra por precio, ordena como
              prefieras y agrega hasta {REGLAS_COBRO.articulosPorPedido} planes a tu carrito.
            </p>
          )}
          {porUbicacion && ubicacion.pais && (
            <p className="text-sm text-tinta-tenue">
              Te mostramos los precios en {moneda} ({INFO_MONEDA[moneda].nombre}) porque parece que
              estás en {nombrePais(ubicacion.pais)}. Puedes cambiar la moneda arriba.
            </p>
          )}
        </header>
        {mayorista && <AvisoMayorista mayorista={mayorista} />}
        {servicios.length === 0 ? (
          <div className="rounded-[1.3rem] border border-borde bg-superficie">
            <EstadoVacio icono={Layers} titulo="Estamos preparando el catálogo">
              {catalogo
                ? 'Vuelve pronto: el equipo está cargando los servicios.'
                : 'No pudimos cargar el catálogo. Recarga la página en unos segundos.'}
            </EstadoVacio>
          </div>
        ) : (
          <CatalogoTienda
            // Si la búsqueda de la cabecera cambia la URL, el catálogo empieza de nuevo.
            key={JSON.stringify(inicial)}
            servicios={servicios}
            moneda={moneda}
            mayorista={mayorista}
            inicial={inicial}
            pie={<SinServicio contacto={tema.contacto} />}
          />
        )}
      </div>
    </div>
  );
}
