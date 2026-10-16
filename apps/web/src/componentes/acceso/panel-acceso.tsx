import clsx from 'clsx';
import { ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

type Pestana = 'ingresar' | 'registro';

/** Lleva `siguiente` entre Ingresar y Crear cuenta para volver a la misma página. */
function conSiguiente(ruta: string, siguiente: string | undefined) {
  return siguiente ? `${ruta}?siguiente=${encodeURIComponent(siguiente)}` : ruta;
}

/** Orbe de color con un icono, como los del resto de la tienda. */
export function OrbeAcceso({
  children,
  color = 'var(--nv-marca)',
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx('orbe after:hidden', className)}
      style={{ '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * Tarjeta de las pantallas de acceso. En el teléfono empieza con una fila de
 * marca compacta (en escritorio la marca va en el panel de la izquierda) y
 * termina con la nota de seguridad.
 */
export function PanelAcceso({ children, pie }: { children: ReactNode; pie?: ReactNode }) {
  return (
    <section className="relative grid gap-5 rounded-[1.75rem] border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(7_10_24/0.97))] px-4.5 py-5.5 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.95),0_0_60px_-30px_rgb(79_141_255/0.55)] before:absolute before:inset-x-[14%] before:-top-px before:h-px before:bg-[linear-gradient(90deg,transparent,var(--nv-cian),var(--nv-rosa),transparent)] sm:px-7.5 sm:pt-7.5 sm:pb-6.5">
      <div className="flex items-center gap-3 lg:hidden">
        <OrbeAcceso className="size-11 text-[1.2rem]">
          <UserRound />
        </OrbeAcceso>
        <p className="text-[0.85rem] text-tinta-suave">
          Tu portal a todos los universos del entretenimiento.
        </p>
      </div>
      {children}
      {pie && <div className="text-center text-sm text-tinta-suave">{pie}</div>}
      <p className="text-center text-xs text-balance text-tinta-tenue">
        <ShieldCheck className="mr-1 inline size-3.5 align-[-2px] text-exito" aria-hidden="true" />
        Conexión segura. Nunca te pediremos tu contraseña por WhatsApp.
      </p>
    </section>
  );
}

/** Ingresar | Crear cuenta: enlaces entre /ingresar y /registro (conservan `siguiente`). */
export function PestanasAcceso({
  activa,
  siguiente,
}: {
  activa: Pestana;
  siguiente?: string | undefined;
}) {
  return (
    <nav
      aria-label="Acceso"
      className="grid grid-cols-2 rounded-[0.9rem] border border-borde bg-[rgb(3_5_14/0.6)] p-1"
    >
      {(
        [
          ['ingresar', '/ingresar', 'Ingresar'],
          ['registro', '/registro', 'Crear cuenta'],
        ] as const
      ).map(([clave, ruta, texto]) => (
        <Link
          key={clave}
          href={conSiguiente(ruta, siguiente)}
          aria-current={activa === clave ? 'page' : undefined}
          className="rounded-[0.7rem] px-2.5 py-2.5 text-center text-[0.92rem] font-semibold whitespace-nowrap text-tinta-suave transition-colors hover:text-tinta aria-[current=page]:bg-[linear-gradient(180deg,rgb(79_141_255/0.35),rgb(139_92_246/0.28))] aria-[current=page]:text-white aria-[current=page]:shadow-[inset_0_0_0_1px_rgb(125_170_255/0.45)]"
        >
          {texto}
        </Link>
      ))}
    </nav>
  );
}

/** Título de la tarjeta (el h1 de la página), con un orbe opcional encima. */
export function EncabezadoAcceso({
  titulo,
  descripcion,
  icono,
}: {
  titulo: string;
  descripcion?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      {icono && <div className="mb-1.5">{icono}</div>}
      <h1 id="titulo-acceso" className="text-[clamp(1.5rem,3vw,1.875rem)]">
        {titulo}
      </h1>
      {descripcion && <p className="text-[0.92rem] text-tinta-suave">{descripcion}</p>}
    </div>
  );
}

/**
 * Resultado a pantalla completa dentro de la tarjeta (correo enviado, contraseña
 * actualizada…): orbe grande, título, texto y acciones, centrados.
 */
export function ResultadoAcceso({
  titulo,
  icono,
  color,
  children,
  acciones,
}: {
  titulo: string;
  icono: ReactNode;
  color: string;
  children: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 py-1 text-center" role="status">
      <OrbeAcceso color={color} className="size-[4.5rem] text-[1.9rem]">
        {icono}
      </OrbeAcceso>
      <h1 id="titulo-acceso" className="text-[clamp(1.5rem,3vw,1.875rem)]">
        {titulo}
      </h1>
      <div className="grid max-w-[22rem] gap-3 text-[0.92rem] text-tinta-suave [&_b]:break-words [&_b]:text-tinta">
        {children}
      </div>
      {acciones && <div className="grid w-full gap-2.5 pt-1">{acciones}</div>}
    </div>
  );
}
