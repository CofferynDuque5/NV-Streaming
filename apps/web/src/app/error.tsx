'use client';

import { Boton } from '@/componentes/ui/boton';

export default function ErrorGlobal({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="text-tinta-suave">
          No pudimos cargar esta página. Si el problema continúa, escribe a soporte.
        </p>
        <Boton onClick={reset}>Reintentar</Boton>
      </div>
    </main>
  );
}
