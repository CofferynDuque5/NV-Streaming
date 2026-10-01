import type { SesionActual } from '@nv/shared';
import { Globe, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarcoCuenta } from '@/componentes/panel/marco-cliente';
import { MenuCuenta } from '@/componentes/panel/menu-cuenta';
import { MENU_REVENDEDOR, TITULOS_MENU_REVENDEDOR } from '@/lib/navegacion';
import { iniciales } from '@/componentes/panel/avatar';
import { leerResumenRevendedor } from '@/lib/panel-revendedor';
import { BarraRevendedor } from './barra';
import { EstadoCuenta, SelloRevendedor, usd } from './panel';

const claseCabecera =
  'hidden h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta nav:inline-flex';

/**
 * Panel del revendedor con el marco de la cuenta: el sello «Revendedor» junto
 * al logo, su saldo y «Ver tienda» en la cabecera, su negocio y su nivel
 * sobre el menú, y en el teléfono las pestañas de abajo. El menú cuenta lo que
 * espera algo de él: renovaciones urgentes, accesos sin mostrar y recargas en
 * revisión.
 */
export async function MarcoRevendedor({
  sesion,
  children,
}: {
  sesion: SesionActual;
  children: ReactNode;
}) {
  const { usuario } = sesion;
  const { datos } = await leerResumenRevendedor();
  const r = datos?.revendedor;
  const titulo = r?.nombreComercial ?? usuario.nombre;

  return (
    <MarcoCuenta
      sello={<SelloRevendedor />}
      acciones={
        <>
          {r && (
            <Link href="/revendedor/saldo" className={claseCabecera}>
              <Wallet className="size-4 text-cian" aria-hidden="true" />
              Saldo <b className="text-tinta tabular-nums">{usd(r.saldoUsd)}</b>
            </Link>
          )}
          <Link href="/" className={claseCabecera}>
            <Globe className="size-4 text-cian" aria-hidden="true" />
            Ver tienda
          </Link>
        </>
      }
      pastilla={{ letras: iniciales(titulo), nombre: titulo, href: '/ajustes' }}
      tarjeta={{
        letras: iniciales(titulo),
        titulo,
        lineas: r
          ? [usuario.nombre, <EstadoCuenta key="estado" revendedor={r} />]
          : [usuario.correo, 'Revendedor'],
      }}
      menu={
        <MenuCuenta
          etiqueta="Panel de revendedor"
          grupos={MENU_REVENDEDOR}
          titulos={TITULOS_MENU_REVENDEDOR}
          contadores={
            datos
              ? {
                  renovaciones: datos.renovacionesUrgentes,
                  accesos: datos.accesosSinVer,
                  saldo: datos.revendedor.recargasEnRevision,
                }
              : {}
          }
        />
      }
      barraInferior={<BarraRevendedor urgentes={datos?.renovacionesUrgentes ?? 0} />}
    >
      {children}
    </MarcoCuenta>
  );
}
