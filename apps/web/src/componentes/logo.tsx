import clsx from 'clsx';
import Link from 'next/link';

/** Isotipo NV: monograma en trazo sobre un degradado de la marca. */
export function Isotipo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={clsx('size-8 shrink-0', className)}>
      <defs>
        <linearGradient
          id="nv-degradado"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#22c8f5" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#nv-degradado)" />
      <path
        d="M8 22.5V9.5l7 13V9.5M17.5 9.5l3.5 13 3.5-13"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
        NV <span className="text-tinta-suave font-medium">Streaming</span>
      </span>
    </Link>
  );
}
