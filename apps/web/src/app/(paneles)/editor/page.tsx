import type { PaginaSitioResumen, ServicioPublico } from '@nv/shared';
import { Eye, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PaginasSitio } from '@/componentes/editor/paginas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Editor de la tienda' };

interface PaginaFija {
  titulo: string;
  ruta: string;
  /** Qué se cambia de ella y dónde. */
  cambia: string;
  enlace?: { texto: string; href: string };
}

/** Páginas de la tienda que no se arman con bloques: se ven aquí y se dice de dónde sale lo que muestran. */
const PAGINAS_FIJAS: PaginaFija[] = [
  {
    titulo: 'Catálogo',
    ruta: '/catalogo',
    cambia: 'Muestra los servicios activos con sus planes a la venta.',
    enlace: { texto: 'Editar servicios', href: '/editor/servicios' },
  },
  {
    titulo: 'Carrito',
    ruta: '/carrito',
    cambia: 'Toma los precios de cada plan, los combos y los cupones.',
    enlace: { texto: 'Cupones', href: '/admin/cupones' },
  },
  {
    titulo: 'Ganancias de revendedores',
    ruta: '/revendedores/ganancias',
    cambia: 'Sale del precio para revendedores de cada plan.',
    enlace: { texto: 'Precios por nivel', href: '/admin/revendedores' },
  },
  {
    titulo: 'Políticas',
    ruta: '/politicas',
    cambia: 'Texto legal fijo (versión revisada). Se cambia con una actualización del sistema.',
  },
  {
    titulo: 'Términos',
    ruta: '/terminos',
    cambia: 'Texto legal fijo. Se cambia con una actualización del sistema.',
  },
  {
    titulo: 'Privacidad',
    ruta: '/privacidad',
    cambia: 'Texto legal fijo. Se cambia con una actualización del sistema.',
  },
  {
    titulo: 'Ingresar y registro',
    ruta: '/ingresar',
    cambia: 'Usa el logo, la paleta y la temporada de «Apariencia».',
    enlace: { texto: 'Apariencia', href: '/editor/apariencia' },
  },
];

const claseBoton =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-borde px-2.5 text-xs font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta';

function FilaFija({ p }: { p: PaginaFija }) {
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 sm:px-6">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-2 font-semibold">
          {p.titulo}
          <code className="font-mono text-xs font-normal text-tinta-tenue">{p.ruta}</code>
        </span>
        <span className="text-sm text-tinta-suave">{p.cambia}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/editor/vista?ruta=${encodeURIComponent(p.ruta)}`} className={claseBoton}>
          <Eye className="size-3.5 text-cian" aria-hidden="true" /> Ver
        </Link>
        {p.enlace ? (
          <Link href={p.enlace.href} className={claseBoton}>
            {p.enlace.texto}
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center gap-1.5 px-1 text-xs text-tinta-tenue">
            <Lock className="size-3.5" aria-hidden="true" /> Fija
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Inicio del editor de la tienda: las páginas que se arman con bloques (la
 * portada y las que crees) y, abajo, todas las demás páginas de la tienda con
 * su vista previa y dónde se cambia lo que muestran.
 */
export default async function EditorTienda() {
  const sesion = await requerirSesion({ permiso: 'sitio.editar' });
  const puedePublicar = sesion.permisos.includes('sitio.publicar');
  const [{ datos: paginas }, { datos: servicios }] = await Promise.all([
    leerApi<PaginaSitioResumen[]>('/sitio/paginas'),
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
  ]);
  const activos = (servicios ?? []).filter((s) => s.activo);

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Páginas de la tienda</h1>
        <p className="text-tinta-suave">
          Todas las páginas que ve el cliente. Las de bloques se editan aquí mismo; las demás toman
          sus datos de los servicios, la apariencia o el contacto.
        </p>
      </div>

      {paginas ? (
        <PaginasSitio iniciales={paginas} puedePublicar={puedePublicar} />
      ) : (
        <Alerta tono="peligro">No pudimos cargar las páginas. Recarga la página.</Alerta>
      )}

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Páginas de cada servicio"
          descripcion="Una por servicio activo. Su logo, descripción, planes y precios se cambian en «Servicios»."
        />
        {activos.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tinta-suave sm:px-6">
            No hay servicios activos todavía.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {activos.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                {s.imagen ? (
                  <img
                    src={s.imagen.url}
                    alt=""
                    className="size-9 shrink-0 rounded-lg border border-borde bg-hundida object-contain"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-borde bg-hundida text-sm font-bold text-tinta-suave">
                    {s.nombre.slice(0, 1)}
                  </span>
                )}
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-sm">{s.nombre}</b>
                  <code className="font-mono text-xs text-tinta-tenue">/catalogo/{s.slug}</code>
                </span>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/editor/vista?ruta=${encodeURIComponent(`/catalogo/${s.slug}`)}`}
                    className={claseBoton}
                  >
                    <Eye className="size-3.5 text-cian" aria-hidden="true" /> Ver
                  </Link>
                  <Link href={`/editor/servicios/${s.id}`} className={claseBoton}>
                    Editar servicio
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Otras páginas de la tienda"
          descripcion="No se arman con bloques: aquí ves cómo quedan y de dónde sale lo que muestran."
        />
        <ul className="divide-y divide-borde">
          {PAGINAS_FIJAS.map((p) => (
            <FilaFija key={p.ruta} p={p} />
          ))}
        </ul>
      </Tarjeta>
    </>
  );
}
