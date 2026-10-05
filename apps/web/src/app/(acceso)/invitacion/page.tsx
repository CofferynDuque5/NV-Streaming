import type { Metadata } from 'next';
import { FaltaEnlace } from '@/componentes/acceso/falta-enlace';
import { FormularioInvitacion } from '@/componentes/acceso/formularios';
import { PanelAcceso } from '@/componentes/acceso/panel-acceso';

export const metadata: Metadata = { title: 'Invitación', referrer: 'no-referrer' };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PanelAcceso>
      {token ? (
        <FormularioInvitacion token={token} />
      ) : (
        <FaltaEnlace titulo="Acepta tu invitación" />
      )}
    </PanelAcceso>
  );
}
