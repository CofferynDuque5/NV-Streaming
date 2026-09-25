import type { ReactNode } from 'react';
import { Marco } from '@/componentes/panel/marco';
import { requerirSesion } from '@/lib/sesion';

export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion();
  return <Marco sesion={sesion}>{children}</Marco>;
}
