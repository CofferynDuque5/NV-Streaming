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
