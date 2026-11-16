import {
  aspectoServicio,
  type ComentarioEquipo,
  INFO_CATEGORIA,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
  uuidSchema,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowLeft,
  CircleHelp,
  ExternalLink,
  FileText,
  Flame,
  Images,
  Layers,
  type LucideIcon,
  MessageSquare,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioServicio, NuevoPlan } from '@/componentes/admin/catalogo';
import { ArteServicio } from '@/componentes/tienda/arte';
import { PlanesServicio } from '@/componentes/admin/editor-servicio';
import {
  CarteleraServicio,
  EstadoServicio,
  MensajeWhatsappServicio,
  ModerarComentarios,
  PortadaServicio,
  PreguntasServicio,
} from '@/componentes/admin/editor-vitrina';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearMonto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Editar servicio' };

const PESTANAS = [
  { id: 'datos', texto: 'Datos', icono: FileText },
  { id: 'precios', texto: 'Precios', icono: Tag },
  { id: 'imagenes', texto: 'Imágenes', icono: Images },
  { id: 'preguntas', texto: 'Preguntas', icono: CircleHelp },
  { id: 'comentarios', texto: 'Comentarios', icono: MessageSquare },
] as const satisfies readonly { id: string; texto: string; icono: LucideIcon }[];
type Pestana = (typeof PESTANAS)[number]['id'];

/**
 * Editor de un servicio por pestañas, como el editor anterior: Datos (estado,
 * nombre, categoría, mensaje de WhatsApp), Precios (planes), Imágenes (logo,
 * fondo y cartelera), Preguntas y Comentarios. A la derecha, cómo se ve.
 */
export default async function EditarServicio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'catalogo.gestionar' });
  const [{ id }, { pestana: pedida }] = await Promise.all([params, searchParams]);
  if (!uuidSchema.safeParse(id).success) notFound();
  const pestana: Pestana = PESTANAS.some((p) => p.id === pedida) ? (pedida as Pestana) : 'datos';

  const [rServicios, rPlanes, rProveedores, rComentarios] = await Promise.all([
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
    leerApi<PlanPublico[]>('/catalogo/planes'),
    leerApi<ProveedorPublico[]>('/catalogo/proveedores'),
    leerApi<ComentarioEquipo[]>(`/catalogo/servicios/${id}/comentarios`),
  ]);
  if (!rServicios.datos || !rPlanes.datos) {
    return (
      <Alerta tono="peligro" titulo="No pudimos cargar el servicio">
        Recarga la página en unos segundos.
      </Alerta>
    );
  }
  const servicio = rServicios.datos.find((s) => s.id === id);
  if (!servicio) notFound();
  const planes = rPlanes.datos
    .filter((p) => p.servicio.id === id)
    .sort((a, b) => a.orden - b.orden || Number(a.precioUsd) - Number(b.precioUsd));
  const comentarios = rComentarios.datos ?? [];
  const enVenta = planes.filter((p) => p.activo && p.visible);
  const desde = enVenta.length
    ? enVenta.reduce((m, p) => (Number(p.precioUsd) < Number(m.precioUsd) ? p : m))
    : null;
  const v = servicio.vitrina;
  const contador: Partial<Record<Pestana, number>> = {
    precios: planes.length,
    preguntas: v.preguntas.length,
    comentarios: comentarios.filter((c) => !c.oculto).length,
  };

  return (
    <>
      <CabeceraPagina
        titulo={servicio.nombre}
        descripcion="Edita el servicio por partes. Los interruptores se guardan al tocarlos; lo demás, con su botón."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/editor/servicios"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-borde px-3.5 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Servicios
            </Link>
            <a
              href={`/catalogo/${servicio.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-borde px-3.5 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            >
              <ExternalLink className="size-4" aria-hidden="true" /> Ver en la tienda
            </a>
          </div>
        }
      />

      <nav
        aria-label="Partes del servicio"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-borde px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {PESTANAS.map((p) => {
          const Icono = p.icono;
          const actual = p.id === pestana;
          const n = contador[p.id];
          return (
            <Link
              key={p.id}
              href={`/editor/servicios/${id}${p.id === 'datos' ? '' : `?pestana=${p.id}`}`}
              aria-current={actual ? 'page' : undefined}
              scroll={false}
              className={clsx(
                'relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold tracking-[0.06em] uppercase transition-colors',
                actual
                  ? 'border-marca text-tinta'
                  : 'border-transparent text-tinta-tenue hover:text-tinta',
              )}
            >
              <Icono className="size-4" aria-hidden="true" />
              {p.texto}
              {n ? (
                <span className="rounded-full bg-white/10 px-1.5 font-mono text-[0.7rem] tracking-normal">
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="grid items-start gap-5.5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-5.5">
          {pestana === 'datos' && (
            <>
              <Tarjeta>
                <CabeceraTarjeta
                  titulo="Estado"
                  descripcion="Si se vende, si se ve y cómo se destaca en la tienda."
                />
                <div className="p-5 sm:p-6">
                  <EstadoServicio servicio={servicio} />
                </div>
              </Tarjeta>
              <Tarjeta>
                <CabeceraTarjeta
                  titulo="Datos del servicio"
                  descripcion="Logo, nombre, categoría, descripción y los datos que pide al comprar."
                />
                <div className="p-5 sm:p-6">
                  <FormularioServicio servicio={servicio} proveedores={rProveedores.datos ?? []} />
                </div>
              </Tarjeta>
              <Tarjeta>
                <CabeceraTarjeta
                  titulo="Mensaje de WhatsApp"
                  descripcion="El texto con que el cliente pide este servicio por WhatsApp."
                />
                <div className="p-5 sm:p-6">
                  <MensajeWhatsappServicio servicio={servicio} />
                </div>
              </Tarjeta>
            </>
          )}

          {pestana === 'precios' && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Planes y precios"
                descripcion="Precio para el cliente y para revendedores (en USD; las demás monedas siguen la tasa del día). Deja vacío el de revendedor si no lo revendes."
              />
              {planes.length === 0 ? (
                <EstadoVacio icono={Layers} titulo="Este servicio todavía no tiene planes">
                  Agrega el primero abajo: por ejemplo «1 pantalla, 30 días».
                </EstadoVacio>
              ) : (
                <PlanesServicio planes={planes} />
              )}
              <div className="border-t border-borde px-5 py-4 sm:px-6">
                <NuevoPlan servicios={[servicio]} />
              </div>
            </Tarjeta>
          )}

          {pestana === 'imagenes' && (
            <>
              <Tarjeta>
                <CabeceraTarjeta
                  titulo="Fondo de la página"
                  descripcion="La escena que se ve detrás del servicio (por ejemplo, una escena del juego)."
                />
                <div className="p-5 sm:p-6">
                  <PortadaServicio servicio={servicio} />
                </div>
              </Tarjeta>
              <Tarjeta>
                <CabeceraTarjeta
                  titulo="Carriles de la página"
                  descripcion="Combos con este servicio y la cartelera de estrenos."
                />
                <div className="p-5 sm:p-6">
                  <CarteleraServicio servicio={servicio} />
                </div>
              </Tarjeta>
              <p className="text-sm text-tinta-tenue">
                El logo del servicio se cambia en la pestaña{' '}
                <Link href={`/editor/servicios/${id}`} className="text-marca hover:underline">
                  Datos
                </Link>
                .
              </p>
            </>
          )}

          {pestana === 'preguntas' && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Preguntas frecuentes"
                descripcion="Salen en la página del servicio. Las más importantes, primero."
              />
              <div className="p-5 sm:p-6">
                <PreguntasServicio servicio={servicio} />
              </div>
            </Tarjeta>
          )}

          {pestana === 'comentarios' && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Comentarios de los clientes"
                descripcion={
                  v.comentarios
                    ? 'Se publican al escribirlos. Puedes responder u ocultar cualquiera.'
                    : 'Los comentarios están cerrados: se ven los que ya hay, pero nadie puede escribir nuevos.'
                }
              />
              <ModerarComentarios comentarios={comentarios} />
            </Tarjeta>
          )}
        </div>

        <aside aria-label="Así se ve en la tienda" className="grid gap-3 xl:sticky xl:top-6">
          <p className="text-xs font-bold tracking-[0.12em] text-tinta-tenue uppercase">
            Así se ve en la tienda
          </p>
          <Tarjeta className="relative grid gap-3 overflow-hidden p-5">
            {v.portadaId && (
              <>
                <img
                  src={`/api/v1/sitio/publico/medios/${v.portadaId}`}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-35"
                />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgb(8_11_26/0.95)_70%)]" />
              </>
            )}
            <div className="relative flex items-center gap-3">
              {servicio.imagen ? (
                <img
                  src={servicio.imagen.url}
                  alt=""
                  className={clsx(
                    'size-16 shrink-0 rounded-2xl border border-borde bg-hundida object-contain',
                    v.invertirLogo && 'invert',
                  )}
                />
              ) : (
                <ArteServicio
                  {...aspectoServicio(servicio.slug, servicio.categoria, null)}
                  nombre={servicio.nombre}
                  categoria={servicio.categoria}
                  className="h-24 w-auto shrink-0"
                />
              )}
              <div className="grid min-w-0 gap-1">
                <b className="truncate text-lg">{servicio.nombre}</b>
                <span className="text-xs text-tinta-tenue">
                  {servicio.categoria ? INFO_CATEGORIA[servicio.categoria].nombre : 'Sin categoría'}
                </span>
              </div>
            </div>
            {(v.destacado || v.nuevo || !v.visible) && (
              <div className="relative flex flex-wrap gap-1.5">
                {v.destacado && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f97316] px-2 py-0.5 text-[0.7rem] font-extrabold text-white">
                    <Flame className="size-3" aria-hidden="true" /> HOT
                  </span>
                )}
                {v.nuevo && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#a78bfa] px-2 py-0.5 text-[0.7rem] font-extrabold text-white">
                    <Sparkles className="size-3" aria-hidden="true" /> NUEVO
                  </span>
                )}
                {!v.visible && <Insignia tono="aviso">Oculto en la tienda</Insignia>}
              </div>
            )}
            <p className="relative text-sm text-tinta-suave">
              {servicio.descripcion ?? (
                <span className="text-tinta-tenue">Sin descripción todavía.</span>
              )}
            </p>
            <div className="relative flex flex-wrap items-center gap-2 border-t border-borde pt-3">
              {!servicio.activo ? (
                <Insignia tono="aviso">Desactivado: no se vende</Insignia>
              ) : desde ? (
                <span className="text-sm">
                  Desde{' '}
                  <b className="text-base">{formatearMonto(String(desde.precioUsd), 'USD')}</b>
                </span>
              ) : (
                <Insignia tono="aviso">Sin planes a la venta</Insignia>
              )}
              <span className="ml-auto text-xs text-tinta-tenue">
                {enVenta.length} de {planes.length} planes a la venta
              </span>
            </div>
          </Tarjeta>
          <ul className="grid gap-1 text-xs text-tinta-tenue">
            <li>{v.preguntas.length} preguntas propias</li>
            <li>{v.cartelera.length} pósters en la cartelera</li>
            <li>{v.combos ? 'Con carril de combos' : 'Sin carril de combos'}</li>
            <li>
              {contador.comentarios ?? 0} comentarios visibles
              {v.comentarios ? '' : ' (cerrados)'}
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}
