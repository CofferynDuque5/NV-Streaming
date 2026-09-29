import type { ReactNode } from 'react';
import { MarcoCliente } from '@/componentes/panel/marco-cliente';
import { requerirSesion } from '@/lib/sesion';

export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  return <MarcoCliente sesion={sesion}>{children}</MarcoCliente>;
}
