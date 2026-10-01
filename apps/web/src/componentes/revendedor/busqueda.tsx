'use client';

import { LoaderCircle, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

/** Campo de búsqueda con la lupa (también para filtrar en el navegador). */
export function CampoBuscar({
  id,
  etiqueta,
  placeholder,
  valor,
  onCambiar,
  buscando = false,
  name,
}: {
  id: string;
  etiqueta: string;
  placeholder: string;
  valor: string;
  onCambiar: (v: string) => void;
  buscando?: boolean;
  name?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 basis-[18rem]">
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-tinta-suave"
        aria-hidden="true"
      />
      <input
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-[0.875rem] border border-borde-fuerte bg-[rgb(10_14_32/0.9)] pr-10 pl-10 text-[0.95rem] text-tinta outline-none placeholder:text-tinta-tenue focus-visible:border-cian"
      />
      {buscando && (
        <LoaderCircle
          className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-cian"
          aria-label="Buscando"
        />
      )}
    </div>
  );
}

/**
 * Búsqueda de la cartera mientras se escribe (la API filtra y ordena). Sin
 * JavaScript es un formulario normal que se envía con Intro.
 */
export function BuscarClientes({ inicial }: { inicial: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [texto, setTexto] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const espera = useRef<number | undefined>(undefined);
  // La última búsqueda que mandó este campo a la URL.
  const [enviada, setEnviada] = useState(inicial);
  const [previa, setPrevia] = useState(inicial);

  // «Limpiar búsqueda» o volver atrás cambian la búsqueda sin escribir: el campo la sigue.
  if (inicial !== previa) {
    setPrevia(inicial);
    if (inicial !== enviada) {
      setTexto(inicial);
      setEnviada(inicial);
    }
  }

  function buscar(v: string) {
    setTexto(v);
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => {
      const q = new URLSearchParams(parametros);
      q.delete('pagina');
      if (v.trim()) q.set('busqueda', v.trim());
      else q.delete('busqueda');
      setEnviada(v.trim());
      iniciar(() => router.replace(`${ruta}${q.size ? `?${q}` : ''}`, { scroll: false }));
    }, 300);
  }

  return (
    <form
      role="search"
      action={ruta}
      className="flex min-w-0 flex-1 basis-[18rem]"
      onSubmit={(e) => e.preventDefault()}
    >
      <CampoBuscar
        id="buscar-clientes"
        name="busqueda"
        etiqueta="Buscar cliente"
        placeholder="Nombre, cédula, correo o WhatsApp"
        valor={texto}
        onCambiar={buscar}
        buscando={pendiente}
      />
      {['filtro', 'orden', 'dir'].map((k) =>
        parametros.get(k) ? (
          <input key={k} type="hidden" name={k} value={parametros.get(k) ?? ''} />
        ) : null,
      )}
    </form>
  );
}
