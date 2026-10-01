import type { Metadata } from 'next';
import { FaltaEnlace } from '@/componentes/acceso/falta-enlace';
import { ConfirmarCorreo } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Confirmar correo', referrer: 'no-referrer' };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PanelAcceso>
      {token ? <ConfirmarCorreo token={token} /> : <FaltaEnlace titulo="Confirma tu correo" />}
    </PanelAcceso>
  );
}
