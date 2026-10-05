import type { ReactNode } from 'react';
import { MarcoRevendedor } from '@/componentes/revendedor/marco';
import { requerirSesion } from '@/lib/sesion';

export default async function Layout({ children }: { children: ReactNode }) {
  const sesion = await requerirSesion({ roles: ['revendedor'] });
  return <MarcoRevendedor sesion={sesion}>{children}</MarcoRevendedor>;
}
