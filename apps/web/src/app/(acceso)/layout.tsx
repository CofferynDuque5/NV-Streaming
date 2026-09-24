import type { ReactNode } from 'react';
import { Logo } from '@/componentes/logo';

export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh grid-rows-[auto_1fr_auto]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,var(--nv-marca-suave),transparent),radial-gradient(40%_40%_at_100%_100%,var(--nv-acento-suave),transparent)]"
      />
      <header className="relative px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="contenido" className="relative grid place-items-center px-4 pb-12">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
      <footer className="relative px-4 py-6 text-center text-xs text-tinta-tenue">
        Protegemos tu cuenta con cifrado y verificación en dos pasos.
      </footer>
    </div>
  );
}
