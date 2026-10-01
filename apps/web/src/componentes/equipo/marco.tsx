import { ETIQUETAS_ROL, limitadoACartera, type SesionActual } from '@nv/shared';
import { Globe } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { iniciales } from '@/componentes/panel/avatar';
import { MarcoCuenta } from '@/componentes/panel/marco-cliente';
import { MenuCuenta } from '@/componentes/panel/menu-cuenta';
import { claseEnlaceCabecera, Sello } from '@/componentes/panel/piezas-marco';
import { colaEquipo, pendientesPorModulo } from '@/lib/equipo';
import { menuEquipo } from '@/lib/navegacion';
import { leerCentro } from '@/lib/panel-equipo';
import { BarraEquipo } from './barra';

/**
 * Marco del equipo (administración, operación y ventas): sello «Equipo» junto
 * al logo, «Ver tienda» y la persona en la cabecera; en escritorio, su tarjeta
 * con el rol y el menú por grupos con lo que espera en cada módulo; en el
 * teléfono, las pestañas de abajo (Centro, Cobros, Soporte, Asistente, Módulos).
 */
export async function MarcoEquipo({
  sesion,
  children,
}: {
  sesion: SesionActual;
  children: ReactNode;
}) {
  const { usuario, permisos } = sesion;
  const centro = await leerCentro();
  const pendientes = centro
    ? pendientesPorModulo(colaEquipo(centro, limitadoACartera(usuario.rol)))
    : {};
  const { grupos, titulos } = menuEquipo(permisos);
  const nombre = usuario.nombre.split(' ')[0]!;

  return (
    <MarcoCuenta
      sello={<Sello>Equipo</Sello>}
      acciones={
        <Link href="/" className={claseEnlaceCabecera}>
          <Globe className="size-4 text-cian" aria-hidden="true" />
          Ver tienda
        </Link>
      }
      pastilla={{ letras: iniciales(usuario.nombre), nombre, href: '/ajustes' }}
      tarjeta={{
        letras: iniciales(usuario.nombre),
        titulo: usuario.nombre,
        lineas: [ETIQUETAS_ROL[usuario.rol]],
      }}
      menu={
        <MenuCuenta
          etiqueta="Módulos del equipo"
          grupos={grupos}
          titulos={titulos}
          contadores={pendientes}
          insigniasAviso
          soloEscritorio
        />
      }
      barraInferior={
        <BarraEquipo
          cobros={permisos.includes('facturas.ver') ? (pendientes.cobros ?? 0) : null}
          soporte={permisos.includes('tickets.ver')}
          asistente={permisos.includes('asistente.usar')}
        />
      }
    >
      {children}
    </MarcoCuenta>
  );
}
