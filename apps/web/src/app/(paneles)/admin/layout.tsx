import { ROLES_EQUIPO } from '@nv/shared';
import type { ReactNode } from 'react';
import { Marco } from '@/componentes/panel/marco';
import { requerirSesion } from '@/lib/sesion';

export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion({ roles: ROLES_EQUIPO });
  return <Marco sesion={sesion}>{children}</Marco>;
}
