'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CampoBuscar } from '@/componentes/revendedor/busqueda';

/** Buscador de la cuadrícula de servicios: cambia «?q=» mientras se escribe. */
export function CampoBuscarServidor({ valor }: { valor: string }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [texto, setTexto] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => {
      if (texto === (parametros.get('q') ?? '')) return;
      const p = new URLSearchParams(parametros);
      if (texto.trim()) p.set('q', texto.trim());
      else p.delete('q');
      router.replace(`?${p.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [texto, parametros, router]);
  return (
    <div className="flex min-w-0 sm:max-w-[22.5rem]">
      <CampoBuscar
        id="buscar-servicio"
        etiqueta="Buscar servicio"
        placeholder="Busca un servicio"
        valor={texto}
        onCambiar={setTexto}
      />
    </div>
  );
}
