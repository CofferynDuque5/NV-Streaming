'use client';

import clsx from 'clsx';
import {
  Bot,
  CreditCard,
  FileClock,
  Headset,
  House,
  Layers,
  LayoutTemplate,
  type LucideIcon,
  Menu,
  Package,
  Receipt,
  Repeat,
  Settings,
  ShoppingBag,
  Store,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Logo } from '@/componentes/logo';
import type { ElementoNavegacion, NombreIcono } from '@/lib/navegacion';

const ICONOS: Record<NombreIcono, LucideIcon> = {
  inicio: House,
  equipo: Users,
  auditoria: FileClock,
  clientes: UserRound,
  planes: Layers,
  suscripciones: Repeat,
  cobros: CreditCard,
  soporte: Headset,
  revendedores: Store,
  editor: LayoutTemplate,
  asistente: Bot,
  saldo: Wallet,
  catalogo: Package,
  compras: ShoppingBag,
  servicios: Receipt,
  ajustes: Settings,
};

export function BarraLateral({
  elementos,
  titulo,
  pie,
}: {
  elementos: ElementoNavegacion[];
  titulo: string;
  pie: ReactNode;
}) {
  const ruta = usePathname();
  // El menú móvil se cierra solo al navegar: guarda la ruta en la que se abrió.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierta = abiertoEn === ruta;
  const setAbierta = (valor: boolean) => setAbiertoEn(valor ? ruta : null);

  const activos = elementos.filter((e) => e.href);
  const proximos = elementos.filter((e) => !e.href);
  const esActivo = (href: string) =>
    ruta === href ||
    (href !== '/admin' &&
      href !== '/revendedor' &&
      href !== '/cuenta' &&
      ruta.startsWith(`${href}/`));

  const contenido = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between px-2 pt-1">
        <Logo href="/panel" />
        <button
          type="button"
          onClick={() => setAbierta(false)}
          className="rounded-lg p-2 text-tinta-suave hover:bg-hundida lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav aria-label={titulo} className="grid gap-6 overflow-y-auto">
        <ul className="grid gap-0.5">
          {activos.map((e) => {
            const Icono = ICONOS[e.icono];
            const activo = esActivo(e.href!);
            return (
              <li key={e.etiqueta}>
                <Link
                  href={e.href!}
                  aria-current={activo ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    activo
                      ? 'bg-marca-suave font-medium text-tinta'
                      : 'text-tinta-suave hover:bg-hundida hover:text-tinta',
                  )}
                >
                  <Icono className={clsx('size-4', activo && 'text-marca')} aria-hidden="true" />
                  {e.etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
        {proximos.length > 0 && (
          <div className="grid gap-2">
            <p className="px-3 text-xs font-medium tracking-wide text-tinta-tenue uppercase">
              Próximamente
            </p>
            <ul className="grid gap-0.5">
              {proximos.map((e) => {
                const Icono = ICONOS[e.icono];
                return (
                  <li
                    key={e.etiqueta}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-tinta-tenue"
                    title={`Llega en la fase ${e.fase}`}
                  >
                    <Icono className="size-4" aria-hidden="true" />
                    <span className="flex-1">{e.etiqueta}</span>
                    <span className="rounded-md border border-borde px-1.5 text-[0.7rem]">
                      F{e.fase}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>
      <div className="mt-auto border-t border-borde pt-4">{pie}</div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="fixed top-3.5 left-3 z-40 rounded-lg p-2 text-tinta-suave hover:bg-hundida lg:hidden"
        aria-label="Abrir menú"
        aria-expanded={abierta}
      >
        <Menu className="size-5" />
      </button>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-borde bg-superficie lg:block">
        {contenido}
      </aside>
      {abierta && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setAbierta(false)}
            aria-label="Cerrar menú"
            tabIndex={-1}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-borde bg-superficie">
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
