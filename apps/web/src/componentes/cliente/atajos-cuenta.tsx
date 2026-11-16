import { Headphones, KeyRound, type LucideIcon, Store, Wallet } from 'lucide-react';
import Link from 'next/link';

interface Atajo {
  href: string;
  titulo: string;
  texto: string;
  icono: LucideIcon;
  /** Degradado del icono. */
  fondo: string;
}

const ATAJOS: Atajo[] = [
  {
    href: '/cuenta/billetera',
    titulo: 'Recargar saldo',
    texto: 'Paga todo en un toque',
    icono: Wallet,
    fondo: 'linear-gradient(135deg,#8b5cf6,#e879f9)',
  },
  {
    href: '/cuenta/accesos',
    titulo: 'Mis accesos',
    texto: 'Códigos y enlaces',
    icono: KeyRound,
    fondo: 'linear-gradient(135deg,#22d3ee,#4f8dff)',
  },
  {
    href: '/catalogo',
    titulo: 'Explorar la tienda',
    texto: 'Streaming, música e IA',
    icono: Store,
    fondo: 'linear-gradient(135deg,#f97316,#f43f5e)',
  },
  {
    href: '/cuenta/soporte',
    titulo: 'Soporte',
    texto: 'Te respondemos rápido',
    icono: Headphones,
    fondo: 'linear-gradient(135deg,#22c55e,#14b8a6)',
  },
];

/** Atajos del inicio de la cuenta: lo que más se usa, a un toque. */
export function AtajosCuenta() {
  return (
    <nav aria-label="Atajos" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {ATAJOS.map(({ href, titulo, texto, icono: Icono, fondo }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 rounded-2xl border border-borde bg-[rgb(10_14_32/0.6)] p-3.5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-borde-fuerte"
        >
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)] transition-transform group-hover:scale-105"
            style={{ backgroundImage: fondo }}
          >
            <Icono className="size-5" aria-hidden="true" />
          </span>
          <span className="grid min-w-0">
            <b className="truncate text-sm">{titulo}</b>
            <span className="truncate text-xs text-tinta-tenue">{texto}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
