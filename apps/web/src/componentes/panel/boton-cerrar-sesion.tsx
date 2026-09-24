'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';

export function BotonCerrarSesion({ variante = 'menu' }: { variante?: 'menu' | 'enlace' }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function salir() {
    setCargando(true);
    await llamarApi('POST', '/auth/cierre-sesion');
    router.push('/ingresar');
    router.refresh();
  }

  if (variante === 'enlace') {
    return (
      <button
        type="button"
        onClick={salir}
        disabled={cargando}
        className="font-medium text-marca hover:underline"
      >
        Cerrar sesión
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={salir}
      disabled={cargando}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-tinta-suave hover:bg-hundida hover:text-tinta disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden="true" />
      Cerrar sesión
    </button>
  );
}
