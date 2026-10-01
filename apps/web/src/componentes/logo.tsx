import clsx from 'clsx';
import Link from 'next/link';

/** Isotipo NV: el monograma del logo oficial (archivo de 3 KB, nítido hasta 42 px). */
export function Isotipo({ className }: { className?: string }) {
  return (
    <img
      src="/marca/isotipo.webp"
      alt=""
      width={32}
      height={32}
      decoding="async"
      className={clsx('size-8 shrink-0 rounded-[9px] bg-black ring-1 ring-white/10', className)}
    />
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={clsx('inline-flex items-center gap-2.5 rounded-lg', className)}
      aria-label="NV Streaming, inicio"
    >
      <Isotipo />
      <span className="font-titulo text-[1.05rem] font-semibold tracking-tight whitespace-nowrap">
        NV <span className="font-medium text-tinta-suave max-[400px]:sr-only">Streaming</span>
      </span>
    </Link>
  );
}

/** Logo de la tienda: la marca NV y «Streaming · Nathan y Valeryn». */
/** `compacto`: en el teléfono, sin el subtítulo (deja sitio a un sello al lado). */
export function LogoTienda({ className, compacto }: { className?: string; compacto?: boolean }) {
  return (
    <Link
      href="/"
      className={clsx('inline-flex shrink-0 items-center gap-2 rounded-lg', className)}
      aria-label="NV Streaming, inicio"
    >
      <img
        src="/marca/marca.webp"
        alt=""
        width={62}
        height={48}
        decoding="async"
        className="h-10 w-auto nav:h-12"
      />
      <span className="grid leading-none">
        <b
          className={clsx(
            'font-titulo text-[0.95rem] font-extrabold tracking-[0.28em] nav:text-[1.05rem]',
            compacto && 'max-[26.25rem]:tracking-[0.2em]',
          )}
        >
          STREAMING
        </b>
        <span
          className={clsx(
            'texto-degradado mt-1 text-[0.58rem] font-bold tracking-[0.2em] whitespace-nowrap',
            compacto && 'max-sm:hidden',
          )}
        >
          NATHAN Y VALERYN
        </span>
      </span>
    </Link>
  );
}
