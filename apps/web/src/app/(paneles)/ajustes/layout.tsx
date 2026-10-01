import type { ReactNode } from 'react';
import { Marco } from '@/componentes/panel/marco';
import { MarcoCliente } from '@/componentes/panel/marco-cliente';
import { MarcoRevendedor } from '@/componentes/revendedor/marco';
import { requerirSesion } from '@/lib/sesion';

/**
 * Perfil y seguridad: el cliente lo ve dentro de su cuenta, el revendedor
 * dentro de su panel y el equipo, en el suyo.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion();
  if (sesion.usuario.rol === 'cliente') {
    return <MarcoCliente sesion={sesion}>{children}</MarcoCliente>;
  }
  if (sesion.usuario.rol === 'revendedor') {
    return <MarcoRevendedor sesion={sesion}>{children}</MarcoRevendedor>;
  }
  return <Marco sesion={sesion}>{children}</Marco>;
}
