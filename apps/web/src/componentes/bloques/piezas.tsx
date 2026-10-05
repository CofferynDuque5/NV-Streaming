/**
 * Piezas comunes de los bloques del sitio (sección, encabezado, botones,
 * imágenes) y los datos que reciben. Sin APIs del servidor ni estado: sirven
 * igual para la web y para la vista previa del editor.
 */
import {
  type BotonSitio as DatosBoton,
  type CatalogoPublico,
  type ContactoSitio,
  type FondoBloque,
  type IconoSitio,
  type MetodoPagoSitio,
  type Moneda,
  urlMedio,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  Clock,
  CreditCard,
  Gift,
  Globe,
  Headset,
  Heart,
  ImageIcon,
  Layers,
  LockKeyhole,
  type LucideIcon,
  MessageCircle,
  MonitorPlay,
  ShieldCheck,
  Star,
  Store,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { MonedaMayorista } from '@/componentes/planes-mayoristas';
import { clasesBoton } from '@/componentes/ui/boton';
import type { VistaMayorista } from '@/lib/revendedor-publico';
import { EnlaceSitio } from './texto-enriquecido';

export const ICONOS: Record<IconoSitio, LucideIcon> = {
  insignia: BadgeCheck,
  tarjeta: CreditCard,
  candado: LockKeyhole,
  soporte: Headset,
  billetera: Wallet,
  capas: Layers,
  tienda: Store,
  escudo: ShieldCheck,
  rayo: Zap,
  reloj: Clock,
  estrella: Star,
  corazon: Heart,
  globo: Globe,
  pantalla: MonitorPlay,
  regalo: Gift,
  personas: Users,
  mensaje: MessageCircle,
  check: CircleCheck,
};

/** Color de cada icono de beneficio (para su orbe). */
export const COLOR_ICONO: Record<IconoSitio, string> = {
  insignia: '#5b98ff',
  tarjeta: '#22d3ee',
  candado: '#a78bfa',
  soporte: '#22c55e',
  billetera: '#a855f7',
  capas: '#5b98ff',
  tienda: '#e879f9',
  escudo: '#22d3ee',
  rayo: '#22d3ee',
  reloj: '#f59e0b',
  estrella: '#f59e0b',
  corazon: '#ec4899',
  globo: '#5b98ff',
  pantalla: '#5b98ff',
  regalo: '#e879f9',
  personas: '#22c55e',
  mensaje: '#22c55e',
  check: '#22c55e',
};

/** Datos que necesitan los bloques de la tienda. Todo sale de la API. */
export interface ContextoBloques {
  /** Ruta de la página, para los enlaces del selector de moneda. */
  ruta: string;
  catalogo: CatalogoPublico | null;
  moneda: Moneda;
  /**
   * Precios de un revendedor con sesión. Se calcula en cada petición y solo
   * llega aquí por propiedades: el contenido en caché del sitio no lo incluye.
   */
  mayorista?: { vista: VistaMayorista; moneda: MonedaMayorista } | null;
  /** Métodos de cobro activos del panel (nombre y moneda). */
  metodosPago?: MetodoPagoSitio[];
  /** Contacto y redes configurados en el editor visual. */
  contacto?: ContactoSitio | null;
  /** En la vista previa del editor, los bloques sin datos muestran un aviso. */
  vistaPrevia?: boolean;
}

export const contenedor = 'mx-auto w-full max-w-[1240px] px-4 @2xl:px-6';

export function Seccion({
  bloque,
  children,
  className,
}: {
  bloque: { ancla?: string | null | undefined; fondo?: FondoBloque | undefined };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={bloque.ancla ?? undefined} className={clsx('scroll-mt-40', className)}>
      {children}
    </section>
  );
}

/** Encabezado de sección: etiqueta en órbita, título grande y subtítulo. */
export function Encabezado({
  etiqueta,
  titulo,
  subtitulo,
  centrado,
  accion,
  oculto,
}: {
  etiqueta?: string | null | undefined;
  titulo: string;
  subtitulo?: string | null | undefined;
  centrado?: boolean;
  /** Enlace a la derecha (p. ej. «Ver catálogo»). */
  accion?: ReactNode;
  /** Solo para lectores de pantalla. */
  oculto?: boolean;
}) {
  if (oculto) return <h2 className="sr-only">{titulo}</h2>;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div
        className={clsx(
          'grid max-w-2xl justify-items-start gap-2.5',
          centrado && 'mx-auto justify-items-center text-center',
        )}
      >
        {etiqueta && <span className="etiqueta-orbita">{etiqueta}</span>}
        <h2 className="text-[clamp(1.45rem,3.6vw,2.15rem)]">{titulo}</h2>
        {subtitulo && <p className="text-[0.95rem] text-tinta-suave">{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}

/** Enlace de texto de la derecha de un encabezado. */
export function EnlaceVerTodo({ href, children }: { href: string; children: ReactNode }) {
  return (
    <EnlaceSitio
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-cian hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </EnlaceSitio>
  );
}

export function BotonSitio({
  boton,
  variante = 'primario',
  tamano = 'lg',
  flecha,
  className,
}: {
  boton: DatosBoton | null | undefined;
  variante?: 'primario' | 'secundario' | 'enlace';
  tamano?: 'md' | 'lg';
  flecha?: boolean;
  className?: string;
}) {
  if (!boton?.texto || !boton.enlace) return null;
  if (variante === 'enlace') {
    return (
      <EnlaceSitio
        href={boton.enlace}
        className={clsx(
          'inline-flex h-12 items-center px-2 font-medium text-tinta underline decoration-borde-fuerte underline-offset-[6px] hover:decoration-cian',
          className,
        )}
      >
        {boton.texto}
      </EnlaceSitio>
    );
  }
  return (
    <EnlaceSitio href={boton.enlace} className={clasesBoton(variante, tamano, className)}>
      {boton.texto}
      {flecha && <ArrowRight className="size-4" aria-hidden="true" />}
    </EnlaceSitio>
  );
}

/** Título con una parte resaltada con el degradado de la marca. */
export function TituloConDestacado({
  titulo,
  destacado,
}: {
  titulo: string;
  destacado?: string | null | undefined;
}) {
  const i = destacado ? titulo.indexOf(destacado) : -1;
  if (!destacado || i < 0) return titulo;
  return (
    <>
      {titulo.slice(0, i)}
      <span className="texto-degradado">{destacado}</span>
      {titulo.slice(i + destacado.length)}
    </>
  );
}

/** Imagen de la biblioteca con proporción fija: no mueve la página al cargar. */
export function ImagenMedio({
  medioId,
  alt,
  proporcion,
  prioritaria,
  className,
}: {
  medioId: string | null | undefined;
  alt: string;
  proporcion: string;
  prioritaria?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx('relative w-full overflow-hidden bg-hundida', className)}
      style={{ aspectRatio: proporcion.replace(':', ' / ') }}
    >
      {medioId ? (
        <img
          src={urlMedio(medioId)}
          alt={alt}
          loading={prioritaria ? 'eager' : 'lazy'}
          fetchPriority={prioritaria ? 'high' : 'auto'}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-tinta-tenue">
          <ImageIcon className="size-8" aria-hidden="true" />
          <span className="sr-only">Sin imagen</span>
        </span>
      )}
    </div>
  );
}

/**
 * Bloque que hoy no tiene datos: en la web no se muestra nada; en la vista
 * previa del editor, un aviso para que el equipo sepa por qué.
 */
export function SinDatos({
  contexto,
  titulo,
  motivo,
}: {
  contexto: ContextoBloques;
  titulo: string;
  motivo: string;
}) {
  if (!contexto.vistaPrevia) return null;
  return (
    <div className={clsx(contenedor, 'py-6')}>
      <div className="grid gap-1 rounded-2xl border border-dashed border-borde-fuerte px-5 py-4 text-sm">
        <b>{titulo}</b>
        <p className="text-tinta-suave">
          {motivo} En el sitio público no se muestra hasta que los haya.
        </p>
      </div>
    </div>
  );
}
