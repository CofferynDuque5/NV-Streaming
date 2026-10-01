import { ROLES_EQUIPO } from '@nv/shared';
import type { ReactNode } from 'react';
import { MarcoEquipo } from '@/componentes/equipo/marco';
import { requerirSesion } from '@/lib/sesion';

export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion({ roles: ROLES_EQUIPO });
  return <MarcoEquipo sesion={sesion}>{children}</MarcoEquipo>;
}
