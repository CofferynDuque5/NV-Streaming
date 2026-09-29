import type { ReactNode } from 'react';
import { Marco } from '@/componentes/panel/marco';
import { MarcoCliente } from '@/componentes/panel/marco-cliente';
import { requerirSesion } from '@/lib/sesion';

/** Perfil y seguridad: el cliente lo ve dentro de su cuenta; el resto, en su panel. */
export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion();
  if (sesion.usuario.rol === 'cliente') {
    return <MarcoCliente sesion={sesion}>{children}</MarcoCliente>;
  }
  return <Marco sesion={sesion}>{children}</Marco>;
}
