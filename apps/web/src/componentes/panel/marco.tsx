import { ETIQUETAS_ROL, type SesionActual } from '@nv/shared';
import type { ReactNode } from 'react';
import { Insignia } from '@/componentes/ui/insignia';
import { navegacionDe, tituloPanel } from '@/lib/navegacion';
import { BarraLateral } from './barra-lateral';
import { BotonCerrarSesion } from './boton-cerrar-sesion';

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Estructura común de los paneles: barra lateral según el rol, cabecera y contenido. */
export function Marco({ sesion, children }: { sesion: SesionActual; children: ReactNode }) {
  const { usuario } = sesion;
  const titulo = tituloPanel(usuario.rol);
  const tonoRol =
    usuario.rol === 'revendedor' ? 'acento' : usuario.rol === 'cliente' ? 'neutro' : 'marca';

  return (
    <div className="flex min-h-dvh">
      <BarraLateral
        elementos={navegacionDe(usuario.rol, sesion.permisos)}
        titulo={titulo}
        pie={
          <div className="grid gap-3">
            <div className="flex items-center gap-3 px-2">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-hundida text-sm font-semibold text-tinta-suave"
                aria-hidden="true"
              >
                {iniciales(usuario.nombre)}
              </span>
              <div className="grid min-w-0">
                <span className="truncate text-sm font-medium">{usuario.nombre}</span>
                <span className="truncate text-xs text-tinta-tenue">{usuario.correo}</span>
              </div>
            </div>
            <BotonCerrarSesion />
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-borde bg-fondo/85 pr-4 pl-14 backdrop-blur-md sm:pr-8 lg:pl-8">
          <p className="truncate text-sm font-medium text-tinta-suave">{titulo}</p>
          <Insignia tono={tonoRol}>{ETIQUETAS_ROL[usuario.rol]}</Insignia>
        </header>
        <main
          id="contenido"
          className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] content-start gap-8 px-4 py-8 sm:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
