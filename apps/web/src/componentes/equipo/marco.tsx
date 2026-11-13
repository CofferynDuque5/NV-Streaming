import { ETIQUETAS_ROL, limitadoACartera, type SesionActual } from '@nv/shared';
import { Globe, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { iniciales } from '@/componentes/panel/avatar';
import { MarcoCuenta } from '@/componentes/panel/marco-cliente';
import { claseEnlaceCabecera, Sello } from '@/componentes/panel/piezas-marco';
import { colaEquipo, pendientesPorModulo } from '@/lib/equipo';
import { destinosBuscador, menuEquipo } from '@/lib/navegacion';
import { leerLicencia } from '@/lib/licencia';
import { leerCentro } from '@/lib/panel-equipo';
import { AvisoLicencia } from './aviso-licencia';
import { BarraEquipo } from './barra';
import { BotonBuscador, Buscador } from './buscador';
import { MenuEquipo } from './menu-equipo';
import { urlGestor } from './ecosistema';

type Permisos = SesionActual['permisos'];

/** Pendientes de cada módulo (la consulta más pesada del marco). */
async function pendientesDe(sesion: SesionActual) {
  const centro = await leerCentro();
  return centro
    ? pendientesPorModulo(colaEquipo(centro, limitadoACartera(sesion.usuario.rol)))
    : {};
}

async function MenuConPendientes({ sesion }: { sesion: SesionActual }) {
  const { grupos, titulos } = menuEquipo(sesion.permisos);
  return <MenuEquipo grupos={grupos} titulos={titulos} contadores={await pendientesDe(sesion)} />;
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
 * Marco del equipo (administración, operación y ventas): sello «Equipo» junto
 * al logo, el buscador (Ctrl K), «Ver tienda» y la persona en la cabecera; en
 * escritorio, su tarjeta con el rol y el menú por grupos plegables con lo que
 * espera en cada módulo; en el teléfono, las pestañas de abajo.
 *
 * Los pendientes y la licencia se cargan aparte (Suspense): la página se ve
 * enseguida y las cifras del menú llegan cuando están listas.
 */
export function MarcoEquipo({ sesion, children }: { sesion: SesionActual; children: ReactNode }) {
  const { usuario, permisos } = sesion;
  const { grupos, titulos } = menuEquipo(permisos);
  const nombre = usuario.nombre.split(' ')[0]!;
  const gestor = urlGestor();

  return (
    <MarcoCuenta
      sello={<Sello>Equipo</Sello>}
      pantallaCompleta="/admin/sitio/"
      acciones={
        <>
          <BotonBuscador />
          <Link href="/" className={claseEnlaceCabecera}>
            <Globe className="size-4 text-cian" aria-hidden="true" />
            Ver tienda
          </Link>
          {gestor && (
            <a
              href={gestor}
              target="_blank"
              rel="noopener noreferrer"
              className={claseEnlaceCabecera}
              aria-label="NV Gestor (se abre en otra pestaña)"
            >
              <LayoutGrid className="size-4 text-violeta" aria-hidden="true" />
              NV Gestor
            </a>
          )}
        </>
      }
      pastilla={{ letras: iniciales(usuario.nombre), nombre, href: '/ajustes' }}
      tarjeta={{
        letras: iniciales(usuario.nombre),
        titulo: usuario.nombre,
        lineas: [ETIQUETAS_ROL[usuario.rol]],
      }}
      menu={
        <Suspense fallback={<MenuEquipo grupos={grupos} titulos={titulos} contadores={{}} />}>
          <MenuConPendientes sesion={sesion} />
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
    </MarcoCuenta>
  );
}
