'use client';

import clsx from 'clsx';
import {
  Clock,
  House,
  LoaderCircle,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Tag,
  UserRound,
  UsersRound,
  Wallet,
  WalletCards,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import type { ContadorCuenta, ElementoCuenta, IconoCuenta } from '@/lib/navegacion';

const ICONOS: Record<IconoCuenta, LucideIcon> = {
  servicios: House,
  accesos: Zap,
  facturas: Tag,
  billetera: Wallet,
  carrito: ShoppingCart,
  soporte: MessageCircle,
  metodos: WalletCards,
  perfil: ShieldCheck,
  revendedor: UserRound,
  vender: Plus,
  renovaciones: Clock,
  clientes: UsersRound,
};

const QUE_CUENTA: Record<ContadorCuenta, [string, string]> = {
  accesos: ['acceso listo sin ver', 'accesos listos sin ver'],
  facturas: ['factura por pagar', 'facturas por pagar'],
  soporte: ['respuesta esperando', 'respuestas esperando'],
  renovaciones: ['renovación urgente', 'renovaciones urgentes'],
  saldo: ['recarga en revisión', 'recargas en revisión'],
};

/** Raíces de cada panel: solo se marcan en su propia página, no en las de dentro. */
const RAICES = ['/cuenta', '/revendedor'];

/**
 * Menú de la cuenta del cliente (y del panel del revendedor). En escritorio es una lista vertical con un
 * separador; en el teléfono, una fila de pastillas que se desliza y mantiene a
 * la vista la sección abierta.
 */
export function MenuCuenta({
  grupos,
  contadores,
  etiqueta = 'Mi cuenta',
  titulos = [],
}: {
  grupos: ElementoCuenta[][];
  /** Pendientes de cada contador (los que no vienen no se muestran). */
  contadores: Partial<Record<ContadorCuenta, number>>;
  etiqueta?: string;
  /** Rótulo de cada grupo en escritorio (sin rótulo, se separa con una línea). */
  titulos?: (string | null)[];
}) {
  const ruta = usePathname();
  const fila = useRef<HTMLElement>(null);
  const activo = (href: string) =>
    ruta === href || (!RAICES.includes(href) && ruta.startsWith(`${href}/`));

  // En el teléfono, la pastilla abierta queda centrada en la fila (sin mover la página).
  useEffect(() => {
    const nav = fila.current;
    const actual = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !actual || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({
      left: actual.offsetLeft - (nav.clientWidth - actual.offsetWidth) / 2,
      behavior: 'instant',
    });
  }, [ruta]);

  return (
    <nav
      ref={fila}
      aria-label={etiqueta}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 cuenta:mx-0 cuenta:grid cuenta:gap-0.5 cuenta:overflow-visible cuenta:rounded-[1.25rem] cuenta:border cuenta:border-borde cuenta:bg-[rgb(8_11_26/0.7)] cuenta:p-2 [&::-webkit-scrollbar]:hidden"
    >
      {grupos.map((grupo, i) => (
        <Fragment key={i}>
          {i > 0 &&
            grupo.length > 0 &&
            (titulos[i] ? (
              <span className="hidden px-3 pt-3 pb-1 text-[0.66rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase cuenta:block">
                {titulos[i]}
              </span>
            ) : (
              <hr className="hidden border-0 border-t border-borde cuenta:mx-1 cuenta:my-1.5 cuenta:block" />
            ))}
          {grupo.map((e) => {
            const Icono = ICONOS[e.icono];
            const n = (e.contador && contadores[e.contador]) || 0;
            const esActivo = activo(e.href);
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={esActivo ? 'page' : undefined}
                className={clsx(
                  'relative flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                  'cuenta:rounded-xl cuenta:border-0 cuenta:px-3 cuenta:py-2.5',
                  esActivo
                    ? 'border-marca bg-marca/15 text-tinta cuenta:bg-marca/15 cuenta:shadow-[inset_3px_0_0_var(--nv-marca)]'
                    : 'border-borde-fuerte text-tinta-suave hover:text-tinta cuenta:hover:bg-white/[0.04]',
                )}
              >
                <Icono className="size-[1.05rem] shrink-0" aria-hidden="true" />
                {e.etiqueta}
                {n > 0 && (
                  <em
                    className={clsx(
                      'ml-auto rounded-full px-[0.45rem] py-px font-mono text-[0.7rem] font-bold not-italic',
                      e.contador === 'renovaciones'
                        ? 'bg-aviso/20 text-[#fde68a]'
                        : 'bg-marca/20 text-[#bcd3ff]',
                    )}
                  >
                    {n}
                    <span className="sr-only"> {QUE_CUENTA[e.contador!][n === 1 ? 0 : 1]}</span>
                  </em>
                )}
              </Link>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}

/** Cerrar sesión desde la cabecera de la cuenta (en el teléfono, solo el icono). */
export function SalirCuenta() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  async function salir() {
    setCargando(true);
    await llamarApi('POST', '/auth/cierre-sesion');
    router.push('/ingresar');
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={() => void salir()}
      disabled={cargando}
      aria-busy={cargando || undefined}
      className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta disabled:opacity-60"
    >
      {cargando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="size-4" aria-hidden="true" />
      )}
      <span className="max-sm:sr-only">Cerrar sesión</span>
    </button>
  );
}
