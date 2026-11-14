import { ETIQUETAS_ROL, limitadoACartera, type SesionActual } from '@nv/shared';
import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { LogoTienda } from '@/componentes/logo';
import { Avatar, iniciales } from '@/componentes/panel/avatar';
import { SalirCuenta } from '@/componentes/panel/menu-cuenta';
import { Sello } from '@/componentes/panel/piezas-marco';
import { colaEquipo, pendientesPorModulo } from '@/lib/equipo';
import { leerLicencia } from '@/lib/licencia';
import { destinosBuscador, menuEquipo } from '@/lib/navegacion';
import { leerCentro } from '@/lib/panel-equipo';
import { AvisoLicencia } from './aviso-licencia';
import { BarraEquipo } from './barra';
import { BotonBuscador, Buscador } from './buscador';
import { CuerpoEquipo } from './cuerpo';
import { urlGestor } from './ecosistema';
import { LateralEquipo, SCRIPT_RIEL } from './lateral';

type Permisos = SesionActual['permisos'];

/** Pendientes de cada módulo (la consulta más pesada del marco). */
async function pendientesDe(sesion: SesionActual) {
  const centro = await leerCentro();
  return centro
    ? pendientesPorModulo(colaEquipo(centro, limitadoACartera(sesion.usuario.rol)))
    : {};
}

function lateral(sesion: SesionActual, contadores: Awaited<ReturnType<typeof pendientesDe>>) {
  const { usuario, permisos } = sesion;
  const { grupos, titulos } = menuEquipo(permisos);
  return (
    <LateralEquipo
      grupos={grupos}
      titulos={titulos}
      contadores={contadores}
      persona={{
        letras: iniciales(usuario.nombre),
        nombre: usuario.nombre,
        rol: ETIQUETAS_ROL[usuario.rol],
      }}
      gestor={urlGestor()}
      marca={
        <>
          <LogoTienda compacto className="[&_img]:h-9 [&>span]:hidden" />
          <Sello>Equipo</Sello>
        </>
      }
    />
  );
}

async function LateralConPendientes({ sesion }: { sesion: SesionActual }) {
  return lateral(sesion, await pendientesDe(sesion));
}

function barra(permisos: Permisos, cobros: number) {
  return (
    <BarraEquipo
      cobros={permisos.includes('facturas.ver') ? cobros : null}
      soporte={permisos.includes('tickets.ver')}
      asistente={permisos.includes('asistente.usar')}
    />
  );
}

async function BarraConPendientes({ sesion }: { sesion: SesionActual }) {
  return barra(sesion.permisos, (await pendientesDe(sesion)).cobros ?? 0);
}

async function Licencia() {
  return <AvisoLicencia licencia={await leerLicencia()} />;
}

/**
 * Marco del equipo (administración, operación y ventas). En escritorio, un
 * menú lateral fijo a toda la altura (marca, buscador, módulos con lo que
 * espera en cada uno y la persona abajo) y el contenido a todo el ancho; en
 * el teléfono, una cabecera corta y las pestañas de abajo.
 *
 * Los pendientes y la licencia se cargan aparte (Suspense): la página se ve
 * enseguida y las cifras del menú llegan cuando están listas.
 */
export function MarcoEquipo({ sesion, children }: { sesion: SesionActual; children: ReactNode }) {
  const { usuario, permisos } = sesion;

  return (
    <div className="min-h-dvh">
      {/* Menú plegado: se aplica antes de pintar para que no salte. */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_RIEL }} />
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-superficie px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="vidrio sticky top-0 z-40 border-x-0 border-t-0 nav:hidden">
        <div className="flex min-h-14 items-center gap-2 px-4 py-2 sm:px-6">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <LogoTienda compacto className="max-sm:[&>span]:hidden" />
            <Sello>Equipo</Sello>
          </div>
          <BotonBuscador />
          <Link
            href="/ajustes"
            aria-label={`${usuario.nombre.split(' ')[0]}, perfil`}
            className="rounded-full border border-borde-fuerte p-0.5 hover:border-cian"
          >
            <Avatar letras={iniciales(usuario.nombre)} className="size-8 text-[0.8rem]" />
          </Link>
          <SalirCuenta />
        </div>
      </header>
      <CuerpoEquipo
        pantallaCompleta="/admin/sitio/"
        lateral={
          <Suspense fallback={lateral(sesion, {})}>
            <LateralConPendientes sesion={sesion} />
          </Suspense>
        }
        barraInferior={
          <Suspense fallback={barra(permisos, 0)}>
            <BarraConPendientes sesion={sesion} />
          </Suspense>
        }
      >
        <Buscador
          destinos={destinosBuscador(permisos)}
          clientes={permisos.includes('clientes.ver')}
          cuentas={permisos.includes('cuentas.ver')}
        />
        <Suspense fallback={null}>
          <Licencia />
        </Suspense>
        {children}
      </CuerpoEquipo>
    </div>
  );
}
